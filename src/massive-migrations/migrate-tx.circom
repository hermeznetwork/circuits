include "../../node_modules/circomlib/circuits/smt/smtprocessor.circom";
include "../../node_modules/circomlib/circuits/mux1.circom";

include "../lib/hash-state.circom"
include "./migrate-tx-states.circom"

/**
 * Process migration transaction
 * @input oldStateRoot - {Field} - old state root
 * @input accFeeIn - {Field} - initial accumulated fee
 * @input inIdx - {Uint48} - old last merkle tree index assigned
 * @input idx - {Uint48} - merkle tree index to receive migration balance
 * @input migrationAmount - {Uint192} - amount to migrate and insert into the state tree
 * @input userFee - {Uint16} - user fee selector
 * @input ay - {Field} - ay of the receiver leaf
 * @input sign - {Bool} - sign of the receiver leaf
 * @input ethAddr - {Uint160} - ethAddr of the receiver leaf
 * @input tokenID - {Uint32} - tokenID of the receiver leaf
 * @input isOld0 - {Bool} - flag to require old key - value
 * @input oldKey - {Uint48} - old key of the receiver leaf
 * @input oldValue - {Field} - old value of the receiver leaf
 * @input nonce - {Uint40} - nonce of the sender leaf
 * @input balance - {Uint192} - balance of the sender leaf
 * @input exitBalance - {Uint192} - account exit balance
 * @input accumulatedHash - {Field} - received transactions hash chain
 * @input siblings[nLevels + 1] - {Array(Field)} - siblings merkle proof of the sender leaf
 * @output newStateRoot - {Field} - new state root
 * @output accFeeOut - {Field} - final accumulated fee
 * @output outIdx - {Uint48} - new last merkle tree index assigned
 */
template MigrateTx(nLevels) {
    // Phases rollup-main circuit:
      // A: Compute migration transaction states
      // B: Build old and new states
      // C: Processor new state tree
      // D: assign outputs

    signal input oldStateRoot;
    signal input accFeeIn;
    signal input inIdx;
    signal input isNop;

    // 0 means INSERT, any other value means UPDATE
    signal input idx;
    // state vars
    signal input migrateAmount;
    signal input userFee;
    signal input ay;
    signal input sign;
    signal input ethAddr;
    signal input tokenID;
    signal input isOld0;
    signal input oldKey;
    signal input oldValue;

    // aux signals to compute hash states
    signal input nonce;
    signal input balance;
    signal input exitBalance;
    signal input accumulatedHash;
    signal input siblings[nLevels+1];

    signal output newStateRoot;
    signal output accFeeOut;
    signal output outIdx;

	var i;

    // A: Compute migration transaction states
    component txStates = MigrationTxStates();
    txStates.userFee <== userFee;
    txStates.migrateAmount <== migrateAmount;
    txStates.idx <== idx;
    txStates.inIdx <== inIdx;
    txStates.isNop <== isNop;

    // B: Build old and new states
    
    // oldState Packer
    component oldStHash = HashState();
    oldStHash.tokenID <== tokenID; // same as source rollup
    oldStHash.nonce <== nonce;
    oldStHash.sign <== sign; // same as source rollup
    oldStHash.balance <== balance;
    oldStHash.ay <== ay; // same as source rollup
    oldStHash.ethAddr <== ethAddr; // same as source rollup
    oldStHash.exitBalance <== exitBalance;
    oldStHash.accumulatedHash <== accumulatedHash;

    // processor old key would be taken from:
      // UPDATE: 'idx' to update, chosen by the coordinator
      // INSERT: 'oldKey' which is set by the coordinator
    component selectedOldKey = Mux1();
    selectedOldKey.c[0] <== idx;
    selectedOldKey.c[1] <== oldKey;
    selectedOldKey.s <== txStates.isInsert;

    // processor new key would be taken from:
      // UPDATE: 'idx' to update, chosen by the coordinator
      // INSERT: 'outIdx' computed by migration-states
    component selectedNewKey = Mux1();
    selectedNewKey.c[0] <== idx;
    selectedNewKey.c[1] <== txStates.outIdx;
    selectedNewKey.s <== txStates.isInsert;

    // processor state hash would be taken from:
      // UPDATE: state hash is selected from oldState Packer
      // INSERT: 'oldValue' which is set by the coordinator
    component selectedOldValue = Mux1();
    selectedOldValue.c[0] <== oldStHash.out;
    selectedOldValue.c[1] <== oldValue;
    selectedOldValue.s <== txStates.isInsert;    
    
    // new state hash: nonce
      // UPDATE: old nonce
      // INSERT: 0
    component selectedNonce = Mux1();
    selectedNonce.c[0] <== nonce;
    selectedNonce.c[1] <== 0;
    selectedNonce.s <== txStates.isInsert;

    // new state hash: balance
      // UPDATE: depositAmount + balance
      // INSERT: depositAmount
    component selectedBalance = Mux1();
    selectedBalance.c[0] <== txStates.depositAmount + balance;
    selectedBalance.c[1] <== txStates.depositAmount;
    selectedBalance.s <== txStates.isInsert;

    // new state hash: exitBalance
      // UPDATE: old exitBlance
      // INSERT: 0
    component selectedExitBalance = Mux1();
    selectedExitBalance.c[0] <== exitBalance;
    selectedExitBalance.c[1] <== 0;
    selectedExitBalance.s <== txStates.isInsert;

    // new state hash: accumulatedHash
      // UPDATE: old accumulatedHash
      // INSERT: 0
    component selectedAccHash = Mux1();
    selectedAccHash.c[0] <== accumulatedHash;
    selectedAccHash.c[1] <== 0;
    selectedAccHash.s <== txStates.isInsert;

    // newState1 hash state
    component newStHash = HashState();
    newStHash.tokenID <== tokenID;
    newStHash.nonce <== selectedNonce.out;
    newStHash.sign <== sign;
    newStHash.balance <== selectedBalance.out;
    newStHash.ay <== ay;
    newStHash.ethAddr <== ethAddr;
    newStHash.exitBalance <== selectedExitBalance.out;
    newStHash.accumulatedHash <== selectedAccHash.out;

    // C: Processor new state tree
    component processor = SMTProcessor(nLevels+1);
    processor.oldRoot <== oldStateRoot;
    for (i = 0; i < nLevels + 1; i++) {
        processor.siblings[i] <== siblings[i];
    }
    processor.oldKey <== selectedOldKey.out;
    processor.oldValue <== selectedOldValue.out;
    processor.isOld0 <== isOld0;
    processor.newKey <== selectedNewKey.out;
    processor.newValue <== newStHash.out;
    processor.fnc[0] <== txStates.isInsert*(1 - isNop);
    processor.fnc[1] <== (1 - txStates.isInsert)*(1 - isNop);

    // D: assign outputs
    accFeeOut <== accFeeIn + txStates.fee2Charge;
    newStateRoot <== processor.newRoot;
    outIdx <== txStates.outIdx;
}
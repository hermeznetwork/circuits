include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/smt/smtprocessor.circom";
include "../../node_modules/circomlib/circuits/smt/smtverifier.circom";
include "../../node_modules/circomlib/circuits/sha256/sha256.circom";

include "../lib/hash-state.circom"
include "../lib/hash-state-old.circom";

/**
 * Upgrade state root account step
 * @param nLevels - merkle tree depth
 * @input maxIdx - {Field} - maximum account to update
 * @input inIdx - {Uint48} - account to update
 * @input inStateRoot - {Field} - initial state root
 * @input tokenID - {Uint32} - tokenID of the account to update
 * @input nonce - {Uint40} - nonce of the account to update
 * @input sign - {Bool} - sign of the account to update
 * @input balance - {Uint192} - balance of the account to update
 * @input ay - {Field} - ay of the account to update
 * @input ethAddr - {Uint160} - ethAddr of the account to update
 * @input siblingsState[nLevels + 1] - {Array(Field)} - siblings merkle proof account to update
 * @output outIdx - {Uint48} - next account to update
 * @output outStateRoot - {Field} - state root after account updating
 */
template UpgradeStep(nLevels) {
    signal input maxIdx;

    signal input inIdx;
    signal output outIdx;

    signal input inStateRoot;
    signal output outStateRoot;

    signal private input tokenID;
    signal private input nonce;
    signal private input sign;
    signal private input balance;
    signal private input ay;
    signal private input ethAddr;
    signal private input siblingsState[nLevels + 1];

    var i;

    // checks: inIdx > maxIdx
    component reachMaxIdx = GreaterThan(40);
    reachMaxIdx.in[0] <== inIdx;
    reachMaxIdx.in[1] <== maxIdx;

    // compute old account state hash
    ////////
    component oldAccountState = HashStateOld();
    oldAccountState.tokenID <== tokenID;
    oldAccountState.nonce <== nonce;
    oldAccountState.sign <== sign;
    oldAccountState.balance <== balance;
    oldAccountState.ay <== ay;
    oldAccountState.ethAddr <== ethAddr;

    // compute new account state hash
    ////////
    component newAccountState = HashState();
    newAccountState.tokenID <== tokenID;
    newAccountState.nonce <== nonce;
    newAccountState.sign <== sign;
    newAccountState.balance <== balance;
    newAccountState.ay <== ay;
    newAccountState.ethAddr <== ethAddr;
    newAccountState.exitBalance <== 0;
    newAccountState.accumulatedHash <== 0;

    // process new state root
    ////////
    component processor = SMTProcessor(nLevels+1) ;
    processor.oldRoot <== inStateRoot;
    for (i = 0; i < nLevels + 1; i++) {
        processor.siblings[i] <== siblingsState[i];
    }
    processor.oldKey <== inIdx;
    processor.oldValue <== oldAccountState.out;
    processor.isOld0 <== 0;
    processor.newKey <== inIdx;
    processor.newValue <== newAccountState.out;
    processor.fnc[0] <== 0;
    processor.fnc[1] <== 1 - reachMaxIdx.out;

    outStateRoot <== processor.newRoot;
    outIdx <== inIdx + (1 - reachMaxIdx.out);
}
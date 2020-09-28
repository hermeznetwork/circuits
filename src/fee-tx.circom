include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/mux4.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/mux1.circom";
include "../node_modules/circomlib/circuits/smt/smtprocessor.circom";

include "./lib/hash-state.circom";

/**
 * Process transaction to receive accumulated fees
 * @param nLevels - merkle tree depth
 */
template FeeTx(nLevels){
    signal input oldStateRoot;

    signal input feePlanToken;
    signal input feeIdx;
    signal input accFee;

    // state signals
    signal input tokenID;
    signal input nonce;
    signal input sign;
    signal input balance;
    signal input ay;
    signal input ethAddr;
    signal input siblings[nLevels+1];

    signal output newStateRoot;

    var i;

    // feeIdx is zero
    component feeIdxIsZero = IsZero();
    feeIdxIsZero.in <== feeIdx;

    // check tokenID matches
    component tokenIDChecker = ForceEqualIfEnabled();
    tokenIDChecker.in[0] <== feePlanToken;
    tokenIDChecker.in[1] <== tokenID;
    tokenIDChecker.enabled <== 1 - feeIdxIsZero.out;

    // compute state processor
    signal p_fnc0;
    signal p_fnc1;

    p_fnc0 <== 0;
    p_fnc1 <== 1 - feeIdxIsZero.out;

    // old state Packer
    ////////
    component oldStFeePck = HashState();
    oldStFeePck.tokenID <== tokenID;
    oldStFeePck.nonce <== nonce;
    oldStFeePck.sign <== sign;
    oldStFeePck.balance <== balance;
    oldStFeePck.ay <== ay;
    oldStFeePck.ethAddr <== ethAddr;

    // new state packer
    ////////
    component newStFeePck = HashState();
    newStFeePck.tokenID <== tokenID;
    newStFeePck.nonce <== nonce;
    newStFeePck.sign <== sign;
    newStFeePck.balance <== accFee + balance;
    newStFeePck.ay <== ay;
    newStFeePck.ethAddr <== ethAddr;

    // smt processor (only updates or nops)
    ////////
    component processor = SMTProcessor(nLevels + 1) ;
    processor.oldRoot <== oldStateRoot;
    for (i = 0; i < nLevels + 1; i++) {
        processor.siblings[i] <== siblings[i];
    }
    processor.oldKey <== feeIdx;
    processor.oldValue <== oldStFeePck.out;
    processor.isOld0 <== 0;
    processor.newKey <== feeIdx;
    processor.newValue <== newStFeePck.out;
    processor.fnc[0] <== p_fnc0;
    processor.fnc[1] <== p_fnc1;

    newStateRoot <== processor.newRoot;
}
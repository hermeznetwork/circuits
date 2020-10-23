include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/mux4.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/mux1.circom";
include "../node_modules/circomlib/circuits/smt/smtprocessor.circom";

include "./lib/hash-state.circom";

/**
 * Fee transaction takes the accumulate fees for a given 'tokenID' and updates the recipient where the fees are wanted to be paid.
 * It checks account existence with the old state root, process the account update and compute the new state root
 * @param nLevels - merkle tree depth
 * @input oldStateRoot - {Field} - old state root
 * @input feePlanToken - {Uint32} -token identifier of fees accumulated
 * @input feeIdx - {Uint48} - merkle tree index to receive fees
 * @input accFee - {Uint192} - accumulated fees to transfer
 * @input tokenID - {Uint32} - tokenID of leaf feeIdx
 * @input nonce - {Uint40} - nonce of leaf feeIdx
 * @input sign - {Bool} - sign of leaf feeIdx
 * @input balance - {Uint192} - balance of leaf feeIdx
 * @input ay - {Field} - ay of leaf feeIdx
 * @input ethAddr - {Uint160} - ethAddr of leaf feeIdx
 * @input siblings[nLevels + 1]- {Array[Field]} - siblings merkle proof
 * @output newStateRoot - {Field} - new state root
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
    // fee transaction could be processed as a NOP tx if fee idx receiver is set to 0
    component feeIdxIsZero = IsZero();
    feeIdxIsZero.in <== feeIdx;

    // check tokenID matches
    // 'tokenID' must match between fee accumulated and recipient account, 'feeIdx', in order to not update wrong recipients
    component tokenIDChecker = ForceEqualIfEnabled();
    tokenIDChecker.in[0] <== feePlanToken;
    tokenIDChecker.in[1] <== tokenID;
    tokenIDChecker.enabled <== 1 - feeIdxIsZero.out;

    // Table processor functions:
    // | func[0] | func[1] | Function |
    // |:-------:|:-------:|:--------:|
    // |    0    |    0    |   NOP    |
    // |    0    |    1    |  UPDATE  |
    // |    1    |    0    |  INSERT  |
    // |    1    |    1    |  DELETE  |

    // compute state processor
    // only UPDATE and NOP processor functions are used
    // it will be set depending on index fee receiver 'feeIdx'
    signal p_fnc0; // func[0] smt processor
    signal p_fnc1; // func[1] smt processor

    p_fnc0 <== 0;
    p_fnc1 <== 1 - feeIdxIsZero.out; // UPDATE only if receiver idx account is different than 0

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
    newStFeePck.balance <== accFee + balance; // old balance + fee accumulated
    newStFeePck.ay <== ay;
    newStFeePck.ethAddr <== ethAddr;

    // smt processor
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

    // newRoot is set once the account that has received the fees has been updated
    newStateRoot <== processor.newRoot;
}
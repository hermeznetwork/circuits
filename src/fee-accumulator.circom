include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/mux4.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

/**
 * Accumulate single step fee value
 * Fee is accumulated if token identifier matches
 * @input tokenID - {Uint32} - token identifier to update
 * @input feePlanTokenID - {Uint32} - assigned token identifier to the fee plan
 * @input isSelectedIn - {Bool} - determines if the token has been already selected
 * @input fee2Charge - {Field} - fee to accumulate
 * @input accFeeIn - {Uint192} - fee accumulated before checking token match
 * @output isSelectedOut - {Bool} - determines if the token has been matched
 * @output accFeeOut - {Uint192} - fee accumulated before after token match
 */
template FeeAccumulatorStep(){
    signal input tokenID;
    signal input feePlanTokenID;
    signal input isSelectedIn;
    signal input fee2Charge;
    signal input accFeeIn;

    signal output isSelectedOut;
    signal output accFeeOut;

    // check if tokenID matches 'feePlanTokenID'
    component isEqual = IsEqual();
    isEqual.in[0] <== tokenID;
    isEqual.in[1] <== feePlanTokenID;

    // tokenID has been selected if:
    // - it was already found, then signal 'isSelectedIn' will be 1
    // - it has been a match between 'tokenID' and 'feePlanTokenID'
    isSelectedOut <== 1 - (1 - isEqual.out)*(1 - isSelectedIn);

    // accumulate 'fee2Charge' if:
    // - tokenID matches
    // - tokenID was not selected before
    component mux = Mux1();
    mux.c[0] <== accFeeIn;
    mux.c[1] <== accFeeIn + fee2Charge;
    mux.s <== isEqual.out*(1 - isSelectedIn);
    mux.out ==> accFeeOut;
}

/**
 * Updates the fees accumulated by each transaction given its applied fee
 * @param maxFeeTx - absolute maximum of fee transactions
 * @input tokenID -	{Uint32} - token identifier transaction
 * @input fee2Charge - {Uint192} - fee charged
 * @input feePlanTokenID[maxFeeTx] - {Array[Uint32]} - all tokens eligible to accumulate fees
 * @input accFeeIn[maxFeeTx] - {Array[Uint192]} - initial fees accumulated
 * @output accFeeOut[maxFeeTx] - {Array[Uint192]} -	final fees accumulated
 */
template FeeAccumulator(maxFeeTx){
    signal input tokenID;
    signal input fee2Charge;
    signal input feePlanTokenID[maxFeeTx];
    signal input accFeeIn[maxFeeTx];

    signal output accFeeOut[maxFeeTx];

    component chain[maxFeeTx];

    var i;

    // Steps:
    // find the position on the array 'feePlanTokenID[maxFeeTx]' where its element matches the current transaction 'tokenID'
    // - if no match is found, no fee would be accumuated and 'accFeeIn[0...maxFeeTx]' == 'accFeeOut[0...maxFeeTx]'
    // - if a match id found:
        // - accumulate the fee 'fee2Charge' inside its position 'i' on 'accFeeOut[i]'
        // - avoid accumulate fees once the match is found

    for (i = 0; i < maxFeeTx; i++){
         chain[i] = FeeAccumulatorStep();
        if (i == 0){
            chain[i].isSelectedIn <== 0;
        } else {
            chain[i].isSelectedIn <== chain[i-1].isSelectedOut;
        }
        chain[i].tokenID <== tokenID;
        chain[i].fee2Charge <== fee2Charge;
        chain[i].feePlanTokenID <== feePlanTokenID[i];
        chain[i].accFeeIn <== accFeeIn[i];
    }

    for (i = 0; i < maxFeeTx; i++ ){
        accFeeOut[i] <== chain[i].accFeeOut;
    }
}

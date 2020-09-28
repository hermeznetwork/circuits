include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/mux4.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

/**
 * Accumulate single fee value
 */
template FeeAccumulatorStep(){
    signal input tokenID;
    signal input feePlanTokenID;
    signal input isSelectedIn;
    signal input fee2Charge;
    signal input accFeeIn;

    signal output isSelectedOut;
    signal output accFeeOut;

    component isEqual = IsEqual();
    isEqual.in[0] <== tokenID;
    isEqual.in[1] <== feePlanTokenID;

    isSelectedOut <== 1 - (1 - isEqual.out)*(1 - isSelectedIn);

    component mux = Mux1();
    mux.c[0] <== accFeeIn;
    mux.c[1] <== accFeeIn + fee2Charge;
    mux.s <== isEqual.out*(1 - isSelectedIn);
    mux.out ==> accFeeOut;
}

/**
 * Accumulate fees
 * @param maxFeeTx - absolute maximum of fee transactions
 */
template FeeAccumulator(maxFeeTx){
    signal input tokenID;
    signal input fee2Charge;
    signal input feePlanTokenID[maxFeeTx];
    signal input accFeeIn[maxFeeTx];

    signal output accFeeOut[maxFeeTx];

    component chain[maxFeeTx];

    var i;

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

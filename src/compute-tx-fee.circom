include "../node_modules/circomlib/circuits/bitify.circom";
include "./lib/fee-table-selector.circom";

/**
 * Computes the fee to apply in a transaction
 * further information could be found in https://docs.hermez.io/#/developers/protocol/hermez-protocol/protocol?id=user 
 * @input amount - {Uint192} - transaction amount
 * @input userFee - {Uint8} - fee selector signed by the user
 * @input feeApplies - {Bool} - determines if fee has to be computed
 * @output fee2Charge - {Uint192} - effective fee amount
 */
template ComputeTxFee(){
    
    signal input amount;
    signal input feeSelector;
    signal input feeApplies;

    signal output fee2Charge;
    
    // chosen 'bitsShiftPrecision = 79', which is the minimum value to have precision for each fee applied
    var bitsShiftPrecision = 79;

    // select feeFactor given the feeSelector
    // note that feeFactor to apply is already shifted left 79 bits
    component feeTableSelector = FeeTableSelector();
    feeTableSelector.feeSel <== feeSelector*feeApplies;

    // feeShifted = amount * (feeFactor << 79)
    component n2bFee = Num2Bits(192 + bitsShiftPrecision);
    n2bFee.in <== amount * feeTableSelector.feeOut;

    var test = amount * feeTableSelector.feeOut;

    // fee2Charge = feeShifted >> 79 
    component b2nFee = Bits2Num(192);
    for (var i = 0; i < 192; i++) {
        b2nFee.in[i] <== n2bFee.out[i + bitsShiftPrecision];
    }
    b2nFee.out ==> fee2Charge;

    // log(n2bFee.in);
    // log(test);
}
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

include "./lib/fee-table-selector.circom";

/**
 * Compute new balances from sender and receiver
 */
template BalanceUpdater() {
    signal input oldStBalanceSender;
    signal input oldStBalanceReceiver;
    signal input amount;
    signal input loadAmount;
    signal input feeSelector;
    signal input onChain;
    signal input nop;
    signal input nullifyLoadAmount;
    signal input nullifyAmount;

    signal output newStBalanceSender;
    signal output newStBalanceReceiver;
    signal output update2;
    signal output fee2Charge;

    signal feeApplies;          // 1 if fee applies (L2), 0 if not applies (L1)
    signal underflowOk;         // 1 if sender balance is > 0
    signal effectiveAmount1;
    signal effectiveAmount2;
    signal effectiveAmount3;
    signal effectiveLoadAmount1;
    signal effectiveLoadAmount2;

    // fee applies only on L2 tx and is not a NOP tx
    feeApplies <== (1-onChain)*(1-nop);

    // compute fee2Charge
    ////////
    var bitsShiftPrecision = 79;

    component feeTableSelector = FeeTableSelector();
    feeTableSelector.feeSel <== feeSelector*feeApplies;

    component n2bFee = Num2Bits(192 + bitsShiftPrecision);
    n2bFee.in <== amount * feeTableSelector.feeOut;

    component b2nFee = Bits2Num(192);
    for (var i = 0; i < 192; i++) {
        b2nFee.in[i] <== n2bFee.out[i + bitsShiftPrecision];
    }
    b2nFee.out ==> fee2Charge;

    // compute effective loadAmount and amount
    ////////
    effectiveLoadAmount1 <== loadAmount*onChain;
    effectiveLoadAmount2 <== effectiveLoadAmount1*(1 - nullifyLoadAmount);
    effectiveAmount1 <== amount*(1-nop);
    effectiveAmount2 <== effectiveAmount1*(1 - nullifyAmount);

    // check balance sender
    ////////
    component n2bSender = Num2Bits(193);

    n2bSender.in <== (1<<192) + oldStBalanceSender + effectiveLoadAmount2 - effectiveAmount2 - fee2Charge;

    underflowOk <== n2bSender.out[192];

    // if not L1 and not underflowOk => error
    (1 - underflowOk)*(1 - onChain) === 0;

    effectiveAmount3 <== underflowOk*effectiveAmount2;

    // if !txOk then return 0
    newStBalanceSender <== oldStBalanceSender + effectiveLoadAmount2 - effectiveAmount3 - fee2Charge;
    newStBalanceReceiver <== oldStBalanceReceiver + effectiveAmount3;

    // NOP processor 2 if original amount to transfer is 0
    component effectiveAmountIsZero = IsZero();
    effectiveAmountIsZero.in <== effectiveAmount1;

    update2 <== (1 - effectiveAmountIsZero.out);
}
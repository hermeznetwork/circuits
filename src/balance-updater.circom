include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

include "./compute-fee.circom";

/**
 * Compute new balances from sender and receiver
 * Checks if there is enough balance in the sender account to do the transfer to the receiver account
 * @input oldStBalanceSender - {Field} - initial sender balance
 * @input oldStBalanceReceiver - {Field} - initial receiver balance
 * @input amount - {Uint192} - amount to transfer from L2 to L2
 * @input loadAmount - {Uint192} - amount to deposit from L1 to L2
 * @input feeSelector - {Uint8} - user selector fee
 * @input onChain - {Bool} - determines if the transaction is L1 or L2
 * @input nop- {Bool} - determines if the transfer amount and fees are considered 0
 * @input nullifyLoadAmount - {Bool} - determines if loadAmount is considered to be 0
 * @input nullifyAmount - {Bool} - determines if amount is considered to be 0
 * @output newStBalanceSender - {Uint192} - final balance sender
 * @output newStBalanceReceiver - {Uint192} - final balance receiver
 * @output isP2Nop - {Bool} - determines if processor 2 performs a NOP function
 * @output fee2Charge - {Uint192} - effective transaction fee
 * @output isAmountNullified - {Bool} - determines if the amount is nullified
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
    signal output isP2Nop;
    signal output fee2Charge;
    signal output isAmountNullified;

    signal underflowOk;         // 1 if sender balance is > 0
    signal effectiveAmount1;    // original amount to transfer. Set to 0 if tx is NOP.
    signal effectiveAmount2;    // tx amount once nullifyAmount is applied
    signal effectiveAmount3;    // tx amount once checked if sender has enough balance(only on L1 tx, L2 will trigger an error)
    signal effectiveLoadAmount1; // original loadAmount to load (only applies to L1 tx)
    signal effectiveLoadAmount2; // tx loadAmount once nullifyLoadAmount is applied

    // compute fee2Charge
    ////////
    component computeFee = ComputeFee();
    computeFee.feeSel <== feeSelector;
    computeFee.amount <== amount;
    computeFee.applyFee <== (1-onChain)*(1-nop); // fee applies only on L2 tx and if it is not a NOP tx

    computeFee.feeOut ==> fee2Charge;

    // compute effective loadAmount and amount
    ////////
    effectiveLoadAmount1 <== loadAmount*onChain;
    effectiveLoadAmount2 <== effectiveLoadAmount1*(1 - nullifyLoadAmount);
    effectiveAmount1 <== amount*(1-nop);
    effectiveAmount2 <== effectiveAmount1*(1 - nullifyAmount);

    // check balance sender
    ////////
    // Overflow check:
    // - smart contract does not allow deposits over 2^128
    // - smart contract does not allow transfers over 2^192
    // - it is assumed that maximum balance accumulated would be 2^192
    // - therefore, 192 - 128 = 64 --> meaning that 2^64 transactions has to be done to get overflow
    // - it is assumed overflow is not feasible
    // Underflow check:
    // - assuming 192 bits as maximum allowed balance for a single account
    // - bit 193 is set to 1
    // - if account has not enough balance, bit 193 will be 0

    component n2bSender = Num2Bits(193);
    n2bSender.in <== (1<<192) + oldStBalanceSender + effectiveLoadAmount2 - effectiveAmount2 - fee2Charge;

    underflowOk <== n2bSender.out[192];

    // if not L1 and not underflowOk => error
    (1 - underflowOk)*(1 - onChain) === 0;

    // if tx is not valid on L1 due to underflow, transaction amount is processed as a 0 amount
    effectiveAmount3 <== underflowOk*effectiveAmount2;

    // compute new balances for sender and receiver
    ////////
    newStBalanceSender <== oldStBalanceSender + effectiveLoadAmount2 - effectiveAmount3 - fee2Charge;
    newStBalanceReceiver <== oldStBalanceReceiver + effectiveAmount3;

    // check if original amount to process is 0
    component effectiveAmountIsZero = IsZero();
    effectiveAmountIsZero.in <== effectiveAmount1;

    // check if amount is nullified
    // this signal is used in L1 invalid transactions where the amount used would not be inserted in txsData since L1Tx is not valid or
    // triggers underflow
    isAmountNullified <== 1 - (1 - nullifyAmount)*underflowOk;

    // Set NOP fucntion on processor 2 (receiver account) if original amount to transfer is 0 since
    // receiver account does not change and coordinator does not need to provide
    // information to proof leaf existence
    isP2Nop <== (1 - effectiveAmountIsZero.out);

    // Note that amount to transfer could be 0 due that the transaction has been nullified.
    // In this case, coordinator must provide account data to be processed by the processor 2 (receiver processor)
    // even if it is considered a 0 transfer and no account balance is updated
    // The reasoning behind this is that coordinator must submit valid account state and its siblings on invalid L1 transactions
    // otherwise, coordinator could potentially manipuate L1 tx by submitting false account state, nullifying the amount to transfer and
    // bypass the processor
}
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";
include "../../node_modules/circomlib/circuits/mux1.circom";

include "../compute-fee.circom";

/**
 * Compute migration transaction states
 * @input idx - {Uint48} - merkle tree index to receive migration amount
 * @input inIdx - {Uint48} - old last merkle tree index assigned
 * @input userFee - {Uint16} - user fee selector
 * @input migrationAmount - {Uint192} - amount to migrate
 * @output fee2Charge - {Uint192} - effective transaction fee
 * @output depositAmount - {Uint192} - effective deposit amount
 * @output isInsert - {Bool} - determines smt processor functionality
 * @output outIdx - {Uint48} - new last merkle tree index assigned
 */
template MigrationTxStates(){
    signal input idx;
    signal input inIdx;
    signal input userFee;
    signal input migrateAmount;
    signal input isNop;

    signal output fee2Charge;
    signal output depositAmount;
    signal output isInsert;
    signal output outIdx;

    // select SMT processor functionality
    component idxIsZero = IsZero();
    idxIsZero.in <== idx;

    isInsert <== idxIsZero.out;

    // compute fee
    ////////
    component computeFee = ComputeFee();
    computeFee.feeSel <== userFee;
    computeFee.amount <== migrateAmount;
    computeFee.applyFee <== 1;

    // check enough balance to pay fees
    signal underflowOk;

    component n2bSender = Num2Bits(193);
    n2bSender.in <== (1<<192) + migrateAmount - computeFee.feeOut;
    underflowOk <== n2bSender.out[192];

    // select fee to accumulate
    component selectFee = Mux1();
    selectFee.c[0] <== migrateAmount;
    selectFee.c[1] <== computeFee.feeOut;
    selectFee.s <== underflowOk;

    fee2Charge <== selectFee.out*(1 - isNop);

    // select final deposit
    component selectDepositAmount = Mux1();
    selectDepositAmount.c[0] <== 0;
    selectDepositAmount.c[1] <== migrateAmount - computeFee.feeOut;
    selectDepositAmount.s <== underflowOk;

    depositAmount <== selectDepositAmount.out;

    // increment Idx if it is an insert
    outIdx <== inIdx + isInsert*(1 - isNop);
}
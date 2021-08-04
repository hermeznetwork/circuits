include "../../node_modules/circomlib/circuits/bitify.circom";
include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/mux1.circom";

include "../lib/decode-float.circom";

/**
 * Decode L1L2 data-availability and compute accumulated hash
 * @input inAccHash - {Field} - initial accumulated hash
 * @input L1L2TxsData - {Field} - transaction data-availability
 * @input inCouner - {Field} - initial transaction counter
 * @output userFee - {Field} - user fee selector
 * @output amount - {Field} - amount sent
 * @output toIdx - {Uint48} - merkle tree index of the receiver leaf
 * @output fromIdx - {Uint48} - merkle tree index of the sender leaf
 */
template ComputeDecodeAccumulateHash(nLevels) {
    signal input inAccHash;
    signal input L1L2TxsData;
    signal input inCounter;

    signal output userFee;     // 8         0..7
    signal output amount;      // 40        8..47
    signal output toIdx;       // nLevels   48..48+nLevels-1
    signal output fromIdx;     // nLevels   48+nLevels..48+2*nLevels-1

    signal output outCounter;
    signal output outAccHash;
    signal output isNop;

    var i;

    // decode data
    component n2bData = Num2Bits(2*nLevels + 40 + 8);
    n2bData.in <== L1L2TxsData;

    // userFee
    component b2nUserFee = Bits2Num(8);
    for (i = 0; i < 8; i++) {
        b2nUserFee.in[i] <== n2bData.out[i];
    }
    b2nUserFee.out ==> userFee;

    // amount
    component amountF = DecodeFloatBin();
    for (i = 0; i < 40; i++) {
        amountF.in[i] <== n2bData.out[8 + i];
    }
    amountF.out ==> amount;

    // toIdx
    component b2nTo = Bits2Num(nLevels);
    for (i = 0; i < nLevels; i++) {
        b2nTo.in[i] <== n2bData.out[8 + 40 + i];
    }
    b2nTo.out ==> toIdx;

    // fromIdx
    component b2nFrom = Bits2Num(nLevels);
    for (i = 0; i < nLevels; i++) {
        b2nFrom.in[i] <== n2bData.out[8 + 40 + nLevels + i];
    }
    b2nFrom.out ==> fromIdx;
    
    var IDX_NOP = 0; 

    // comparator
    component isIdxNop = IsEqual();
    isIdxNop.in[0] <== IDX_NOP;
    isIdxNop.in[1] <== toIdx;

    // compute accHash
    component computeAccumulatedHash = Poseidon(2);
    computeAccumulatedHash.inputs[0] <== inAccHash;
    computeAccumulatedHash.inputs[1] <== L1L2TxsData;

    // select input accHash or computed accHash
    component selectAccHash = Mux1();
    selectAccHash.c[0] <== computeAccumulatedHash.out;
    selectAccHash.c[1] <== inAccHash;
    selectAccHash.s <== isIdxNop.out;

    outAccHash <== selectAccHash.out;
    outCounter <== inCounter + (1 - isIdxNop.out);
    isNop <== isIdxNop.out;
}
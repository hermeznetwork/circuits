include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

include "./lib/decode-float.circom";

/**
 * Decode transaction fields
 * Note: 'txCompressedDataV2' is a shorter version of 'txCompressedData' in order to save bits
 * further details could be found in https://docs.hermez.io/#/developers/protocol/hermez-protocol/circuits/circuits?id=decode-tx
 * @param nLevels - merkle tree depth
 * @input previousOnChain - {Bool} - determines if previous transaction is L1
 * @input txCompressedData - {Uint241} - encode transaction fields
 * @input maxNumBatch - {Uint32} - maximum allowed batch number when the transaction can be processed
 * @input amountF - {Uint40} - amount to transfer from L2 to L2 encoded as float40
 * @input toEthAddr - {Uint160} - ethereum address receiver
 * @input toBjjAy - {Field} - babyjubjub Y coordinate receiver
 * @input rqTxCompressedDataV2 - {Uint193} -requested encode transaction fields version2
 * @input rqToEthAddr - {Uint160} - requested ethereum address receiver
 * @input rqToBjjAy - {Field} - requested babyjubjub Y coordinate
 * @input fromEthAddr - {Uint160} - ethereum address sender
 * @input fromBjjCompressed[256] - {Array[Bool]} - babyjubjub compressed sender
 * @input loadAmountF - {Uint40} - amount to deposit from L1 to L2 encoded as float40
 * @input globalChainID - {Uint16} - global chain identifier
 * @input currentNumBatch - {Uint32} - current batch number
 * @input onChain - {Bool} - determines if the transaction is L1 or L2
 * @input newAccount - {Bool} - determines if transaction creates a new account
 * @input auxFromIdx - {Uint48} - auxiliary index to create accounts
 * @input auxToIdx - {Uint48} - auxiliary index when signed index receiver is set to null
 * @input inIdx  - {Uint48} - old last index assigned
 * @output L1L2TxData[nLevels*2 + 40 + 8] - {Array[Bool]} - L1-L2 data availability
 * @output txCompressedDataV2 - {Uint193} - encode transaction fields together version 2
 * @output L1TxFullData - {Array[Bool]} - L1 full data
 * @output outIdx - {Uint48} - new last index assigned
 * @output fromIdx - {Uint48} - index sender
 * @output toIdx - {Uint48} - index receiver
 * @output amount - {Uint192} - amount to transfer from L2 to L2
 * @output tokenID - {Uint32} - token identifier
 * @output nonce - {Uint40} - nonce
 * @output userFee - {Uint8} - user fee selector
 * @output toBjjSign - {Bool} - babyjubjub sign receiver
 * @output sigL2Hash - {Field} - poseidon hash of L2 data
 */
template DecodeTx(nLevels) {
    // tx L2 fields
    signal input previousOnChain;
    signal input txCompressedData; // data shared with L1 tx
    signal input maxNumBatch;
    signal input amountF;
    signal input toEthAddr;
    signal input toBjjAy;
    signal input rqTxCompressedDataV2;
    signal input rqToEthAddr;
    signal input rqToBjjAy;

    // fromIdx | toIdx | amountF | userFee
    signal output L1L2TxData[nLevels*2 + 40 + 8];
    signal output txCompressedDataV2;

    // tx L1 fields
    signal input fromEthAddr;
    signal input fromBjjCompressed[256];
    signal input loadAmountF;

    signal input globalChainID;
    signal input currentNumBatch;
    signal input onChain;
    signal input newAccount;
    signal input auxFromIdx;
    signal input auxToIdx;

    // fromEthAddr | fromBjjCompressed | fromIdx | loadAmountF | amountF | tokenID | toIdx
    signal output L1TxFullData[160 + 256 + 48 + 40 + 40 + 32 + 48];

    signal input inIdx;
    signal output outIdx;

    // decode txCompressedData
    signal constSig;            // 32      0..31
    signal chainID;             // 16      32..47
    signal output fromIdx;      // 48      48..95
    signal output toIdx;        // 48      96..143
    signal output tokenID;      // 32      144..175
    signal output nonce;        // 40      176..215
    signal output userFee;      // 8       216..223
    signal output toBjjSign;    // 1       224

    signal output amount;

    signal output sigL2Hash;  // For the L2 signature

    var i;

    // Parse txCompressedData
    ////////
    component n2bData = Num2Bits(225);
    n2bData.in <== txCompressedData;

    // constant signature
    component b2nConstSig = Bits2Num(32);
    for (i = 0; i < 32; i++) {
        b2nConstSig.in[i] <== n2bData.out[i];
    }
    b2nConstSig.out ==> constSig;

    // chainID
    component b2nChainID = Bits2Num(16);
    for (i = 0; i < 16; i++) {
        b2nChainID.in[i] <== n2bData.out[32 + i];
    }
    b2nChainID.out ==> chainID;

    // fromIdx
    component b2nFrom = Bits2Num(48);
    for (i = 0; i < 48; i++) {
        b2nFrom.in[i] <== n2bData.out[48 + i];
    }
    b2nFrom.out ==> fromIdx;

    var paddingFrom = 0;
    for (i = nLevels; i < 48; i++) {
        paddingFrom += n2bData.out[48 + i];
    }
    paddingFrom === 0;

    // toIdx
    component b2nTo = Bits2Num(48);
    for (i = 0; i < 48; i++) {
        b2nTo.in[i] <== n2bData.out[96 + i];
    }
    b2nTo.out ==> toIdx;

    var paddingTo = 0;
    for (i = nLevels; i < 48; i++) {
        paddingTo += n2bData.out[96 + i];
    }
    paddingTo === 0;


    // tokenID
    component b2ntokenID = Bits2Num(32);
    for (i = 0; i < 32; i++) {
        b2ntokenID.in[i] <== n2bData.out[144 + i];
    }
    b2ntokenID.out ==> tokenID;

    // nonce
    component b2nNonce = Bits2Num(40);
    for (i = 0; i < 40; i++) {
        b2nNonce.in[i] <== n2bData.out[176 + i];
    }
    b2nNonce.out ==> nonce;

    // userFee
    component b2nUserFee = Bits2Num(8);
    for (i = 0; i < 8; i++) {
        b2nUserFee.in[i] <== n2bData.out[216 + i];
    }
    b2nUserFee.out ==> userFee;

    // toBjjSign
    toBjjSign <== n2bData.out[224];

    // Parse amount
    ////////
    component n2bAmount = Num2Bits(40);
    n2bAmount.in <== amountF;
    component dfAmount = DecodeFloatBin();
    for (i = 0; i < 40; i++) {
        dfAmount.in[i] <== n2bAmount.out[i];
    }
    dfAmount.out ==> amount;

    // Build txCompressedDataV2
    ////////
    // fromIdx | toIdx | amountF | tokenID | nonce | userFee | toBjjSign

    // add fromIdx
    component b2nTxCompressedDataV2 = Bits2Num(48*2 + 40 + 32 + 40 + 8 + 1);
    for (i = 0; i < 48; i++) {
        b2nTxCompressedDataV2.in[i] <== n2bData.out[48 + i]*(1-onChain);
    }

    // add toIdx
    for (i = 0; i < 48; i++) {
        b2nTxCompressedDataV2.in[48 + i] <== n2bData.out[96 + i]*(1-onChain);
    }

    // add amountF
    for (i = 0; i < 40; i++) {
        b2nTxCompressedDataV2.in[48 + 48 + i] <== n2bAmount.out[i]*(1-onChain);
    }

    // add tokenID
    for (i = 0; i < 32; i++) {
        b2nTxCompressedDataV2.in[48 + 48 + 40 + i] <== n2bData.out[144 + i]*(1-onChain);
    }

    // add nonce
    for (i = 0; i < 40; i++) {
        b2nTxCompressedDataV2.in[48 + 48 + 40 + 32 + i] <== n2bData.out[176 + i]*(1-onChain);
    }

    // add userFee
    for (i = 0; i < 8; i++) {
        b2nTxCompressedDataV2.in[48 + 48 + 40 + 32 + 40 + i] <== n2bData.out[216 + i]*(1-onChain);
    }

    // add toSignBjj
    b2nTxCompressedDataV2.in[48 + 48 + 40 + 32 + 40 + 8] <== n2bData.out[224];

    b2nTxCompressedDataV2.out ==> txCompressedDataV2;

    // Build L1L2TxData
    ////////
    // select finalIdx
    // if user signs 'toIdx == 0', then idx receiver would be freely chosen
    // by the coordinator and it is set on 'auxToIdx'.
    // 'auxToIdx' would be the receiver and it would be added to data availability
    // ineatd of `toIdx`
    component toIdxIsZero = IsZero();
    toIdxIsZero.in <== toIdx;

    component selectToIdx = Mux1();
    selectToIdx.c[0] <== toIdx;
    selectToIdx.c[1] <== auxToIdx;
    selectToIdx.s <== (1-onChain)*toIdxIsZero.out;

    component n2bFinalToIdx = Num2Bits(nLevels);
    n2bFinalToIdx.in <== selectToIdx.out;

    // Add fromIdx
    for (i = 0; i < nLevels; i++) {
        L1L2TxData[nLevels - 1 - i] <== n2bData.out[48 + i];
    }
    // Add toIdx
    for (i = 0; i < nLevels; i++) {
        L1L2TxData[nLevels*2 - 1 - i] <== n2bFinalToIdx.out[i];
    }
    // Add amountF
    for (i = 0; i < 40; i++) {
        L1L2TxData[nLevels*2 + 40 - 1 - i] <== n2bAmount.out[i];
    }
    // Add fee
    for (i = 0; i < 8; i++) {
        L1L2TxData[nLevels*2 + 40 + 8 - 1 - i] <== n2bData.out[216 + i]*(1-onChain);
    }

    // Build sigL2Hash
    ////////
    // build e_1: toEthAddr         160 bits    0..159
    //            amountF            40 bits    160..199
    //            maxNumBatch        32 bits    200..232
    component b2nElement1 = Bits2Num(160 + 32 + 40);

    // add toEthAddr
    component n2bToEthAddr = Num2Bits(160);
    n2bToEthAddr.in <== toEthAddr;
    for (i = 0; i < 160; i++) {
        b2nElement1.in[i] <== n2bToEthAddr.out[i];
    }

    // amountF
    for (i = 0; i < 40; i++) {
        b2nElement1.in[160 + i] <== n2bAmount.out[i];
    }

    // add maxNumBatch
    component n2bMaxNumBatch = Num2Bits(32);
    n2bMaxNumBatch.in <== maxNumBatch;
    for (i = 0; i < 32; i++) {
        b2nElement1.in[200 + i] <== n2bMaxNumBatch.out[i];
    }

    component hashSig = Poseidon(6);
    hashSig.inputs[0] <== txCompressedData;
    hashSig.inputs[1] <== b2nElement1.out;
    hashSig.inputs[2] <== toBjjAy;
    hashSig.inputs[3] <== rqTxCompressedDataV2;
    hashSig.inputs[4] <== rqToEthAddr;
    hashSig.inputs[5] <== rqToBjjAy;

    hashSig.out ==> sigL2Hash;

    // Build L1TxFullData
    ////////
    // Add fromEthAddr
    component n2bFromEthAddr = Num2Bits(160);
    n2bFromEthAddr.in <== fromEthAddr;
    for (i = 0; i < 160; i++) {
        L1TxFullData[160 - 1 - i] <== n2bFromEthAddr.out[i]*(onChain);
    }

    // Add fromBjjCompressed
    for (i = 0; i < 256; i++) {
        L1TxFullData[160 + 256 - 1 - i] <== fromBjjCompressed[i]*(onChain);
    }

    // Add fromIdx
    for (i = 0; i < 48; i++) {
        L1TxFullData[160 + 256 + 48 - 1 - i] <== n2bData.out[48 + i]*(onChain);
    }

    // Add loadAmountF
    component n2bLoadAmountF = Num2Bits(40);
    n2bLoadAmountF.in <== loadAmountF;
    for (i = 0; i < 40; i++) {
        L1TxFullData[160 + 256 + 48 + 40 - 1 - i] <== n2bLoadAmountF.out[i]*(onChain);
    }

    // Add amountF
    for (i = 0; i < 40; i++) {
        L1TxFullData[160 + 256 + 48 + 40 + 40 - 1 - i] <== n2bAmount.out[i]*(onChain);
    }

    // Add tokenID
    for (i = 0; i < 32; i++) {
        L1TxFullData[160 + 256 + 48 + 40 + 40 + 32 - 1 - i] <== n2bData.out[144 + i]*(onChain);
    }

    // Add toIdx
    for (i = 0; i < 48; i++) {
        L1TxFullData[160 + 256 + 48 + 40 + 40 + 32 + 48 - 1 - i] <== n2bData.out[96 + i]*(onChain);
    }

    // Perform checks on transaction fields
    ////////
    // newAccount must be 1 if tx is L1 and fromIdx == 0
    component fromIdxIsZero = IsZero();
    fromIdxIsZero.in <== fromIdx;
    onChain*fromIdxIsZero.out === newAccount;

    // increment Idx if it is an L1 tx and new account
    outIdx <== inIdx + onChain*newAccount;

    // check auxFromIdx if it is an L1 tx and new account
    // force that index inserted for creating new accounts must be incremental
    component idxChecker = ForceEqualIfEnabled();
    idxChecker.in[0] <== auxFromIdx;
    idxChecker.in[1] <== outIdx;
    idxChecker.enabled <== onChain*newAccount;

    // L1 tx must be processed before L2 tx
    (1 - previousOnChain) * onChain === 0;

    // checks chainID tx field matches globalChainID forced by the smart contract
    component chainIDChecker = ForceEqualIfEnabled();
    chainIDChecker.in[0] <== globalChainID;
    chainIDChecker.in[1] <== chainID;
    chainIDChecker.enabled <== (1 - onChain);

    // checks signatureConstant transaction field matches the hardcoded value CONST_SIG
    var CONST_SIG = 3322668559;

    component constSigChecker = ForceEqualIfEnabled();
    constSigChecker.in[0] <== constSig;
    constSigChecker.in[1] <== CONST_SIG;
    constSigChecker.enabled <== (1 - onChain);

    // checks (maxNumBatch <= currentNumBatch) if maxNumBatch != 0
    component maxNumBatchIsZero = IsZero();
    maxNumBatchIsZero.in <== maxNumBatch;

    component isMaxNumBatchOk = GreaterEqThan(32);
    isMaxNumBatchOk.in[0] <== maxNumBatch;
    isMaxNumBatchOk.in[1] <== currentNumBatch;

    (1 - isMaxNumBatchOk.out) * (1 - maxNumBatchIsZero.out) === 0;
}

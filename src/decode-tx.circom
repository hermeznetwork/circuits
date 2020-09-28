include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

include "./lib/decode-float.circom";

/**
 * Decode transaction fields
 * @param nLevels - merkle tree depth
 */
template DecodeTx(nLevels) {
    // tx L2
    signal input previousOnChain;
    signal input txCompressedData; // data shared with L1 tx
    signal input toEthAddr;
    signal input toBjjAy;
    signal input rqTxCompressedDataV2;
    signal input rqToEthAddr;
    signal input rqToBjjAy;

    // fromIdx | toIdx | amountF | userFee
    signal output L2TxData[nLevels*2 + 16 + 8];
    signal output txCompressedDataV2;

    // tx L1
    signal input fromEthAddr;
    signal input fromBjjCompressed[256];
    signal input loadAmountF;

    signal input globalChainID;
    signal input onChain;
    signal input newAccount;
    signal input auxFromIdx;

    // fromEthAddr | fromBjjCompressed | fromIdx | loadAmountF | amountF | tokenID | toIdx
    signal output L1TxData[160 + 256 + 48 + 16 + 16 + 32 + 48];

    signal input inIdx;
    signal output outIdx;

    // decode txCompressedData
    signal constSig;            // 32      0..31
    signal chainID;             // 16      32..47
    signal output fromIdx;      // 48      48..95
    signal output toIdx;        // 48      96..143
    signal output amount;       // 16      144..159
    signal output tokenID;      // 32      160..191
    signal output nonce;        // 40      192..231
    signal output userFee;      // 8       232..239
    signal output toBjjSign;    // 1       240

    signal output sigL2Hash;  // For the L2 signature

    var i;

    // Parse txCompressedData
    ////////
    component n2bData = Num2Bits(241);
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

    // amountF
    component dfAmount = DecodeFloatBin();
    for (i = 0; i < 16; i++) {
        dfAmount.in[i] <== n2bData.out[144 + i];
    }
    dfAmount.out ==> amount;

    // tokenID
    component b2ntokenID = Bits2Num(32);
    for (i = 0; i < 32; i++) {
        b2ntokenID.in[i] <== n2bData.out[160 + i];
    }
    b2ntokenID.out ==> tokenID;

    // nonce
    component b2nNonce = Bits2Num(40);
    for (i = 0; i < 40; i++) {
        b2nNonce.in[i] <== n2bData.out[192 + i];
    }
    b2nNonce.out ==> nonce;

    // userFee
    component b2nUserFee = Bits2Num(8);
    for (i = 0; i < 8; i++) {
        b2nUserFee.in[i] <== n2bData.out[232 + i];
    }
    b2nUserFee.out ==> userFee;

    // toBjjSign
    toBjjSign <== n2bData.out[240];

    // txCompressedDataV2
    //////
    // fromIdx | toIdx | amountF | tokenID | nonce | userFee | toBjjSign

    // add fromIdx
    component b2nTxCompressedDataV2 = Bits2Num(48*2 + 16 + 32 + 40 + 8 + 1);
    for (i = 0; i < 48; i++) {
        b2nTxCompressedDataV2.in[i] <== n2bData.out[48 + i]*(1-onChain);
    }

    // add toIdx
    for (i = 0; i < 48; i++) {
        b2nTxCompressedDataV2.in[48 + i] <== n2bData.out[96 + i]*(1-onChain);
    }

    // add amountF
    for (i = 0; i < 16; i++) {
        b2nTxCompressedDataV2.in[48 + 48 + i] <== n2bData.out[144 + i]*(1-onChain);
    }

    // add tokenID
    for (i = 0; i < 32; i++) {
        b2nTxCompressedDataV2.in[48 + 48 + 16 + i] <== n2bData.out[160 + i]*(1-onChain);
    }

    // add nonce
    for (i = 0; i < 40; i++) {
        b2nTxCompressedDataV2.in[48 + 48 + 16 + 32 + i] <== n2bData.out[192 + i]*(1-onChain);
    }

    // add userFee
    for (i = 0; i < 8; i++) {
        b2nTxCompressedDataV2.in[48 + 48 + 16 + 32 + 40 + i] <== n2bData.out[232 + i]*(1-onChain);
    }

    // add toSignBjj
    b2nTxCompressedDataV2.in[192] <== n2bData.out[240];

    b2nTxCompressedDataV2.out ==> txCompressedDataV2;

    //  L2TxData
    ////////
    // Add fromIdx
    for (i = 0; i < nLevels; i++) {
        L2TxData[nLevels - 1 - i] <== n2bData.out[48 + i]*(1-onChain);
    }
    // Add toIdx
    for (i = 0; i < nLevels; i++) {
        L2TxData[nLevels*2 - 1 - i] <== n2bData.out[96 + i]*(1-onChain);
    }
    // Add amountF
    for (i = 0; i < 16; i++) {
        L2TxData[nLevels*2 + 16 - 1 - i] <== n2bData.out[144 + i]*(1-onChain);
    }
    // Add fee
    for (i = 0; i < 8; i++) {
        L2TxData[nLevels*2 + 16 + 8 - 1 - i] <== n2bData.out[232 + i]*(1-onChain);
    }

    // sigL2Hash
    component hashSig = Poseidon(6);
    hashSig.inputs[0] <== txCompressedData;
    hashSig.inputs[1] <== toEthAddr;
    hashSig.inputs[2] <== toBjjAy;
    hashSig.inputs[3] <== rqTxCompressedDataV2;
    hashSig.inputs[4] <== rqToEthAddr;
    hashSig.inputs[5] <== rqToBjjAy;

    hashSig.out ==> sigL2Hash;

    //  L1TxData
    ////////
    // Add fromEthAddr
    component n2bFromEthAddr = Num2Bits(160);
    n2bFromEthAddr.in <== fromEthAddr;
    for (i = 0; i < 160; i++) {
        L1TxData[160 - 1 - i] <== n2bFromEthAddr.out[i]*(onChain);
    }

    // Add fromBjjCompressed
    for (i = 0; i < 256; i++) {
        L1TxData[160 + 256 - 1 - i] <== fromBjjCompressed[i]*(onChain);
    }

    // Add fromIdx
    for (i = 0; i < 48; i++) {
        L1TxData[160 + 256 + 48 - 1 - i] <== n2bData.out[48 + i]*(onChain);
    }

    // Add loadAmountF
    component n2bLoadAmountF = Num2Bits(16);
    n2bLoadAmountF.in <== loadAmountF;
    for (i = 0; i < 16; i++) {
        L1TxData[160 + 256 + 48 + 16 - 1 - i] <== n2bLoadAmountF.out[i]*(onChain);
    }

    // Add amountF
    for (i = 0; i < 16; i++) {
        L1TxData[160 + 256 + 48 + 16 + 16 - 1 - i] <== n2bData.out[144 + i]*(onChain);
    }

    // Add tokenID
    for (i = 0; i < 32; i++) {
        L1TxData[160 + 256 + 48 + 16 + 16 + 32 - 1 - i] <== n2bData.out[160 + i]*(onChain);
    }

    // Add toIdx
    for (i = 0; i < 48; i++) {
        L1TxData[160 + 256 + 48 + 16 + 16 + 32 + 48 - 1 - i] <== n2bData.out[96 + i]*(onChain);
    }

    // newAccount must be 1 if L1 Tx and fromIdx == 0
    // check afterwards auxFromIdx is incremental
    component fromIdxIsZero = IsZero();
    fromIdxIsZero.in <== fromIdx;
    onChain*fromIdxIsZero.out === newAccount;

    // increment Idx if it is an L1 tx and new account
    outIdx <== inIdx + onChain*newAccount;

    // check Idx if it is an L1 tx and new account
    component idxChecker = ForceEqualIfEnabled();
    idxChecker.in[0] <== auxFromIdx;
    idxChecker.in[1] <== outIdx;
    idxChecker.enabled <== onChain*newAccount;

    // Check that L1 tx are before L2 tx
    (1 - previousOnChain) * onChain === 0;

    // Check chainID
    component chainIDChecker = ForceEqualIfEnabled();
    chainIDChecker.in[0] <== globalChainID;
    chainIDChecker.in[1] <== chainID;
    chainIDChecker.enabled <== (1 - onChain);

    // Check constant signature
    var CONST_SIG = 3322668559;

    component constSigChecker = ForceEqualIfEnabled();
    constSigChecker.in[0] <== constSig;
    constSigChecker.in[1] <== CONST_SIG;
    constSigChecker.enabled <== (1 - onChain);
}

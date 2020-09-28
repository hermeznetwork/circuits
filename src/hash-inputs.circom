include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/sha256/sha256.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

/**
 * Compute the sha256 hash of all pretended public inputs
 * @param nLevels - merkle tree depth
 * @param nTx - absolute maximum of L1 or L2 transactions
 * @param maxL1Tx - absolute maximum of L1 transaction
 * @param maxFeeTx - absolute maximum of fee transactions
 */
template HashInputs(nLevels, nTx, maxL1Tx, maxFeeTx) {
    // bits for each public input type
    var bitsIndexMax = 48; // MAX_NLEVELS 
    var bitsIndex = nLevels;
    var bitsRoots = 256;
    var bitsChainID = 16;
    var bitsL1TxsData = maxL1Tx * (2*bitsIndexMax + 32 + 16 + 16 + 256 + 160);
    var bitsL2TxsData = nTx * (2*nLevels + 16 + 8);
    var bitsFeeTxsData = maxFeeTx * bitsIndex;

    // inputs
    signal input oldLastIdx;
    signal input newLastIdx;
    signal input oldStateRoot;
    signal input newStateRoot;
    signal input newExitRoot;
    signal input L1TxsData[bitsL1TxsData]; // already in bits
    signal input L2TxsData[bitsL2TxsData]; // already in bits
    signal input feeTxsData[maxFeeTx]; // array of merkle tree index
    signal input globalChainID;

    // output
    signal output hashInputsOut;

    var i;

    // get bits from all inputs
    ////////
    // oldLastIdx
    component n2bOldLastIdx = Num2Bits(48);
    n2bOldLastIdx.in <== oldLastIdx;

    var paddingOldLastIdx = 0;
    for (i = nLevels; i < 48; i++) {
        paddingOldLastIdx += n2bOldLastIdx.out[i];
    }
    paddingOldLastIdx === 0;

    // newLastIdx
    component n2bNewLastIdx = Num2Bits(48);
    n2bNewLastIdx.in <== newLastIdx;

    var paddingNewLastIdx = 0;
    for (i = nLevels; i < 48; i++) {
        paddingNewLastIdx += n2bNewLastIdx.out[i];
    }
    paddingNewLastIdx === 0;

    // oldStateRoot
    component n2bOldStateRoot = Num2Bits(256);
    n2bOldStateRoot.in <== oldStateRoot;

    // newStateRoott
    component n2bNewStateRoot = Num2Bits(256);
    n2bNewStateRoot.in <== newStateRoot;

    // newExitRoot
    component n2bNewExitRoot = Num2Bits(256);
    n2bNewExitRoot.in <== newExitRoot;

    // feeTxData
    component n2bFeeTxsData[maxFeeTx];

    var j;
    for (i = 0; i < maxFeeTx; i++){
        n2bFeeTxsData[i] = Num2Bits(48);

        n2bFeeTxsData[i].in <== feeTxsData[i];

        var paddingFeeTxsData = 0;
        for (j = nLevels; j < 48; j++) {
            paddingFeeTxsData += n2bFeeTxsData[i].out[j];
        }
        paddingFeeTxsData === 0;
    }

    // globalChainID
    component n2bChainID = Num2Bits(16);
    n2bChainID.in <== globalChainID;

    // build SHA256 with all inputs
    var totalBitsSha256 = 2*bitsIndexMax + 3*bitsRoots + bitsChainID + bitsL1TxsData + bitsL2TxsData + bitsFeeTxsData;

    component inputsHasher = Sha256(totalBitsSha256);

    var offset = 0;

    // add oldLastIdx
    for (i = 0; i < bitsIndexMax; i++) {
        inputsHasher.in[bitsIndexMax - 1 - i] <== n2bOldLastIdx.out[i];
    }
    offset = offset + bitsIndexMax;

    // add newLastIdx
    for (i = 0; i < bitsIndexMax; i++) {
        inputsHasher.in[offset + bitsIndexMax - 1 - i] <== n2bNewLastIdx.out[i];
    }
    offset = offset + bitsIndexMax;

    // add oldStateRoot
    for (i = 0; i < bitsRoots; i++) {
        inputsHasher.in[offset + bitsRoots - 1 - i] <== n2bOldStateRoot.out[i];
    }
    offset = offset + bitsRoots;

    // add newStateRoot
    for (i = 0; i < bitsRoots; i++) {
        inputsHasher.in[offset + bitsRoots - 1 - i] <== n2bNewStateRoot.out[i];
    }
    offset = offset + bitsRoots;

    // add newExitRoot
    for (i = 0; i < bitsRoots; i++) {
        inputsHasher.in[offset + bitsRoots - 1 - i] <== n2bNewExitRoot.out[i];
    }
    offset = offset + bitsRoots;

    // add L1TxsData
    for (i = 0; i < bitsL1TxsData; i++) {
        inputsHasher.in[offset + i] <== L1TxsData[i];
    }
    offset = offset + bitsL1TxsData;

    // add L2TxsData
    for (i = 0; i < bitsL2TxsData; i++) {
        inputsHasher.in[offset + i] <== L2TxsData[i];
    }
    offset = offset + bitsL2TxsData;

    // add feeTxData
    for (i = 0; i < maxFeeTx; i++){
        for (j = 0; j < bitsIndex; j++){
            inputsHasher.in[offset + bitsIndex - 1 - j] <== n2bFeeTxsData[i].out[j];
        }
        offset = offset + bitsIndex;
    }

    // add chainID
    for (i = 0; i < bitsChainID; i++) {
        inputsHasher.in[offset + bitsChainID - 1 - i] <== n2bChainID.out[i];
    }

    // get hash output
    component n2bHashInputsOut = Bits2Num(256);
    for (i = 0; i < 256; i++) {
        n2bHashInputsOut.in[i] <== inputsHasher.out[255-i];
    }

    hashInputsOut <== n2bHashInputsOut.out;
}

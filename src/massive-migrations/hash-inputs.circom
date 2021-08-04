include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/sha256/sha256.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";

/**
 * Compute the sha256 hash of all pretended public inputs
 * @param nLevels - merkle tree depth
 * @input initSourceStateRoot - {Field} - initial batch source state root
 * @input finalSourceStateRoot - {Field} - final batch source state root
 * @input destinyOldStateRoot - {Field} - old state root
 * @input destinyNewStateRoot - {Field} - new state root
 * @input oldLastIdx - {Uint48}	- old last merkle tree index created
 * @input newLastIdx - {Uint48} - new last merkle tree index created
 * @input migrationIdx - {Uint48} - migration merkle tree index on source rollup
 * @input feeIdx - {Uint48} - merkle tree index to receive fees
 * @input batchesToMigrate - {Uint32} - number of batches that will be migrated
 * @output hashInputsOut - {Field} - sha256 hash of pretended public inputs
 */
template HashInputs(nLevels) {
    // bits for each public input type
    var bitsIndexMax = 48; // MAX_NLEVELS
    var bitsIndex = nLevels;
    var bitsRoots = 256;
    var bitsBatch = 32;

    // inputs
    signal input initSourceStateRoot;
    signal input finalSourceStateRoot;
    signal input destinyOldStateRoot;
    signal input destinyNewStateRoot;
    signal input oldLastIdx;
    signal input newLastIdx;
    signal input migrationIdx;
    signal input feeIdx;
    signal input batchesToMigrate;

    // output
    signal output hashInputsOut;

    var i;

    // get bits from all inputs
    ////////
    // initSourceStateRoot
    component n2bInitSourceStateRoot = Num2Bits(bitsRoots);
    n2bInitSourceStateRoot.in <== initSourceStateRoot;

    // finalSourceStateRoot
    component n2bFinalSourceStateRoot = Num2Bits(bitsRoots);
    n2bFinalSourceStateRoot.in <== finalSourceStateRoot;

    // destinyOldStateRoot
    component n2bDestinyOldStateRoot = Num2Bits(bitsRoots);
    n2bDestinyOldStateRoot.in <== destinyOldStateRoot;

    // destinyNewStateRoot
    component n2bDestinyNewStateRoot = Num2Bits(bitsRoots);
    n2bDestinyNewStateRoot.in <== destinyNewStateRoot;

    // oldLastIdx
    component n2bOldLastIdx = Num2Bits(bitsIndexMax);
    n2bOldLastIdx.in <== oldLastIdx;

    var paddingOldLastIdx = 0;
    for (i = bitsIndex; i < bitsIndexMax; i++) {
        paddingOldLastIdx += n2bOldLastIdx.out[i];
    }
    paddingOldLastIdx === 0;

    // newLastIdx
    component n2bNewLastIdx = Num2Bits(bitsIndexMax);
    n2bNewLastIdx.in <== newLastIdx;

    var paddingNewLastIdx = 0;
    for (i = bitsIndex; i < bitsIndexMax; i++) {
        paddingNewLastIdx += n2bNewLastIdx.out[i];
    }
    paddingNewLastIdx === 0;

    // migrationIdx
    component n2bMigrationIdx = Num2Bits(bitsIndexMax);
    n2bMigrationIdx.in <== migrationIdx;

    var paddingMigrationIdx = 0;
    for (i = bitsIndex; i < bitsIndexMax; i++) {
        paddingMigrationIdx += n2bMigrationIdx.out[i];
    }
    paddingMigrationIdx === 0;

    // feeIdx
    component n2bFeeIdx = Num2Bits(bitsIndexMax);
    n2bFeeIdx.in <== feeIdx;

    var paddingFeeIdx = 0;
    for (i = bitsIndex; i < bitsIndexMax; i++) {
        paddingFeeIdx += n2bFeeIdx.out[i];
    }
    paddingFeeIdx === 0;

    // batchesToMigrate
    component n2bBatchesToMigrate = Num2Bits(bitsBatch);
    n2bBatchesToMigrate.in <== batchesToMigrate;

    // build SHA256 with all inputs
    ////////
    var totalBitsSha256 = 4*bitsRoots + 4*bitsIndexMax + bitsBatch;

    component inputsHasher = Sha256(totalBitsSha256);

    var offset = 0;

    // add initSourceStateRoot
    for (i = 0; i < bitsRoots; i++) {
        inputsHasher.in[offset + bitsRoots - 1 - i] <== n2bInitSourceStateRoot.out[i];
    }
    offset = offset + bitsRoots;

    // add finalSourceStateRoot
    for (i = 0; i < bitsRoots; i++) {
        inputsHasher.in[offset + bitsRoots - 1 - i] <== n2bFinalSourceStateRoot.out[i];
    }
    offset = offset + bitsRoots;

    // add destinyOldStateRoot
    for (i = 0; i < bitsRoots; i++) {
        inputsHasher.in[offset + bitsRoots - 1 - i] <== n2bDestinyOldStateRoot.out[i];
    }
    offset = offset + bitsRoots;

    // add destinyNewStateRoot
    for (i = 0; i < bitsRoots; i++) {
        inputsHasher.in[offset + bitsRoots - 1 - i] <== n2bDestinyNewStateRoot.out[i];
    }
    offset = offset + bitsRoots;

    // add oldLastIdx
    for (i = 0; i < bitsIndexMax; i++) {
        inputsHasher.in[offset + bitsIndexMax - 1 - i] <== n2bOldLastIdx.out[i];
    }
    offset = offset + bitsIndexMax;

    // add newLastIdx
    for (i = 0; i < bitsIndexMax; i++) {
        inputsHasher.in[offset + bitsIndexMax - 1 - i] <== n2bNewLastIdx.out[i];
    }
    offset = offset + bitsIndexMax;

    // add migrationIdx
    for (i = 0; i < bitsIndexMax; i++) {
        inputsHasher.in[offset + bitsIndexMax - 1 - i] <== n2bMigrationIdx.out[i];
    }
    offset = offset + bitsIndexMax;

    // add feeIdx
    for (i = 0; i < bitsIndexMax; i++) {
        inputsHasher.in[offset + bitsIndexMax - 1 - i] <== n2bFeeIdx.out[i];
    }
    offset = offset + bitsIndexMax;

    // add batchesToMigrate
    for (i = 0; i < bitsBatch; i++) {
        inputsHasher.in[offset + bitsBatch - 1 - i] <== n2bBatchesToMigrate.out[i];
    }

    // get hash output
    component n2bHashInputsOut = Bits2Num(256);
    for (i = 0; i < 256; i++) {
        n2bHashInputsOut.in[i] <== inputsHasher.out[255-i];
    }

    hashInputsOut <== n2bHashInputsOut.out;
}

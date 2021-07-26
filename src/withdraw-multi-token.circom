include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/smt/smtverifier.circom";
include "../node_modules/circomlib/circuits/sha256/sha256.circom";

include "./lib/hash-state.circom"

/**
 * Verify multi token withdrawal by proving that a leaf exist on the state tree with a determined exit balance
 * @param nLevels - merkle tree depth
 * @param nTokens - number of tokens to withdraw
 * @input rootState - {Field} - state tree root
 * @input ethAddr - {Uint160} - ethereum address
 * @input tokenIDs - {Array(Uint32)} - token identifiers
 * @input nonces - {Array(Uint40)} - nonces
 * @input balances - {Array(Uint192)} - balances
 * @input idxs - {Array(Uint48)} - merkle tree indexes
 * @input exitBalances - {Array(Uint192)} - exitBalances
 * @input accumulatedHashes - {Array(Field)} - accumulatedHashes
 * @input signs - {Array(Bool)} - babyjubjub signs
 * @input ays - {Array(Field)} babyjubjub y coordinate
 * @input siblingsStates[nLevels + 1] - {Array(Array(Field))} - siblings merkle proof
 * @output hashGlobalInputs - {Field} - hash of all pretended input signals
 */
template WithdrawMultiToken(nLevels, nTokens) {
    // Unique public signal
    signal output hashGlobalInputs;

    // private inputs
    signal private input rootState;
    signal private input ethAddr;
    signal private input tokenIDs[nTokens];
    signal private input nonces[nTokens];
    signal private input balances[nTokens];
    signal private input idxs[nTokens];
    signal private input exitBalances[nTokens];
    signal private input accumulatedHashes[nTokens];
    signal private input signs[nTokens];
    signal private input ays[nTokens];
    signal private input siblingsStates[nTokens][nLevels + 1];

    var i;
    var j;

    component accountsState[nTokens];
    component smtVerify[nTokens];

    for(i = 0; i < nTokens; i++) {
        // compute account state hash
        ////////
        accountsState[i] = HashState();
        accountsState[i].tokenID <== tokenIDs[i];
        accountsState[i].nonce <== nonces[i];
        accountsState[i].sign <== signs[i];
        accountsState[i].balance <== balances[i];
        accountsState[i].ay <== ays[i];
        accountsState[i].ethAddr <== ethAddr;
        accountsState[i].exitBalance <== exitBalances[i];
        accountsState[i].accumulatedHash <== accumulatedHashes[i];

        // verify account state is on state tree root
        //////
        smtVerify[i] = SMTVerifier(nLevels + 1);
        smtVerify[i].enabled <== 1;
        smtVerify[i].fnc <== 0;
        smtVerify[i].root <== rootState;
        for (j = 0; j < nLevels + 1; j++) {
            smtVerify[i].siblings[j] <== siblingsStates[i][j];
        }
        smtVerify[i].oldKey <== 0;
        smtVerify[i].oldValue <== 0;
        smtVerify[i].isOld0 <== 0;
        smtVerify[i].key <== idxs[i];
        smtVerify[i].value <== accountsState[i].out;
    }

    // compute hash global inputs
    ////////
    component hasherInputs = HashInputsWithdrawalMulti(nLevels, nTokens);

    hasherInputs.rootState <== rootState;
    hasherInputs.ethAddr <== ethAddr;
    for(i = 0; i < nTokens; i++) {
        hasherInputs.tokenIDs[i] <== tokenIDs[i];
        hasherInputs.exitBalances[i] <== exitBalances[i];
        hasherInputs.idxs[i] <== idxs[i];
    }
    // set public output
    hashGlobalInputs <== hasherInputs.hashInputsOut;
}
template HashInputsWithdrawalMulti(nLevels, nTokens){
    // bits for each public input type
    var bitsRootState = 256;
    var bitsEthAddr = 160;
    var bitsTokenID = 32;
    var bitsExitBalance = 192;
    var bitsIdx = 48; // MAX_NLEVELS

    // inputs
    signal input rootState;
    signal input ethAddr;
    signal input tokenIDs[nTokens];
    signal input exitBalances[nTokens];
    signal input idxs[nTokens];

    // output
    signal output hashInputsOut;

    var i;
    var j;

    // get bits from all inputs
    ////////
    // rootState
    component n2bRootState = Num2Bits(bitsRootState);
    n2bRootState.in <== rootState;

    // ethAddr
    component n2bEthAddr = Num2Bits(bitsEthAddr);
    n2bEthAddr.in <== ethAddr;

    component n2bTokenIDs[nTokens];
    component n2bExitBalances[nTokens];
    component n2bIdxs[nTokens];

    for(i = 0; i < nTokens; i++) {
        n2bTokenIDs[i] = Num2Bits(bitsTokenID);
        n2bExitBalances[i] = Num2Bits(bitsExitBalance);
        n2bIdxs[i] = Num2Bits(bitsIdx);

        // tokenID
        n2bTokenIDs[i].in <== tokenIDs[i];

        // exitBalance
        n2bExitBalances[i].in <== exitBalances[i];

        // idx
        n2bIdxs[i].in <== idxs[i];
        var paddingIdx = 0;
        for (j = nLevels; j < 48; j++) {
            paddingIdx += n2bIdxs[i].out[j];
        }
        paddingIdx === 0;
    }

    // build SHA256 with all inputs
    ////////
    var totalBitsSha256 = bitsRootState + bitsEthAddr + bitsTokenID * nTokens + bitsExitBalance * nTokens +  bitsIdx * nTokens;
    component inputsHasher = Sha256(totalBitsSha256);

    var offset = 0;

    // add rootState
    for (i = 0; i < bitsRootState; i++) {
        inputsHasher.in[bitsRootState - 1 - i] <== n2bRootState.out[i];
    }
    offset = offset + bitsRootState;

    // add ethAddr
    for (i = 0; i < bitsEthAddr; i++) {
        inputsHasher.in[offset + bitsEthAddr - 1 - i] <== n2bEthAddr.out[i];
    }
    offset = offset + bitsEthAddr;

    // add tokenID
    for(i = 0; i < nTokens; i++) {
        for (j = 0; j < bitsTokenID; j++) {
            inputsHasher.in[offset + bitsTokenID - 1 - j] <== n2bTokenIDs[i].out[j];
        }
        offset = offset + bitsTokenID;
    }

    // add exitBalance
    for(i = 0; i < nTokens; i++) {
        for (j  = 0; j < bitsExitBalance; j++) {
            inputsHasher.in[offset + bitsExitBalance - 1 - j] <== n2bExitBalances[i].out[j];
        }
        offset = offset + bitsExitBalance;
    }

    // add idx
    for(i = 0; i < nTokens; i++) {
        for (j = 0; j < bitsIdx; j++) {
            inputsHasher.in[offset + bitsIdx - 1 - j] <== n2bIdxs[i].out[j];
        }
        offset = offset + bitsIdx;
    }

    // get hash output
    component n2bHashInputsOut = Bits2Num(256);
    for (i = 0; i < 256; i++) {
        n2bHashInputsOut.in[i] <== inputsHasher.out[255-i];
    }

    hashInputsOut <== n2bHashInputsOut.out;
}
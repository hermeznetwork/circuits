include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/smt/smtverifier.circom";
include "../node_modules/circomlib/circuits/sha256/sha256.circom";
include "../node_modules/circomlib/circuits/eddsaposeidon.circom";

include "./lib/hash-state.circom"
include "./lib/utils-bjj.circom";

/**
 * Verify withdrawalBjj by proving that a leaf exist on the exit tree
 * @param nLevels - merkle tree depth
 * @input rootState - {Field} - state tree root
 * @input ethAddrStateState - {Uint160} - ethereum address of the state
 * @input tokenID - {Uint32} - token identifier
 * @input nonce - {Uint40} - nonce
 * @input balance - {Uint192} - balance
 * @input idx - {Uint48} - merkle tree index
 * @input exitBalance - {Uint192} - exitBalance
 * @input accumulatedHash - {Field} - accumulatedHash
 * @input sign - {Bool} - babyjubjub sign
 * @input ay - {Field} babyjubjub y coordinate
 * @input siblingsState[nLevels + 1] - {Array(Field)} - siblings merkle proof
 * @input ethAddrCaller - {Uint160} - ethereum address that will call the SC
 * @input ethAddrCallerAuth - {Uint160} - ethereum address authorized to call the SC
 * @input ethAddrBeneficiary - {Uint160} - ethereum address that will recieve the withdraw
 * @input s - {Field} -  eddsa signature field of the hashGlobalInputs
 * @input r8x - {Field} -  eddsa signature field of the hashGlobalInputs
 * @input r8y - {Field} -  eddsa signature field of the hashGlobalInputs
 * @output hashGlobalInputs - {Field} - hash of all pretended input signals
 */
template WithdrawBjj(nLevels) {
    // Unique public signal
    signal output hashGlobalInputs;

    // private inputs
    signal private input rootState;
	signal private input ethAddrState;
    signal private input tokenID;
    signal private input nonce;
    signal private input balance;
    signal private input idx;
    signal private input exitBalance;
    signal private input accumulatedHash;
    signal private input sign;
    signal private input ay;
    signal private input siblingsState[nLevels + 1];

    // withdraw bjj parameters
    signal private input ethAddrCaller;
    signal private input ethAddrCallerAuth;
    signal private input ethAddrBeneficiary;
    signal private input s;
    signal private input r8x;
    signal private input r8y;

    // compute account state hash
    ////////
    component accountState = HashState();
    accountState.tokenID <== tokenID;
    accountState.nonce <== nonce;
    accountState.sign <== sign;
    accountState.balance <== balance;
    accountState.ay <== ay;
    accountState.ethAddr <== ethAddrState;
    accountState.exitBalance <== exitBalance;
    accountState.accumulatedHash <== accumulatedHash;

    // verify account state is on state tree root
    ////////
	component smtVerify = SMTVerifier(nLevels + 1);
	smtVerify.enabled <== 1;
	smtVerify.fnc <== 0;
	smtVerify.root <== rootState;
	for (var i = 0; i < nLevels + 1; i++) {
		smtVerify.siblings[i] <== siblingsState[i];
	}
	smtVerify.oldKey <== 0;
	smtVerify.oldValue <== 0;
	smtVerify.isOld0 <== 0;
	smtVerify.key <== idx;
	smtVerify.value <== accountState.out;

    // check ethAddrCaller
    var ETH_ADDR_ANY = (1<<160) - 1; // 0xFFFF...FFFF
    component isAuthEthAddrAny = IsEqual();
    isAuthEthAddrAny.in[0] <== ETH_ADDR_ANY;
    isAuthEthAddrAny.in[1] <== ethAddrCallerAuth;

    component checkToEthAddr = ForceEqualIfEnabled();
    checkToEthAddr.in[0] <== ethAddrCaller;
    checkToEthAddr.in[1] <== ethAddrCallerAuth;
    checkToEthAddr.enabled <== 1 - isAuthEthAddrAny.out

    // calculate signature hash
    component hashSig = Poseidon(4);
    hashSig.inputs[0] <== ethAddrCallerAuth;
    hashSig.inputs[1] <== ethAddrBeneficiary;
    hashSig.inputs[2] <== rootState;
    hashSig.inputs[3] <== idx;

    // computes babyjubjub X coordinate
    component getAx = AySign2Ax();
    getAx.ay <== ay;
    getAx.sign <== sign;

    // verify hash signature
    component sigVerifier = EdDSAPoseidonVerifier();
    sigVerifier.enabled <== 1;

    sigVerifier.Ax <== getAx.ax;
    sigVerifier.Ay <== ay;

    sigVerifier.S <== s;
    sigVerifier.R8x <== r8x;
    sigVerifier.R8y <== r8y;
    sigVerifier.M <== hashSig.out;

    // compute hash global inputs
    ////////
    component hasherInputs = HashInputsWithdrawal(nLevels);

    hasherInputs.rootState <== rootState;
    hasherInputs.ethAddrCaller <== ethAddrCaller;
    hasherInputs.ethAddrBeneficiary <== ethAddrBeneficiary;
    hasherInputs.tokenID <== tokenID;
    hasherInputs.exitBalance <== exitBalance;
    hasherInputs.idx <== idx;

    // set public output
    hashGlobalInputs <== hasherInputs.hashInputsOut;


}

/**
 * Computes the sha256 hash of all pretended public inputs
 * @param nLevels - merkle tree depth
 * @input rootState - {Field} - state root
 * @input ethAddrCaller - {Uint160} - ethereum address that will call the SC
 * @input ethAddrBeneficiary - {Uint160} - ethereum address that will recieve the withdraw
 * @input tokenID - {Uint32} - token identifier
 * @input exitBalance - {Uint192} - exit balance
 * @input idx - {Uint48} - merkle tree index
 * @output hashInputsOut - {Field} - hash inputs signals
 */
template HashInputsWithdrawal(nLevels){
    // bits for each public input type
    var bitsRootState = 256;
    var bitsethAddr = 160;
    var bitsTokenID = 32;
    var bitsExitBalance = 192;
    var bitsIdx = 48; // MAX_NLEVELS

    // inputs
    signal input rootState;
    signal input ethAddrCaller;
    signal input ethAddrBeneficiary;
    signal input tokenID;
    signal input exitBalance;
    signal input idx;

    // output
    signal output hashInputsOut;

    var i;
    var j;

    // get bits from all inputs
    ////////
    // rootState
    component n2bRootState = Num2Bits(256);
    n2bRootState.in <== rootState;

    // ethAddrCaller
    component n2bEthAddrCaller = Num2Bits(160);
    n2bEthAddrCaller.in <== ethAddrCaller;

    // ethAddrBeneficiary
    component n2bEthAddrBeneficiary = Num2Bits(160);
    n2bEthAddrBeneficiary.in <== ethAddrBeneficiary;

    // tokenID
    component n2bTokenID = Num2Bits(32);
    n2bTokenID.in <== tokenID;

    // exitBalance
    component n2bExitBalance = Num2Bits(192);
    n2bExitBalance.in <== exitBalance;

    // idx
    component n2bIdx = Num2Bits(48);
    n2bIdx.in <== idx;
    var paddingIdx = 0;
    for (j = nLevels; j < 48; j++) {
        paddingIdx += n2bIdx.out[j];
    }
    paddingIdx === 0;

    // build SHA256 with all inputs
    ////////
    var totalBitsSha256 = bitsRootState + bitsethAddr + bitsethAddr + bitsTokenID + bitsExitBalance +  bitsIdx;
    component inputsHasher = Sha256(totalBitsSha256);

    var offset = 0;

    // add rootState
    for (i = 0; i < bitsRootState; i++) {
        inputsHasher.in[bitsRootState - 1 - i] <== n2bRootState.out[i];
    }
    offset = offset + bitsRootState;

    // add ethAddrCaller
    for (i = 0; i < bitsethAddr; i++) {
        inputsHasher.in[offset + bitsethAddr - 1 - i] <== n2bEthAddrCaller.out[i];
    }
    offset = offset + bitsethAddr;

    // add ethAddrBeneficiary
    for (i = 0; i < bitsethAddr; i++) {
        inputsHasher.in[offset + bitsethAddr - 1 - i] <== n2bEthAddrBeneficiary.out[i];
    }
    offset = offset + bitsethAddr;

    // add tokenID
    for (i = 0; i < bitsTokenID; i++) {
        inputsHasher.in[offset + bitsTokenID - 1 - i] <== n2bTokenID.out[i];
    }
    offset = offset + bitsTokenID;

    // add exitBalance
    for (i = 0; i < bitsExitBalance; i++) {
        inputsHasher.in[offset + bitsExitBalance - 1 - i] <== n2bExitBalance.out[i];
    }
    offset = offset + bitsExitBalance;

    // add idx
    for (i = 0; i < bitsIdx; i++) {
        inputsHasher.in[offset + bitsIdx - 1 - i] <== n2bIdx.out[i];
    }
    offset = offset + bitsIdx;

    // get hash output
    component n2bHashInputsOut = Bits2Num(256);
    for (i = 0; i < 256; i++) {
        n2bHashInputsOut.in[i] <== inputsHasher.out[255-i];
    }

    hashInputsOut <== n2bHashInputsOut.out;
}

component main = WithdrawBjj(32);


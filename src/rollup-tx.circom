include "../node_modules/circomlib/circuits/smt/smtprocessor.circom";
include "../node_modules/circomlib/circuits/eddsaposeidon.circom";
include "../node_modules/circomlib/circuits/gates.circom";
include "../node_modules/circomlib/circuits/mux1.circom";

include "./fee-accumulator.circom";
include "./balance-updater.circom";
include "./rollup-tx-states.circom";
include "./lib/hash-state.circom";
include "./rq-tx-verifier.circom";
include "./lib/utils-bjj.circom";
include "./lib/decode-float.circom"

/**
 * Process a rollup transaction
 * @param nLevels - merkle tree depth
 * @param maxFeeTx - absolute maximum of fee transactions
 * @input feePlanTokens[maxFeeTx] - {Array(Uint32)} - all tokens eligible to accumulate fees
 * @input accFeeIn[maxFeeTx] - {Array(Uint192)} - initial fees accumulated
 * @input futureTxCompressedDataV2[3] - {Array(Uint193)} - future transactions txCompressedDataV2
 * @input pastTxCompressedDataV2[4] - {Array(Uint193)} - past transactions toEthAddr
 * @input futureToEthAddr[3] - {Array(Uint160)} - future transactions toEthAddr
 * @input pastToEthAddr[4] - {Array(Uint160)} - past transactions toEthAddr
 * @input futureToBjjAy[3] - {Array(Field)} - future transactions toBjjAy
 * @input pastToBjjAy[4] - {Array(Field)} - past transactions toBjjAy
 * @input fromIdx - {Uint48} - index sender
 * @input auxFromIdx - {Uint48} - auxiliary index to create accounts
 * @input toIdx - {Uint48} - index receiver
 * @input auxToIdx - {Uint48} - auxiliary index when signed index receiver is set to null
 * @input toBjjAy - {Field} - bayjubjub y coordinate receiver
 * @input toBjjSign - {Bool} - babyjubjub sign receiver
 * @input toEthAddr - {Uint160} - ethereum address receiver
 * @input amount - {Uint192} - amount to transfer from L2 to L2
 * @input tokenID - {Uint32} - tokenID signed in the transaction
 * @input nonce - {Uint40} - nonce signed in the transaction
 * @input userFee - {Uint16} - user fee selector
 * @input rqOffset - {Uint3} - relative linked transaction
 * @input onChain - {Bool} - determines if the transaction is L1 or L2
 * @input newAccount - {Bool} - determines if transaction creates a new account
 * @input rqTxCompressedDataV2 - {Uint193} - requested encode transaction fields together version 2
 * @input rqToEthAddr - {Uint160} - requested ethereum address receiver
 * @input rqToBjjAy - {Field} - requested babyjubjub y coordinate
 * @input L1L2TxDataNum - {Field} - L1-L2 data availability integer
 * @input sigL2Hash - {Field} - hash L2 data to sign
 * @input s - {Field} - eddsa signature field
 * @input r8x - {Field} - eddsa signature field
 * @input r8y - {Field} - eddsa signature field
 * @input fromEthAddr - {Uint160} - ethereum address sender
 * @input fromBjjCompressed[256]- {Array(Bool)} - babyjubjub compressed sender
 * @input loadAmountF - {Uint40} - amount to deposit from L1 to L2 encoded as float40
 * @input tokenID1 - {Uint32} - tokenID of the sender leaf
 * @input nonce1 - {Uint40} - nonce of the sender leaf
 * @input sign1 - {Bool} - sign of the sender leaf
 * @input balance1 - {Uint192} - balance of the sender leaf
 * @input ay1 - {Field} - ay of the sender leaf
 * @input ethAddr1 - {Uint160} - ethAddr of the sender leaf
 * @input exitBalance1 - {Uint192} - account exit balance
 * @input accumulatedHash1 - {Field} - received transactions hash chain
 * @input siblings1[nLevels + 1] - {Array(Field)} - siblings merkle proof of the sender leaf
 * @input isOld0_1 - {Bool} - flag to require old key - value
 * @input oldKey1 - {Uint48} - old key of the sender leaf
 * @input oldValue1 - {Field} - old value of the sender leaf
 * @input tokenID2 - {Uint32} - tokenID of the receiver leaf
 * @input nonce2 - {Uint40} - nonce of the receiver leaf
 * @input sign2 - {Bool} - sign of the receiver leaf
 * @input balance2 - {Uint192} - balance of the receiver leaf
 * @input ay2 - {Field} - ay of the receiver leaf
 * @input ethAddr2 - {Uint160} - ethAddr of the receiver leaf
 * @input exitBalance2 - {Uint192} - account exit balance
 * @input accumulatedHash2 - {Field} - received transactions hash chain
 * @input siblings2[nLevels + 1] - {Array(Field)} - siblings merkle proof of the receiver leaf
 * @input oldStateRoot - {Field} - initial state root
 * @output accFeeOut[maxFeeTx] - {Array(Uint192)} - final fees accumulated
 * @output newStateRoot - {Field} - final state root
 */
template RollupTx(nLevels, maxFeeTx) {
    // Phases rollup-tx circuit
        // A: compute transaction states
        // B: check request transaction fields
        // C: checks state fields
        // D: compute hash old states
        // E: signal processor selectors
        // F: verify eddsa signature
        // G: update balances
        // H: accumulate fess
        // I: compute hash new states
        // J: smt processors

    // Accumulate fees
    signal input feePlanTokens[maxFeeTx];
    signal input accFeeIn[maxFeeTx];
    signal output accFeeOut[maxFeeTx];

    // Past and future data
    signal input futureTxCompressedDataV2[3];
    signal input pastTxCompressedDataV2[4];

    signal input futureToEthAddr[3];
    signal input pastToEthAddr[4];

    signal input futureToBjjAy[3];
    signal input pastToBjjAy[4];

    // Tx
    signal input fromIdx;
    signal input auxFromIdx;

    signal input toIdx;
    signal input auxToIdx;
    signal input toBjjAy;
    signal input toBjjSign;
    signal input toEthAddr;

    signal input amount;
    signal input tokenID;
    signal input nonce;
    signal input userFee;
    signal input rqOffset;
    signal input onChain;
    signal input newAccount;

    signal input rqTxCompressedDataV2;
    signal input rqToEthAddr;
    signal input rqToBjjAy;

    signal input L1L2TxDataNum;
    signal input sigL2Hash;
    signal input s;
    signal input r8x;
    signal input r8y;

    // For L1 TX
    signal input fromEthAddr;
    signal input fromBjjCompressed[256];
    signal input loadAmountF;

    // State 1
    signal input tokenID1;
    signal input nonce1;
    signal input sign1;
    signal input balance1;
    signal input ay1;
    signal input ethAddr1;
    signal input exitBalance1;
    signal input accumulatedHash1;
    signal input siblings1[nLevels+1];
    // Required for inserts and delete
    signal input isOld0_1;
    signal input oldKey1;
    signal input oldValue1;

    // State 2
    signal input tokenID2;
    signal input nonce2;
    signal input sign2;
    signal input balance2;
    signal input ay2;
    signal input ethAddr2;
    signal input exitBalance2;
    signal input accumulatedHash2;
    signal input siblings2[nLevels+1];

    // Roots
    signal input oldStateRoot;
    signal output newStateRoot;

    var i;

    // A - compute tx-states
    ////////
    // decode loadAmountF
    component decodeLoadAmountF = DecodeFloat();
    decodeLoadAmountF.in <== loadAmountF;

    // compute states
    component states = RollupTxStates();
    states.fromIdx <== fromIdx;
    states.toIdx <== toIdx;
    states.toEthAddr <== toEthAddr;
    states.auxFromIdx <== auxFromIdx;
    states.auxToIdx <== auxToIdx;
    states.amount <== amount;
    states.loadAmount <== decodeLoadAmountF.out;
    states.newAccount <== newAccount;
    states.onChain <== onChain;
    states.fromEthAddr <== fromEthAddr;
    states.ethAddr1 <== ethAddr1;
    states.tokenID <== tokenID;
    states.tokenID1 <== tokenID1;
    states.tokenID2 <== tokenID2;
    states.sign2 <== sign2;
    states.ay2 <== ay2;

    // B - check request transaction fields
    ////////
    component rqTxVerifier = RqTxVerifier();

    for (i = 0; i < 4; i++) {
        rqTxVerifier.pastTxCompressedDataV2[i] <== pastTxCompressedDataV2[i];
        rqTxVerifier.pastToEthAddr[i] <== pastToEthAddr[i];
        rqTxVerifier.pastToBjjAy[i] <== pastToBjjAy[i];
    }

    for (i = 0; i < 3; i++) {
        rqTxVerifier.futureTxCompressedDataV2[i] <== futureTxCompressedDataV2[i];
        rqTxVerifier.futureToEthAddr[i] <== futureToEthAddr[i];
        rqTxVerifier.futureToBjjAy[i] <== futureToBjjAy[i];
    }

    rqTxVerifier.rqTxCompressedDataV2 <== rqTxCompressedDataV2;
    rqTxVerifier.rqToEthAddr <== rqToEthAddr;
    rqTxVerifier.rqToBjjAy <== rqToBjjAy;

    rqTxVerifier.rqTxOffset <== rqOffset;

    // C - check state fields
    ////////
    // sender nonce check on L2
    // nonce signed by the user must match nonce of the sender account
    component nonceChecker = ForceEqualIfEnabled();
    nonceChecker.in[0] <== nonce;
    nonceChecker.in[1] <== nonce1;
    nonceChecker.enabled <== (1 - onChain);

    // recipient toEthAddr
    // if tx type is 'transferToEthAddr' or 'transferToBjj'
    // 'toEthAddr' signed by the user must match 'ethAddr' of the receiver account
    component checkToEthAddr = ForceEqualIfEnabled();
    checkToEthAddr.in[0] <== toEthAddr;
    checkToEthAddr.in[1] <== ethAddr2;
    checkToEthAddr.enabled <== 1 - (1 - states.checkToEthAddr)*(1 - states.checkToBjj);

    // recipient toBjj
    // if tx type is 'transferToBjj'
    // 'toBjjAy' signed by the user must match 'ay' of the receiver account
    component toBjjAyChecker = ForceEqualIfEnabled();
    toBjjAyChecker.in[0] <== ay2;
    toBjjAyChecker.in[1] <== toBjjAy;
    toBjjAyChecker.enabled <== states.checkToBjj;

    // 'toBjjSign' signed by the user must match 'sign' of the receiver account
    component toBjjSignChecker = ForceEqualIfEnabled();
    toBjjSignChecker.in[0] <== sign2;
    toBjjSignChecker.in[1] <== toBjjSign;
    toBjjSignChecker.enabled <== states.checkToBjj;

    // sender tokenID check on L2
    // tokenID signed by the user must match tokenID of the sender account
    component checkTokenID1 = ForceEqualIfEnabled();
    checkTokenID1.in[0] <== tokenID;
    checkTokenID1.in[1] <== tokenID1;
    checkTokenID1.enabled <== (1 - onChain);

    // receiver tokenID check on L2
    // tokenID signed by the user must match tokenID of the receiver account
    component checkTokenID2 = ForceEqualIfEnabled();
    checkTokenID2.in[0] <== tokenID;
    checkTokenID2.in[1] <== tokenID2;
    checkTokenID2.enabled <== (1 - onChain);

    // force sender tokenID on L1-create-account
    // if tx type involves an account creation, it is forced that the account created
    // has the tokenID signed by the user
    component checkTokenID1L1 = ForceEqualIfEnabled();
    checkTokenID1L1.in[0] <== tokenID;
    checkTokenID1L1.in[1] <== tokenID1;
    checkTokenID1L1.enabled <== states.isP1Insert;

    // force sender fromEthAddr on L1-create-account
    // if tx type involves an account creation, it is forced that the account created
    // has the ethAddr signed by the user
    component fromEthAddrChecker = ForceEqualIfEnabled();
    fromEthAddrChecker.in[0] <== fromEthAddr;
    fromEthAddrChecker.in[1] <== ethAddr1;
    fromEthAddrChecker.enabled <== states.isP1Insert;

    // D - compute old hash states
    ////////
    // oldState1 Packer
    component oldSt1Hash = HashState();
    oldSt1Hash.tokenID <== tokenID1;
    oldSt1Hash.nonce <== nonce1;
    oldSt1Hash.sign <== sign1;
    oldSt1Hash.balance <== balance1;
    oldSt1Hash.ay <== ay1;
    oldSt1Hash.ethAddr <== ethAddr1;
    oldSt1Hash.exitBalance <== exitBalance1;
    oldSt1Hash.accumulatedHash <== accumulatedHash1;

    // oldState2 Packer
    component oldSt2Hash = HashState();
    oldSt2Hash.tokenID <== tokenID2;
    oldSt2Hash.nonce <== nonce2;
    oldSt2Hash.sign <== sign2;
    oldSt2Hash.balance <== balance2;
    oldSt2Hash.ay <== ay2;
    oldSt2Hash.ethAddr <== ethAddr2;
    oldSt2Hash.exitBalance <== exitBalance2;
    oldSt2Hash.accumulatedHash <== accumulatedHash2;

    // E - signal processor selectors
    ////////
    // decode BjjCompressed
    component decodeFromBjj = BitsCompressed2AySign();
    for (i = 0; i < 256; i++){
        decodeFromBjj.bjjCompressed[i] <== fromBjjCompressed[i];
    }

    // state processor 1 : newAccount * onChain
    // perform INSERT if transaction is L1 and involves and account creation
    // the following multiplexers choose between signals if state processor is an INSERT

    // INSERT: sender balance would be 0
    // otherwise, balance sender account will be selected
    component s1Balance = Mux1();
    s1Balance.c[0] <== balance1;
    s1Balance.c[1] <== 0;
    s1Balance.s <== states.isP1Insert;

    // INSERT: babyjubjub sign would be taken from 'decodeFromBjj.sign' which is the 'fromBjjCompressed' signed on L1 tx
    // otherwise, babyjubjub sign sender account will be selected
    component s1Sign = Mux1();
    s1Sign.c[0] <== sign1;
    s1Sign.c[1] <== decodeFromBjj.sign;
    s1Sign.s <== states.isP1Insert;

    // INSERT: babyjubjub ay would be taken from 'decodeFromBjj.ay' which is the 'fromBjjCompressed' signed on L1 tx
    // otherwise, babyjubjub ay sender account will be selected
    component s1Ay = Mux1();
    s1Ay.c[0] <== ay1;
    s1Ay.c[1] <== decodeFromBjj.ay;
    s1Ay.s <== states.isP1Insert;

    // INSERT: sender nonce would be 0
    // otherwise, nonce sender account will be selected
    component s1Nonce = Mux1();
    s1Nonce.c[0] <== nonce1;
    s1Nonce.c[1] <== 0;
    s1Nonce.s <== states.isP1Insert;

    // INSERT: ethereum address would be taken from 'fromEthAddr' which is signed on L1 tx
    // otherwise, ethereum address sender account will be selected
    component s1EthAddr = Mux1();
    s1EthAddr.c[0] <== ethAddr1;
    s1EthAddr.c[1] <== fromEthAddr;
    s1EthAddr.s <== states.isP1Insert;

    // INSERT: token identifier would be taken from 'tokenID' which is signed on L1 tx
    // otherwise, token identifier sender account will be selected
    component s1TokenID = Mux1();
    s1TokenID.c[0] <== tokenID1;
    s1TokenID.c[1] <== tokenID;
    s1TokenID.s <== states.isP1Insert;

    // INSERT: sender exit balance would be 0
    // otherwise, exit balance sender account will be selected
    component s1ExitBalance = Mux1();
    s1ExitBalance.c[0] <== exitBalance1;
    s1ExitBalance.c[1] <== 0;
    s1ExitBalance.s <== states.isP1Insert;

    // INSERT: sender accumulated hash would be 0
    // otherwise, accumulated hash sender account will be selected
    component s1AccumulatedHash = Mux1();
    s1AccumulatedHash.c[0] <== accumulatedHash1;
    s1AccumulatedHash.c[1] <== 0;
    s1AccumulatedHash.s <== states.isP1Insert;

    // INSERT: processor old key would be taken from 'oldKey1' which is set by the coordinator
    // otherwise, key is selected from states depending on tx type
    component s1OldKey = Mux1();
    s1OldKey.c[0] <== states.key1;
    s1OldKey.c[1] <== oldKey1;
    s1OldKey.s <== states.isP1Insert;

    // INSERT: processor state hash would be taken from 'oldValue1' which is set by the coordinator
    // otherwise, state hash is selected from oldState1 Packer
    component s1OldValue = Mux1();
    s1OldValue.c[0] <== oldSt1Hash.out;
    s1OldValue.c[1] <== oldValue1;
    s1OldValue.s <== states.isP1Insert;

    // F - verify eddsa signature
    ////////
    // Note: Account could be created with invalid Bjj key
    // If signature is not checked, getAx is not needed
    // In order to not break getAx function,
    // [0, 0] is set to pass getAx if signature is not checked

    // selects babyjubjub sign from states if verify signature is enabled (L2 tx and not NOP)
    // otherwise, babyjubjub sign would be 0
    component signSignature = Mux1();
    signSignature.c[0] <== 0;
    signSignature.c[1] <== s1Sign.out;
    signSignature.s <== states.verifySignEnabled;

    // selects babyjubjub Y coordinate from states if verify signature is enabled
    // otherwise, babyjubjub Y coordinate would be 0
    component aySignature = Mux1();
    aySignature.c[0] <== 0;
    aySignature.c[1] <== s1Ay.out;
    aySignature.s <== states.verifySignEnabled;

    // computes babyjubjub X coordinate
    component getAx = AySign2Ax();
    getAx.ay <== aySignature.out;
    getAx.sign <== signSignature.out;

    // signature L2 verifier
    component sigVerifier = EdDSAPoseidonVerifier();
    sigVerifier.enabled <== states.verifySignEnabled;

    sigVerifier.Ax <== getAx.ax;
    sigVerifier.Ay <== s1Ay.out;

    sigVerifier.S <== s;
    sigVerifier.R8x <== r8x;
    sigVerifier.R8y <== r8y;

    sigVerifier.M <== sigL2Hash;

    // G - update balances
    ////////
    component balanceUpdater = BalanceUpdater();
    balanceUpdater.oldBalanceSender <== s1Balance.out;
    balanceUpdater.oldBalanceReceiver <== balance2;
    balanceUpdater.oldExitBalanceReceiver <== exitBalance2;
    balanceUpdater.amount <== amount;
    balanceUpdater.loadAmount <== decodeLoadAmountF.out;
    balanceUpdater.feeSelector <== userFee;
    balanceUpdater.onChain <== onChain;
    balanceUpdater.nop <== states.nop;
    balanceUpdater.isExit <== 1 - (1 - states.isExit)*(1 - states.isOnlyExit);
    balanceUpdater.nullifyLoadAmount <== states.nullifyLoadAmount;
    balanceUpdater.nullifyAmount <== states.nullifyAmount;

    // update accumulatedHash
    component computeAccumulatedHash = Poseidon(2);
    computeAccumulatedHash.inputs[0] <== accumulatedHash2;
    computeAccumulatedHash.inputs[1] <== L1L2TxDataNum;

    component s2AccumulatedHash = Mux1();
    s2AccumulatedHash.c[0] <== accumulatedHash2;
    s2AccumulatedHash.c[1] <== computeAccumulatedHash.out;
    s2AccumulatedHash.s <== (1 - balanceUpdater.isAmountNullified) * (1 - states.isExit);

    // H - accumulate fees
    ////////
    component feeAccumulator = FeeAccumulator(maxFeeTx);
    feeAccumulator.tokenID <== tokenID;
    feeAccumulator.fee2Charge <== balanceUpdater.fee2Charge;

    for (i = 0; i < maxFeeTx; i++){
        feeAccumulator.feePlanTokenID[i] <== feePlanTokens[i];
        feeAccumulator.accFeeIn[i] <== accFeeIn[i];
    }

    for (i = 0; i < maxFeeTx; i++){
        feeAccumulator.accFeeOut[i] ==> accFeeOut[i];
    }

    // I - compute hash new states
    ////////
    // newState1 hash state
    component newSt1Hash = HashState();
    newSt1Hash.tokenID <== s1TokenID.out;
    newSt1Hash.nonce <== s1Nonce.out + (1 - onChain);
    newSt1Hash.sign <== s1Sign.out;
    newSt1Hash.balance <== balanceUpdater.newBalanceSender;
    newSt1Hash.ay <== s1Ay.out;
    newSt1Hash.ethAddr <== s1EthAddr.out;
    newSt1Hash.exitBalance <== s1ExitBalance.out;
    newSt1Hash.accumulatedHash <== s1AccumulatedHash.out;

    // newState2 hash state
    component newSt2Hash = HashState();
    newSt2Hash.tokenID <== tokenID2;
    newSt2Hash.nonce <== nonce2;
    newSt2Hash.sign <== sign2;
    newSt2Hash.balance <== balanceUpdater.newBalanceReceiver;
    newSt2Hash.ay <== ay2;
    newSt2Hash.ethAddr <== ethAddr2;
    newSt2Hash.exitBalance <== balanceUpdater.newExitBalanceReceiver;
    newSt2Hash.accumulatedHash <== s2AccumulatedHash.out;

    // J - smt processors
    ////////
    // processor 1: sender
    component processor1 = SMTProcessor(nLevels+1);
    processor1.oldRoot <== oldStateRoot;
    for (i = 0; i < nLevels + 1; i++) {
        processor1.siblings[i] <== siblings1[i];
    }
    processor1.oldKey <== s1OldKey.out;
    processor1.oldValue <== s1OldValue.out;
    processor1.isOld0 <== isOld0_1;
    processor1.newKey <== states.key1;
    processor1.newValue <== newSt1Hash.out;
    processor1.fnc[0] <== states.P1_fnc0;
    processor1.fnc[1] <== states.P1_fnc1;

    // processor 2: receiver
    component processor2 = SMTProcessor(nLevels+1);
    processor2.oldRoot <== processor1.newRoot;
    for (i = 0; i < nLevels + 1; i++) {
        processor2.siblings[i] <== siblings2[i];
    }
    processor2.oldKey <== states.key2;
    processor2.oldValue <== oldSt2Hash.out;
    processor2.isOld0 <== 0;
    processor2.newKey <== states.key2;
    processor2.newValue <== newSt2Hash.out;
    processor2.fnc[0] <== states.P2_fnc0;
    processor2.fnc[1] <== states.P2_fnc1;

    processor2.newRoot ==> newStateRoot;
}
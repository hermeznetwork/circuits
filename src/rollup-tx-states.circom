include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/mux2.circom";
include "../node_modules/circomlib/circuits/mux1.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

/**
 * Calculates all the internal transaction states
 */
template RollupTxStates() {
    signal input fromIdx;
    signal input toIdx;
    signal input toEthAddr;
    signal input auxFromIdx;
    signal input auxToIdx;

    signal input amount;
    signal input newExit;
    signal input loadAmount;
    signal input newAccount;
    signal input onChain;

    signal input fromEthAddr;
    signal input ethAddr1;

    signal input tokenID;
    signal input tokenID1;
    signal input tokenID2;

    signal output s1;
    signal output s2;
    signal output key1;
    signal output key2;
    signal output P1_fnc0;
    signal output P1_fnc1;
    signal output P2_fnc0;
    signal output P2_fnc1;
    signal output isExit;
    signal output verifySignEnabled;
    signal output nop;
    signal output checkToEthAddr;
    signal output checkToBjj;

    signal output nullifyLoadAmount;
    signal output nullifyAmount;

    // Select finalFromIdx
    ////////
    signal finalFromIdx;

    component selectFromIdx = Mux1();
    selectFromIdx.c[0] <== fromIdx;
    selectFromIdx.c[1] <== auxFromIdx;
    selectFromIdx.s <== onChain*newAccount;

    selectFromIdx.out ==> finalFromIdx;

    // Select finalToIdx
    ////////
    signal finalToIdx;

    component toIdxIsZero = IsZero();
    toIdxIsZero.in <== toIdx;

    signal selectAuxToIdx;
    selectAuxToIdx <== (1-onChain)*toIdxIsZero.out;

    component selectToIdx = Mux1();
    selectToIdx.c[0] <== toIdx;
    selectToIdx.c[1] <== auxToIdx;
    selectToIdx.s <== selectAuxToIdx;

    selectToIdx.out ==> finalToIdx;

    // Check toEthAddr
    ////////
    var ETH_ADDR_ANY = (1<<160) - 1; // 0xFFFF...FFFF

    component isToEthAddrAny = IsEqual();
    isToEthAddrAny.in[0] <== ETH_ADDR_ANY;
    isToEthAddrAny.in[1] <== toEthAddr;

    // Check if tx is an exit
    ////////
    var EXIT_IDX = 1;

    component checkIsExit = IsEqual();
    checkIsExit.in[0] <== EXIT_IDX;
    checkIsExit.in[1] <== finalToIdx;

    isExit <== checkIsExit.out;

    // finalFromIdx == 0 --> NOP processor 1
    ////////
    component finalFromIdxIsZero = IsZero();
    finalFromIdxIsZero.in <== finalFromIdx;
    signal isFinalFromIdx;
    isFinalFromIdx <== 1 - finalFromIdxIsZero.out;

    // Check if loadAmount != 0
    ////////
    component loadAmountIsZero = IsZero();
    loadAmountIsZero.in <== loadAmount;
    signal isLoadAmount;
    isLoadAmount <== 1 - loadAmountIsZero.out;

    // Check if amount to transfer is != 0
    ////////
    component amountIsZero = IsZero();
    amountIsZero.in <== amount;
    signal isAmount;
    isAmount <== 1 - amountIsZero.out;

    // loadAmount must be 0 if L2 Tx
    (1-onChain)*isLoadAmount === 0;

    // newAccount must be 0 if L2 Tx
    (1-onChain)*newAccount === 0;

    // select processor 1 function and key1
    ////////
    s1 <== onChain*newAccount; // processor 1 performs an INSERT

    P1_fnc0 <== s1*isFinalFromIdx; // processor 1 performs NOP if finalFromIdx == 0
    P1_fnc1 <== (1-s1)*isFinalFromIdx;

    component mux1 = Mux2();
    mux1.c[0] <== 0;
    mux1.c[1] <== finalFromIdx;
    mux1.c[2] <== finalFromIdx;
    mux1.c[3] <== finalFromIdx;
    mux1.s[0] <== P1_fnc0;
    mux1.s[1] <== P1_fnc1;

    mux1.out ==> key1;

    // select processor 2 function and key2
    ////////
    s2 <== isExit*newExit; // processor 2 performs an INSERT

    P2_fnc0 <== s2*isFinalFromIdx; // processor 2 performs NOP if fromIdx == 0
    P2_fnc1 <== (1-s2)*isFinalFromIdx;

    component mux2 = Mux2();
    mux2.c[0] <== 0;
    mux2.c[1] <== finalToIdx;
    mux2.c[2] <== 0;
    mux2.c[3] <== finalFromIdx;
    mux2.s[0] <== isAmount;
    mux2.s[1] <== isExit;

    mux2.out ==> key2;

    // verify L2 signature
    ////////
    verifySignEnabled <== (1-onChain)*isFinalFromIdx;

    // nop signaling for balance-updater
    ////////
    nop <== finalFromIdxIsZero.out;

    // signals to check receiver `To`
    // transfer toEthAddr or toBjj
    ////////
    signal tmpCheckToEthAddr;
    signal tmpCheckToBjj;

    tmpCheckToEthAddr <== (1 - isToEthAddrAny.out)*selectAuxToIdx;
    tmpCheckToBjj <== isToEthAddrAny.out*selectAuxToIdx;

    checkToEthAddr <== tmpCheckToEthAddr*(1 - nop);
    checkToBjj <== tmpCheckToBjj*(1 - nop);

    // Should check signed fields on L1 tx
    ////////
    signal onChainNotCreateAccount;
    onChainNotCreateAccount <== (1 - newAccount)*onChain;

    // ethAddr1
    signal applyNullifierEthAddr;

    signal shouldCheckEthAddr;
    shouldCheckEthAddr <== onChainNotCreateAccount * isAmount;

    component checkFromEthAddr = IsEqual();
    checkFromEthAddr.in[0] <== fromEthAddr;
    checkFromEthAddr.in[1] <== ethAddr1;

    applyNullifierEthAddr <== shouldCheckEthAddr * (1 - checkFromEthAddr.out);

    // tokenID1
    signal applyNullifierTokenID1;

    signal shouldCheckTokenID1;
    shouldCheckTokenID1 <== onChainNotCreateAccount;

    component checkTokenID1 = IsEqual();
    checkTokenID1.in[0] <== tokenID;
    checkTokenID1.in[1] <== tokenID1;

    applyNullifierTokenID1 <== shouldCheckTokenID1 * (1 - checkTokenID1.out);

    // tokenID2
    signal applyNullifierTokenID2;

    signal shouldCheckTokenID2_0;
    shouldCheckTokenID2_0 <== onChain*isAmount;

    signal shouldCheckTokenID2_1;
    shouldCheckTokenID2_1 <== shouldCheckTokenID2_0 * (1 - s2);

    component checkTokenID2 = IsEqual();
    checkTokenID2.in[0] <== tokenID;
    checkTokenID2.in[1] <== tokenID2;

    applyNullifierTokenID2 <== shouldCheckTokenID2_1 * (1 - checkTokenID2.out);

    // nullify loadAmount
    nullifyLoadAmount <== applyNullifierTokenID1 * isLoadAmount;

    // nullify amount
    // note: only allow L1 transfers (inside rollup) if tokenID == tokenID1 == tokenID2
    signal nullifyAmount_0;
    signal applyCheckTokenID1ToAmount;

    applyCheckTokenID1ToAmount <== applyNullifierTokenID1 * isAmount;

    nullifyAmount_0 <== 1 - (1 - applyNullifierEthAddr) * (1 - applyNullifierTokenID2);
    nullifyAmount <== 1 - (1 - nullifyAmount_0) * (1 - applyCheckTokenID1ToAmount);
}

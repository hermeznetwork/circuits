include "../node_modules/circomlib/circuits/comparators.circom";
include "../node_modules/circomlib/circuits/mux2.circom";
include "../node_modules/circomlib/circuits/mux1.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

/**
 * Calculates all the internal transaction states
 * @input fromIdx - {Uint48} - index sender
 * @input toIdx - {Uint48} - index receiver
 * @input toEthAddr - {Uint160} - ethereum address receiver
 * @input auxFromIdx - {Uint48} - auxiliary index to create accounts
 * @input auxToIdx - {Uint48} - auxiliary index when signed index receiver is set to null
 * @input amount - {Uint192} - amount to transfer from L2 to L2
 * @input newExit - {Bool} - determines if the transaction create a new account in the exit tree
 * @input loadAmount - {Uint192} - amount to deposit from L1 to L2
 * @input newAccount - {Bool} - determines if transaction creates a new account
 * @input onChain - {Bool} - determines if the transaction is L1 or L2
 * @input fromEthAddr - {Uint160} - ethereum address sender
 * @input ethAddr1 - {Uint160} - ethereum address of sender leaf
 * @input tokenID - {Uint32} - tokenID signed in the transaction
 * @input tokenID1  - {Uint32} - tokenID of the sender leaf
 * @input tokenID2 - {Uint32} - tokenID of the receiver leaf
 * @output isP1Insert - {Bool} - determines if processor 1 performs an INSERT function (sender)
 * @output isP2Insert - {Bool} - determines if processor 2 performs an INSERT function (receiver)
 * @output key1 - {Uint48} - processor 1 key
 * @output key2 - {Uint48} - processor 2 key
 * @output P1_fnc0 - {Bool} - processor 1 bit 0 functionality
 * @output P1_fnc1 - {Bool} - processor 1 bit 1 functionality
 * @output P2_fnc0 - {Bool} - processor 2 bit 0 functionality
 * @output P2_fnc1 - {Bool} - processor 2 bit 1 functionality
 * @output isExit - {Bool} - determines if the transaction is an exit
 * @output verifySignEnabled - {Bool} - determines if the eddsa signature needs to be verified
 * @output nop - {Bool} - determines if the transaction should be considered as a NOP transaction
 * @output checkToEthAddr - {Bool} - determines if receiver ethereum address needs to be checked
 * @output checkToBjj - {Bool} - determines if receiver babyjubjub needs to be checked
 * @output nullifyLoadAmount - {Bool} - determines if loadAmount is considered to be 0
 * @output nullifyAmount - {Bool} - determines if amount is considered to be 0
 */
template RollupTxStates() {
    // The following table summarize all the internal states that has to be processed depending on tx type
    // |    **Transaction type**     |   fromIdx   | auxFromIdx | toIdx |  auxToIdx  |       toEthAddr        | onChain | newAccount | loadAmount | amount |       newExit        | *isP1Insert* |     *isP2Insert*     | *processor 1* |    *processor 2*     | *isExit* | *verifySignEnable* | *nop* | *checkToEthAddr* | *checkToBjj* |
    // |:---------------------------:|:-----------:|:----------:|:-----:|:----------:|:----------------------:|:-------:|:----------:|:----------:|:------:|:--------------------:|:------------:|:--------------------:|:-------------:|:--------------------:|:--------:|:------------------:|:-----:|:----------------:|:------------:|
    // |         createAccount       |      0      |    key1    |   0   |     0      |           0            |    1    |     1      |     0      |   0    |          0           |       1      |          0           |    INSERT     |        UPDATE        |    0     |         0          |   0   |        0         |      0       |
    // |    createAccountDeposit     |      0      |    key1    |   0   |     0      |           0            |    1    |     1      |     X      |   0    |          0           |       1      |          0           |    INSERT     |        UPDATE        |    0     |         0          |   0   |        0         |      0       |
    // | createAccountDepositTranfer |      0      |    key1    | key2  |     0      |           0            |    1    |     1      |     X      |   X    |          0           |       1      |          0           |    INSERT     |        UPDATE        |    0     |         0          |   0   |        0         |      0       |
    // |           deposit           |    key1     |     0      |   0   |     0      |           0            |    1    |     0      |     X      |   0    |          0           |       0      |          0           |    UPDATE     |        UPDATE        |    0     |         0          |   0   |        0         |      0       |
    // |       depositTransfer       |    key1     |     0      | key2  |     0      |           0            |    1    |     0      |     X      |   X    |          0           |       0      |          0           |    UPDATE     |        UPDATE        |    0     |         0          |   0   |        0         |      0       |
    // |        forceTransfer        |    key1     |     0      | key2  |     0      |           0            |    1    |     0      |     0      |   X    |          0           |       0      |          0           |    UPDATE     |        UPDATE        |    0     |         0          |   0   |        0         |      0       |
    // |          forceExit          | key1 - key2 |     0      |   1   |     0      |           0            |    1    |     0      |     0      |   X    | 0: UPDATE, 1: INSERT |       0      | X: UPDATE, 0: INSERT |    UPDATE     | EXIT INSERT - UPDATE |    1     |         0          |   0   |        0         |      0       |
    // |          transfer           |    key1     |     0      | key2  |     0      |           0            |    0    |     0      |     0      |   X    |          0           |       0      |          0           |    UPDATE     |        UPDATE        |    0     |         1          |   0   |        0         |      0       |
    // |            exit             | key1 - key2 |     0      |   1   |     0      |           0            |    0    |     0      |     0      |   X    | 0: UPDATE, 1: INSERT |       0      | X: UPDATE, 0: INSERT |    UPDATE     | EXIT INSERT - UPDATE |    1     |         1          |   0   |        0         |      0       |
    // |      transferToEthAddr      |    key1     |     0      |   0   |    key2    | ANY_ETH_ADDR != 0xF..F |    0    |     0      |     0      |   X    |          0           |       0      |          0           |    UPDATE     |        UPDATE        |    0     |         1          |   0   |        1         |      0       |
    // |        transferToBjj        |    key1     |     0      |   0   |    key2    | ANY_ETH_ADDR == 0xF..F |    0    |     0      |     0      |   X    |          0           |       0      |          0           |    UPDATE     |        UPDATE        |    0     |         1          |   0   |        1         |      1       |
    // |             nop             |      0      |     0      |   0   |     0      |           0            |    0    |     0      |     0      |   0    |          0           |       0      |          0           |      NOP      |         NOP          |    0     |         0          |   1   |        0         |      0       |

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

    signal output isP1Insert;
    signal output isP2Insert;
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
    // if the transaction is an L1 create account, 'auxFromIdx' is chosen
    // since it will be used to create the new account
    signal finalFromIdx;

    component selectFromIdx = Mux1();
    selectFromIdx.c[0] <== fromIdx;
    selectFromIdx.c[1] <== auxFromIdx;
    selectFromIdx.s <== onChain*newAccount;

    selectFromIdx.out ==> finalFromIdx;

    // Select finalToIdx
    ////////
    // if user signs 'toIdx == 0', then idx receiver would be freely chosen
    // by the coordinator and it is set on 'auxToIdx'
    // note that this might happen in 'transferToEthAddr' and 'transferToBjj' transaction types

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
    // user must sign ethereum address receiver in tx types 'transferToEthAddr' and 'transferToBjj'
    // it is set in protocol that if ethereum address signed is 0xFFFF...FFFF, babyjubjub will be also checked

    var ETH_ADDR_ANY = (1<<160) - 1; // 0xFFFF...FFFF

    component isToEthAddrAny = IsEqual();
    isToEthAddrAny.in[0] <== ETH_ADDR_ANY;
    isToEthAddrAny.in[1] <== toEthAddr;

    // Check if tx is an exit
    ////////
    // exit transaction is set by signing 'toIdx == 1'
    // which is a special account index to determine that the tx would be an exit
    var EXIT_IDX = 1;

    component checkIsExit = IsEqual();
    checkIsExit.in[0] <== EXIT_IDX;
    checkIsExit.in[1] <== finalToIdx;

    isExit <== checkIsExit.out;

    // finalFromIdx == 0 --> NOP processor 1
    ////////
    // if the tx has no account index assigned, the tx would be considered as NULL
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

    // Table processor functions:
    // | func[0] | func[1] | Function |
    // |:-------:|:-------:|:--------:|
    // |    0    |    0    |   NOP    |
    // |    0    |    1    |  UPDATE  |
    // |    1    |    0    |  INSERT  |
    // |    1    |    1    |  DELETE  |

    // select processor 1 function and key1
    ////////
    isP1Insert <== onChain*newAccount; // processor 1 performs an INSERT

    P1_fnc0 <== isP1Insert*isFinalFromIdx; // processor 1 performs NOP if finalFromIdx == 0
    P1_fnc1 <== (1-isP1Insert)*isFinalFromIdx;

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
    isP2Insert <== isExit*newExit; // processor 2 performs an INSERT

    P2_fnc0 <== isP2Insert*isFinalFromIdx; // processor 2 performs NOP if fromIdx == 0
    P2_fnc1 <== (1-isP2Insert)*isFinalFromIdx;

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
    // L2 signature is only checkd if the tx is L2 and the sender account is not NULL
     verifySignEnabled <== (1-onChain)*isFinalFromIdx;

    // nop signaling for 'balance-updater' circuit
    ////////
    nop <== finalFromIdxIsZero.out;

    // signals to check receiver in tx type 'transfertoEthAddr' or 'transferToBjj'
    ////////
    // assuming tx is not NOP:
    // - if tx type is 'transferToEthAddr', then ethereum address signed will be checked on receiver account
    // - if tx type is 'transferToBjj', then either ethereum address and Bjj address will be checked on receiver account

    signal tmpCheckToEthAddr;
    signal tmpCheckToBjj;

    tmpCheckToEthAddr <== (1 - isToEthAddrAny.out)*selectAuxToIdx;
    tmpCheckToBjj <== isToEthAddrAny.out*selectAuxToIdx;

    checkToEthAddr <== tmpCheckToEthAddr*(1 - nop);
    checkToBjj <== tmpCheckToBjj*(1 - nop);

    // Should check signed fields on L1 tx
    ////////
    // L1 invalid transactions should not be allowed but the circuit needs to process them even if they are not valid
    // In order to do so, the circuit performs a zero 'loadAmount' \ 'amount' update if L1 transaction is not valid
    // Therefore, circuit nullifies 'loadAmount' \ 'amount' if L1 invalid transaction is detected
    // Next table sets when to apply 'nullifyLoadAmount' \ 'nullifyAmount' depending on L1 transaction type

    // |     **Transaction type**     | newAccount | isLoadAmount | isAmount | checkEthAddr | checkTokenID1 |  checkTokenID2   | *nullifyLoadAmount* | *nullifyAmount* |
    // |:----------------------------:|:----------:|:------------:|:--------:|:------------:|:-------------:|:----------------:|:-------------------:|:---------------:|
    // |         createAccount        |     1      |      0       |    0     |      0       |       0       |        0         |          0          |        0        |
    // |     createAccountDeposit     |     1      |      1       |    0     |      0       |       0       |        0         |          0          |        0        |
    // | createAccountDepositTransfer |     1      |      1       |    1     |      0       |       0       |        1         |          0          |        1        |
    // |           deposit            |     0      |      1       |    0     |      0       |       1       |        0         |          1          |        0        |
    // |       depositTransfer        |     0      |      1       |    1     |      1       |       1       |        1         |          1          |        1        |
    // |        forceTransfer         |     0      |      0       |    1     |      1       |       1       |        1         |          0          |        1        |
    // |          forceExit           |     0      |      0       |    1     |      1       |       1       | 1 if newExit = 0 |          0          |        1        |

    signal onChainNotCreateAccount;
    onChainNotCreateAccount <== (1 - newAccount)*onChain; // tx is L1 and does not create an account

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
    shouldCheckTokenID2_1 <== shouldCheckTokenID2_0 * (1 - isP2Insert);

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

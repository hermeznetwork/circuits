const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;
const SMTMemDB = require("circomlib").SMTMemDB;
const Scalar = require("ffjavascript").Scalar;

const RollupDB = require("@hermeznetwork/commonjs").RollupDB;
const Account = require("@hermeznetwork/commonjs").HermezAccount;
const Constants = require("@hermeznetwork/commonjs").Constants;
const float40 = require("@hermeznetwork/commonjs").float40;

const { depositTx, assertBatch } = require("./helpers/helpers");

describe("Test rollup-main L1 transactions", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "rollup-main-L1.test.circom");
    let circuit;

    let nTx = 3;
    let nLevels = 16;
    let maxL1Tx = 2;
    let maxFeeTx = 2;

    const account1 = new Account(1);
    const account2 = new Account(2);
    const account3 = new Account(3);

    const accounts = [];
    // save idx that will be assigned during the test
    account1.idx = Constants.firstIdx + 1;
    account2.idx = Constants.firstIdx + 2;
    account3.idx = Constants.firstIdx + 3;
    accounts.push(account1);
    accounts.push(account2);
    accounts.push(account3);

    async function newState(){
        const db = new SMTMemDB();
        const rollupDB = await RollupDB(db);
        return rollupDB;
    }

    before( async() => {
        const circuitCode = `
            include "../src/rollup-main.circom";
            component main = RollupMain(${nTx}, ${nLevels}, ${maxL1Tx}, ${maxFeeTx});
        `;

        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints: " + circuit.constraints.length + "\n");

        // const testerAux = require("circom").testerAux;
        // const pathTmp = "/tmp/circom_21395lnVeHFrhxFAm";
        // circuit = await testerAux(pathTmp, path.join(__dirname, "circuits", "rollup-main-L1.test.circom"));
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    // table parameters L1 transactions
    // UP: user param
    // ME: must exist

    // |     **Transaction type**     | toIdx | tokenID |  amountF   | loadAmountF | fromIdx | fromBjj-compressed | fromEthAddr |
    // |:----------------------------:|:-----:|:-------:|:----------:|:-----------:|:-------:|:------------------:|:-----------:|
    // |        createAccount         |   0   |  UP,ME  |     0      |      0      |    0    |      UP (!=0)      | msg.sender  |
    // |     createAccountDeposit     |   0   |  UP,ME  |     0      | UP < 2^128  |    0    |      UP (!=0)      | msg.sender  |
    // | createAccountDepositTransfer | UP,ME |  UP,ME  | UP < 2^192 | UP < 2^128  |    0    |      UP (!=0)      | msg.sender  |
    // |           deposit            |   0   |  UP,ME  |     0      | UP < 2^128  |  UP,ME  |         0          | msg.sender  |
    // |       depositTransfer        | UP,ME |  UP,ME  | UP < 2^192 | UP < 2^128  |  UP,ME  |         0          | msg.sender  |
    // |        forceTransfer         | UP,ME |  UP,ME  | UP < 2^192 |      0      |  UP,ME  |         0          | msg.sender  |
    // |          forceExit           |   1   |  UP,ME  | UP < 2^192 |      0      |  UP,ME  |         0          | msg.sender  |

    // |     **Transaction type**     | newAccount | isLoadAmount | isAmount | checkEthAddr | checkTokenID1 |  checkTokenID2   | *nullifyLoadAmount* | *nullifyAmount* |
    // |:----------------------------:|:----------:|:------------:|:--------:|:------------:|:-------------:|:----------------:|:-------------------:|:---------------:|
    // |         createAccount        |     1      |      0       |    0     |      0       |       0       |        0         |          0          |        0        |
    // |     createAccountDeposit     |     1      |      1       |    0     |      0       |       0       |        0         |          0          |        0        |
    // | createAccountDepositTransfer |     1      |      1       |    1     |      0       |       0       |        1         |          0          |        1        |
    // |           deposit            |     0      |      1       |    0     |      0       |       1       |        0         |          1          |        0        |
    // |       depositTransfer        |     0      |      1       |    1     |      1       |       1       |        1         |          0          |        1        |
    // |        forceTransfer         |     0      |      0       |    1     |      1       |       1       |        1         |          0          |        1        |
    // |          forceExit           |     0      |      0       |    1     |      1       |       1       | 1 if newExit = 0 |          0          |        1        |

    it("Should process L1 'createAccount' txs edge cases", async () => {
        const rollupDB = await newState();

        // standard transaction
        const tx = {
            fromIdx: 0,
            loadAmountF: 0,
            tokenID: 1,
            amountF: 0,
            fromBjjCompressed: account1.bjjCompressed,
            fromEthAddr: account1.ethAddr,
            toIdx: 0,
            onChain: true,
        };

        // fromBjj param
        let bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        // invalid Bjj
        const tx1 = Object.assign({}, tx);
        tx1.fromBjjCompressed = "0x12345";

        bb.addTx(tx);
        bb.addTx(tx1);
        await bb.build();
        await assertBatch(bb, circuit);

        // 0xff..ff Bjj
        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        const tx3 = Object.assign({}, tx);
        tx3.fromBjjCompressed = Scalar.sub(Scalar.shl(1, 256), 1).toString(16);
        bb.addTx(tx3);
        await bb.build();
        await assertBatch(bb, circuit);
    });


    it("Should process L1 'createAccountDeposit' txs edge cases", async () => {
        const rollupDB = await newState();

        // standard transaction
        const tx = {
            fromIdx: 0,
            loadAmountF: float40.fix2Float(100),
            amountF: 0,
            tokenID: 1,
            fromBjjCompressed: account1.bjjCompressed,
            fromEthAddr: account1.ethAddr,
            toIdx: 0,
            onChain: true,
        };

        // fromBjj edge cases has been tested in `createAccount`

        // loadAmountF
        let bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        // 0 and 0xffff loadAmountF
        const tx1 = Object.assign({}, tx);
        tx1.loadAmountF = 0;

        const tx2 = Object.assign({}, tx);
        tx2.loadAmountF = 0xFFFF;

        bb.addTx(tx1);
        bb.addTx(tx2);
        await bb.build();
        await assertBatch(bb, circuit);
    });

    it("Should process L1 'createAccountDepositTransfer' txs edge cases", async () => {
        const rollupDB = await newState();
        let bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, account1, 1, 1000);
        await depositTx(bb, account2, 2, 1000);

        await bb.build();
        await rollupDB.consolidate(bb);

        // standard transaction
        const tx = {
            fromIdx: 0,
            loadAmountF: 500,
            tokenID: 1,
            fromBjjCompressed: account3.bjjCompressed,
            fromEthAddr: account3.ethAddr,
            toIdx: account1.idx,
            amountF: 100,
            userFee: 0,
            onChain: true
        };

        // fromBjj edge cases has been tested in `createAccount`
        // loadAmountF edge cases has been tested in `createAccountDeposit`

        // 0 and 0xffff amountF
        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        const tx1 = Object.assign({}, tx);
        tx1.amountF = 0;

        const tx2 = Object.assign({}, tx);
        tx2.amountF = 0xFFFF; // not enough funds in sender. Nullify amount transfer.

        bb.addTx(tx1);
        bb.addTx(tx2);
        await bb.build();
        await assertBatch(bb, circuit);

        // 0xffff on with amountF and loadAmountF
        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        const tx3 = Object.assign({}, tx);
        tx3.loadAmountF = 0xFFFF;
        tx3.amountF = 0xFFFF; // enough funds in sender. Transfer with all loadAmount.

        bb.addTx(tx3);
        await bb.build();
        await assertBatch(bb, circuit);

        // wrong tokenID to perform transfer
        // action: nullifyAmount
        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        const tx4 = Object.assign({}, tx);
        tx4.toIdx = account2.idx;

        bb.addTx(tx4);
        await bb.build();
        await assertBatch(bb, circuit);
    });

    it("Should process L1 'deposit' txs edge cases", async () => {
        const rollupDB = await newState();
        let bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, account1, 1, 1000);
        await depositTx(bb, account2, 2, 1000);

        await bb.build();
        await rollupDB.consolidate(bb);

        // standard transaction
        const tx = {
            fromIdx: account1.idx,
            loadAmountF: 500,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: 0,
            amountF: 0,
            userFee: 0,
            onChain: true
        };

        // fromIdx does not match with its tokenID
        // action: nullify loadAmount
        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        const tx1 = Object.assign({}, tx);
        tx1.tokenID = 2;

        bb.addTx(tx1);
        await bb.build();
        await assertBatch(bb, circuit);

        // random msg.sender
        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        const tx2 = Object.assign({}, tx);
        tx2.fromEthAddr = "0xD8Af0C5c6dEE7dCe32E59577675C026e1aDe4De5";

        bb.addTx(tx2);
        await bb.build();
        await assertBatch(bb, circuit);

        // loadAmountF = 0
        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        const tx3 = Object.assign({}, tx);
        tx3.loadAmountF = 0;

        bb.addTx(tx3);
        await bb.build();
        await assertBatch(bb, circuit);
    });

    it("Should process L1 'depositTransfer' txs edge cases", async () => {
        const rollupDB = await newState();
        let bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, account1, 1, 1000);
        await depositTx(bb, account2, 2, 1000);

        await bb.build();
        await rollupDB.consolidate(bb);

        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, account3, 1, 1000);
        await bb.build();
        await rollupDB.consolidate(bb);

        // standard transaction
        const tx = {
            fromIdx: account1.idx,
            loadAmountF: 200,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: account3.idx,
            amountF: 100,
            userFee: 184,
            onChain: true
        };

        // fromIdx does not match with tokenID, toIdx match with tokenID
        // try to deposit to a leaf that does not have the same tokenID ==> nullify loadAmount
        // try to transfer from a sender that does not have the same tokenID as the receiver ==> nullify amount
        // action: nullify loadAmount and nullify amount
        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        await depositTx(bb, account3, 1, 1000);

        const tx1 = Object.assign({}, tx);
        tx1.tokenID = 2;

        bb.addTx(tx1);
        await bb.build();
        await assertBatch(bb, circuit);

        // toIdx does not match with tokenID
        // try to transfer from a sender that does not have the same tokenID as the receiver ==> nullify amount
        // action: nullify amount
        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        const tx2 = Object.assign({}, tx);
        tx2.toIdx = account2.idx;

        bb.addTx(tx2);
        await bb.build();
        await assertBatch(bb, circuit);

        // fromEthAddr does not match fromIdx ethAddr
        // could not perform any transaction on fromIdx behalf ==> nullify amount
        // action: nullify amount
        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        const tx3 = Object.assign({}, tx);
        tx3.fromEthAddr = account3.ethAddr;

        bb.addTx(tx3);
        await bb.build();
        await assertBatch(bb, circuit);
    });

    it("Should process L1 'forceTransfer' txs edge cases", async () => {
        const rollupDB = await newState();
        let bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, account1, 1, 1000);
        await depositTx(bb, account2, 2, 1000);

        await bb.build();
        await rollupDB.consolidate(bb);

        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, account3, 1, 1000);
        await bb.build();
        await rollupDB.consolidate(bb);

        // standard transaction
        const tx = {
            fromIdx: account1.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: account3.idx,
            amount: 500,
            userFee: 0,
            onChain: true
        };

        // try to transfer from a sender that does not have the same tokenID as the receiver ==> nullify amount
        // action: nullify loadAmount and nullify amount
        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        const tx1 = Object.assign({}, tx);
        tx1.toIdx = account2.idx;

        bb.addTx(tx1);
        await bb.build();
        await assertBatch(bb, circuit);

        // fromIdx does not match with tokenID
        // try to transfer from a wrong leaf ==> nullify amount
        // action: nullify amount
        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        const tx2 = Object.assign({}, tx);
        tx2.toIdx = account2.idx;
        tx2.tokenID = 2;

        bb.addTx(tx2);
        await bb.build();
        await assertBatch(bb, circuit);

        // fromEthAddr does not match fromIdx ethAddr
        // could not perform any transaction on fromIdx behalf ==> nullify amount
        // nullify amount
        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        const tx3 = Object.assign({}, tx);
        tx3.fromEthAddr = account3.ethAddr;

        bb.addTx(tx3);
        await bb.build();
        await assertBatch(bb, circuit);

        // transfer 0 amount
        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        const tx4 = Object.assign({}, tx);
        tx4.amount = 0;

        bb.addTx(tx4);
        await bb.build();
        await assertBatch(bb, circuit);

        // 2 transfers: amount != 0 & amount = 0
        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        const tx5 = Object.assign({}, tx);
        const tx6 = Object.assign({}, tx);
        tx6.amount = 0;

        bb.addTx(tx5);
        bb.addTx(tx6);
        await bb.build();
        await assertBatch(bb, circuit);
    });

    it("Should process L1 'forceExit' txs edge cases", async () => {
        const rollupDB = await newState();
        let bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, account1, 1, 1000);
        await depositTx(bb, account2, 2, 1000);

        await bb.build();
        await rollupDB.consolidate(bb);

        // standard transaction
        const tx = {
            fromIdx: account1.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: Constants.exitIdx,
            amount: 100,
            userFee: 0,
            onChain: true
        };

        // fromIdx does not match with tokenID
        // try to transfer from a wrong leaf ==> nullify amount
        // action: nullify amount
        // note: exit is performed with 0 amount. Since it is the first exit tx,
        // it will create a leaf in the exit tree with 0 amount
        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        const tx2 = Object.assign({}, tx);
        tx2.tokenID = 2;

        bb.addTx(tx2);
        await bb.build();
        await assertBatch(bb, circuit);

        // fromEthAddr does not match fromIdx ethAddr
        // could not perform any transaction on fromIdx behalf ==> nullify amount
        // action: nullify amount
        // it will create a leaf in the exit tree with 0 amount
        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        const tx3 = Object.assign({}, tx);
        tx3.fromEthAddr = account2.ethAddr;

        bb.addTx(tx3);
        await bb.build();
        await assertBatch(bb, circuit);

        // force exit with amount = 0
        // should not create a new leaf in the exit tree
        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        const tx4 = Object.assign({}, tx);
        tx4.amount = 0;

        bb.addTx(tx4);
        await bb.build();
        await assertBatch(bb, circuit);

        // 2 force exits: amount != 0 & amount = 0
        // should not create a new leaf in the exit tree
        bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        const tx5 = Object.assign({}, tx);
        const tx6 = Object.assign({}, tx);
        tx6.amount = 0;

        bb.addTx(tx5);
        bb.addTx(tx6);
        await bb.build();
        await assertBatch(bb, circuit);
    });
});

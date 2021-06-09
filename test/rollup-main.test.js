const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;
const SMTMemDB = require("circomlib").SMTMemDB;

const RollupDB = require("@hermeznetwork/commonjs").RollupDB;
const Account = require("@hermeznetwork/commonjs").HermezAccount;
const Constants = require("@hermeznetwork/commonjs").Constants;
const txUtils = require("@hermeznetwork/commonjs").txUtils;
const float40 = require("@hermeznetwork/commonjs").float40;

const { depositTx, assertBatch, assertAccountsBalances } = require("./helpers/helpers");

describe("Test rollup-main", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "rollup-main.test.circom");
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
        // const pathTmp = "/tmp/circom_24246Z1wv2psTPy6l";
        // circuit = await testerAux(pathTmp, path.join(__dirname, "circuits", "rollup-main.test.circom"));
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    it("Should check empty tx", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await bb.build();

        await assertBatch(bb, circuit);
    });

    it("Should check L1 'createAccount'", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, account1, 1, 0);
        await depositTx(bb, account2, 2, 0);
        await bb.build();
        await rollupDB.consolidate(bb);
        await assertBatch(bb, circuit);

        const bb2 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb2, account3, 1, 0);
        await bb2.build();
        await rollupDB.consolidate(bb2);
        await assertBatch(bb2, circuit);

        await assertAccountsBalances(accounts, [0, 0, 0], rollupDB);
    });

    it("Should check L1 'createAccountDeposit' & L1 'deposit' txs", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, account1, 1, 1000);
        await bb.build();
        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        const tx = {
            fromIdx: account1.idx,
            loadAmountF: 500,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: 0,
            amount: 0,
            userFee: 0,
            onChain: true
        };
        bb2.addTx(tx);
        await bb2.build();
        await rollupDB.consolidate(bb2);

        await assertBatch(bb2, circuit);
        await assertAccountsBalances(accounts, [1500, null, null], rollupDB);
    });

    it("Should check L1 'createAccountDepositTransfer' & L1 'depositTransfer' txs", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, account1, 1, 1000);
        await depositTx(bb, account2, 1, 1000);
        await bb.build();

        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        const tx = {
            fromIdx: 0,
            loadAmountF: 500,
            tokenID: 1,
            fromBjjCompressed: account3.bjjCompressed,
            fromEthAddr: account3.ethAddr,
            toIdx: account1.idx,
            amount: 100,
            userFee: 0,
            onChain: true
        };

        const tx2 = {
            fromIdx: account3.idx,
            loadAmountF: 200,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account3.ethAddr,
            toIdx: account2.idx,
            amount: 100,
            userFee: 126,
            onChain: true
        };

        bb2.addTx(tx);
        bb2.addTx(tx2);
        await bb2.build();
        await rollupDB.consolidate(bb2);

        await assertBatch(bb2, circuit);
        await assertAccountsBalances(accounts, [1100, 1100, 500], rollupDB);
    });

    it("Should check L1 'forceTransfer' & L1 'forceExit' txs", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, account1, 1, 1000);
        await depositTx(bb, account2, 1, 1000);
        await bb.build();

        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        const tx = {
            fromIdx: account1.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: account2.idx,
            amount: 100,
            userFee: 0,
            onChain: true
        };

        const tx2 = {
            fromIdx: account1.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: Constants.exitIdx,
            amount: 300,
            userFee: 0,
            onChain: true
        };

        bb2.addTx(tx);
        bb2.addTx(tx2);
        await bb2.build();
        await rollupDB.consolidate(bb2);

        await assertBatch(bb2, circuit);
        await assertAccountsBalances(accounts, [600, 1100, null], rollupDB);

        // perform two L1 exits in the same batch

        const bb3 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        const tx3 = {
            fromIdx: account2.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account2.ethAddr,
            toIdx: Constants.exitIdx,
            amount: 550,
            userFee: 0,
            onChain: true
        };

        const tx4 = {
            fromIdx: account2.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account2.ethAddr,
            toIdx: Constants.exitIdx,
            amount: 550,
            userFee: 0,
            onChain: true
        };

        bb3.addTx(tx3);
        bb3.addTx(tx4);
        await bb3.build();
        await rollupDB.consolidate(bb3);

        await assertBatch(bb3, circuit);
        await assertAccountsBalances(accounts, [600, 0, null], rollupDB);
    });

    it("Should check L2 'transfer' & L2 'exit' txs", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, account1, 1, 1000);
        await depositTx(bb, account2, 1, 1000);
        await bb.build();

        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        const tx = {
            fromIdx: account1.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: account2.idx,
            amount: 100,
            userFee: 0,
            onChain: 0,
            nonce: 0,
        };

        const tx2 = {
            fromIdx: account2.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: Constants.exitIdx,
            amount: 100,
            userFee: 0,
            nonce: 0,
            onChain: 0,
        };

        account1.signTx(tx);
        account2.signTx(tx2);
        bb2.addTx(tx);
        bb2.addTx(tx2);
        await bb2.build();

        await rollupDB.consolidate(bb2);

        await assertBatch(bb2, circuit);
        await assertAccountsBalances(accounts, [900, 1000, null], rollupDB);

        // perform two exits in the same batch
        const bb3 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        const tx3 = {
            fromIdx: account2.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: Constants.exitIdx,
            amount: 525,
            userFee: 0,
            nonce: 1,
            onChain: 0,
        };

        const tx4 = {
            fromIdx: account2.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: Constants.exitIdx,
            amount: 450,
            userFee: 0,
            nonce: 2,
            onChain: 0,
        };

        account2.signTx(tx3);
        account2.signTx(tx4);
        bb3.addTx(tx3);
        bb3.addTx(tx4);
        await bb3.build();

        await rollupDB.consolidate(bb3);

        await assertBatch(bb3, circuit);
        await assertAccountsBalances(accounts, [900, 25, null], rollupDB);
    });

    it("Should check L2 'transfer' & L2 'exit' with 0 amount", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, account1, 1, 1000);
        await depositTx(bb, account2, 1, 1000);
        await bb.build();

        await rollupDB.consolidate(bb);

        // transfer with amount = 0
        const bb2 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        const tx = {
            fromIdx: account1.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: account2.idx,
            amount: 0,
            userFee: 0,
            onChain: 0,
            nonce: 0,
        };

        account1.signTx(tx);
        bb2.addTx(tx);
        await bb2.build();

        await rollupDB.consolidate(bb2);

        await assertBatch(bb2, circuit);
        await assertAccountsBalances(accounts, [1000, 1000, null], rollupDB);

        // exit with amount = 0
        const bb3 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        const tx2 = {
            fromIdx: account2.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: Constants.exitIdx,
            amount: 0,
            userFee: 0,
            nonce: 0,
            onChain: 0,
        };

        account2.signTx(tx2);
        bb3.addTx(tx2);
        await bb3.build();

        await rollupDB.consolidate(bb3);

        await assertBatch(bb3, circuit);
        await assertAccountsBalances(accounts, [1000, 1000, null], rollupDB);

        // perform two exits in the same batch
        // first one with amount != 0 and second one with amount = 0
        const bb4 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        const tx3 = {
            fromIdx: account2.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: Constants.exitIdx,
            amount: 500,
            userFee: 0,
            nonce: 1,
            onChain: 0,
        };

        const tx4 = {
            fromIdx: account2.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: Constants.exitIdx,
            amount: 0,
            userFee: 0,
            nonce: 2,
            onChain: 0,
        };

        account2.signTx(tx3);
        account2.signTx(tx4);
        bb4.addTx(tx3);
        bb4.addTx(tx4);
        await bb4.build();

        await rollupDB.consolidate(bb4);

        await assertBatch(bb4, circuit);
        await assertAccountsBalances(accounts, [1000, 500, null], rollupDB);

        // perform two transfers in the same batch
        // first one with amount != 0 and second one with amount = 0
        const bb5 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        const tx5 = {
            fromIdx: account1.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: account2.idx,
            amount: 500,
            userFee: 0,
            nonce: 1,
            onChain: 0,
        };

        const tx6 = {
            fromIdx: account1.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: account2.idx,
            amount: 0,
            userFee: 0,
            nonce: 2,
            onChain: 0,
        };

        account1.signTx(tx5);
        account1.signTx(tx6);
        bb5.addTx(tx5);
        bb5.addTx(tx6);
        await bb5.build();

        await rollupDB.consolidate(bb5);

        await assertBatch(bb5, circuit);
        await assertAccountsBalances(accounts, [500, 1000, null], rollupDB);
    });

    it("Should check L2 'transfer' with fees & L2 'fee' txs", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, account1, 1, 1000);
        await depositTx(bb, account2, 1, 1000);
        await bb.build();

        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        await depositTx(bb2, account3, 1, 0);

        const tx = {
            fromIdx: account1.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: account2.idx,
            amount: 150,
            userFee: 126,
            onChain: 0,
            nonce: 0,
        };

        const tx2 = {
            fromIdx: account2.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: Constants.exitIdx,
            amount: 100,
            userFee: 68,
            nonce: 0,
            onChain: 0,
        };

        const tx3 = {
            fromIdx: account1.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: account1.idx,
            amount: 150,
            userFee: 184,
            onChain: 0,
            nonce: 1,
        };

        account1.signTx(tx);
        account2.signTx(tx2);
        account1.signTx(tx3);


        bb2.addTx(tx);
        bb2.addTx(tx2);
        bb2.addToken(tx.tokenID);
        bb2.addFeeIdx(account3.idx);
        await bb2.build();
        await rollupDB.consolidate(bb2);

        const bb3 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        bb3.addTx(tx3);
        bb3.addToken(tx.tokenID);
        bb3.addFeeIdx(account3.idx);
        await bb3.build();

        await rollupDB.consolidate(bb3);

        await assertBatch(bb2, circuit);
        await assertBatch(bb3, circuit);
        await assertAccountsBalances(accounts, [722, 1049, 129], rollupDB);
    });

    it("Should check L2 'transfer to ethAddr' & L2 'transfer to Bjj' txs", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, account1, 1, 1000);
        // simulate L1 coordinator create Bjj account
        bb.addTx({
            fromIdx: 0,
            loadAmountF: float40.fix2Float(1000),
            tokenID: 1,
            fromBjjCompressed: account2.bjjCompressed,
            fromEthAddr: Constants.nullEthAddr,
            toIdx: 0,
            onChain: true
        });
        await bb.build();

        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        await depositTx(bb2, account3, 1, 0);

        const tx = {
            fromIdx: account2.idx,
            toIdx: Constants.nullIdx,
            toEthAddr: account1.ethAddr,
            tokenID: 1,
            amount: 500,
            nonce: 0,
            userFee: 184,
        };

        const tx2 = {
            fromIdx: account1.idx,
            toIdx: Constants.nullIdx,
            toEthAddr: Constants.nullEthAddr,
            toBjjAy: account2.ay,
            toBjjSign: account2.sign,
            tokenID: 1,
            amount: 100,
            nonce: 0,
            userFee: 0,
        };

        account2.signTx(tx);
        account1.signTx(tx2);
        bb2.addTx(tx);
        bb2.addTx(tx2);

        bb2.addToken(tx.tokenID);
        bb2.addFeeIdx(account3.idx);

        await bb2.build();

        await rollupDB.consolidate(bb2);

        await assertBatch(bb2, circuit);
        await assertAccountsBalances(accounts, [1400, 222, 378], rollupDB);
    });

    it("Should check error L2 'transfer' with rqOffset txs", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, account1, 1, 1000);
        await depositTx(bb, account2, 1, 1000);
        await bb.build();

        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        const tx = {
            fromIdx: account1.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: account2.idx,
            amount: 150,
            userFee: 126,
            onChain: 0,
            nonce: 0,
        };

        const tx2 = {
            fromIdx: account2.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: account1.idx,
            amount: 100,
            userFee: 126,
            nonce: 0,
            onChain: 0,
        };

        // tx2 to be processed only if tx1 is processed before
        tx2.rqOffset = 7; // pastTx[0]
        tx2.rqTxCompressedDataV2 = txUtils.buildTxCompressedDataV2(tx);
        tx2.rqToEthAddr = tx.toEthAddr || 0;
        tx2.rqToBjjAy = tx.toBjjAy || 0;

        account1.signTx(tx);
        account2.signTx(tx2);
        bb2.addTx(tx);
        bb2.addTx(tx2);
        bb2.addToken(tx.tokenID);
        await bb2.build();

        await assertBatch(bb2, circuit);

        // Switch transaction order
        const bb3 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        bb3.addTx(tx2);
        bb3.addTx(tx);
        bb3.addToken(tx.tokenID);
        await bb3.build();

        try {
            await assertBatch(bb3, circuit);
            expect(true).to.be.equal(false);
        } catch (error){
            expect(error.message.includes("Constraint doesn't match")).to.be.equal(true);
        }

        // sign tx2 again with proper rqOffset
        const bb4 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        tx2.rqOffset = 1;
        account2.signTx(tx2);
        bb4.addTx(tx2);
        bb4.addTx(tx);
        bb4.addToken(tx.tokenID);
        await bb4.build();

        await assertBatch(bb4, circuit);
    });

    it("Should check L2 'transfer to ethAddr' with rqOffset txs", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, account1, 1, 1000);
        await depositTx(bb, account2, 1, 1000);
        await bb.build();

        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        const tx = {
            fromIdx: account1.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: Constants.nullIdx,
            toEthAddr: account1.ethAddr,
            amount: 150,
            userFee: 126,
            onChain: 0,
            nonce: 0,
        };

        const tx2 = {
            fromIdx: account2.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: account1.idx,
            amount: 100,
            userFee: 126,
            nonce: 0,
            onChain: 0,
        };

        // tx2 to be processed only if tx1 is processed before
        tx2.rqOffset = 7; // pastTx[0]
        tx2.rqTxCompressedDataV2 = txUtils.buildTxCompressedDataV2(tx);
        tx2.rqToEthAddr = tx.toEthAddr || 0;
        tx2.rqToBjjAy = tx.toBjjAy || 0;

        account1.signTx(tx);
        account2.signTx(tx2);
        bb2.addTx(tx);
        bb2.addTx(tx2);
        bb2.addToken(tx.tokenID);
        await bb2.build();

        await assertBatch(bb2, circuit);
    });

    it("Should check L2 'transfer to bjj' with rqOffset txs", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, account1, 1, 1000);
        // simulate L1 coordinator create Bjj account
        bb.addTx({
            fromIdx: 0,
            loadAmountF: float40.fix2Float(1000),
            tokenID: 1,
            fromBjjCompressed: account2.bjjCompressed,
            fromEthAddr: Constants.nullEthAddr,
            toIdx: Constants.nullIdx,
            onChain: true
        });
        await bb.build();

        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        const tx = {
            fromIdx: account1.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: Constants.nullIdx,
            toEthAddr: Constants.nullEthAddr,
            toBjjAy: account2.ay,
            toBjjSign: account2.sign,
            amount: 150,
            userFee: 126,
            onChain: 0,
            nonce: 0,
        };

        const tx2 = {
            fromIdx: account2.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: account1.idx,
            amount: 100,
            userFee: 126,
            nonce: 0,
            onChain: 0,
        };

        // tx2 to be processed only if tx1 is processed before
        tx2.rqOffset = 7; // pastTx[0]
        tx2.rqTxCompressedDataV2 = txUtils.buildTxCompressedDataV2(tx);
        tx2.rqToEthAddr = tx.toEthAddr || 0;
        tx2.rqToBjjAy = tx.toBjjAy || 0;

        account1.signTx(tx);
        account2.signTx(tx2);
        bb2.addTx(tx);
        bb2.addTx(tx2);
        bb2.addToken(tx.tokenID);
        await bb2.build();

        await assertBatch(bb2, circuit);
    });

    it("Should check L2 'transfer' with maxNumBatch", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, account1, 1, 1000);
        await depositTx(bb, account2, 1, 1000);
        await bb.build();

        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

        // transaction with: maxNumBatch > currentNumBatch
        const tx = {
            fromIdx: account1.idx,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: account2.idx,
            amount: 100,
            userFee: 0,
            onChain: 0,
            nonce: 0,
            maxNumBatch: Number(bb2.currentNumBatch) + 1
        };

        account1.signTx(tx);
        bb2.addTx(tx);
        await bb2.build();
        await assertBatch(bb2, circuit);

        // transaction with: maxNumBatch = currentNumBatch
        const bb3 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        tx.maxNumBatch = Number(bb3.currentNumBatch);
        account1.signTx(tx);
        bb3.addTx(tx);
        await bb3.build();
        await assertBatch(bb3, circuit);

        // transaction with: maxNumBatch < currentNumBatch
        const bb4 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        tx.maxNumBatch = Number(bb4.currentNumBatch);
        // sign correct maxNumBatch transaction
        account1.signTx(tx);
        bb4.addTx(tx);
        await bb4.build();
        const input = bb4.getInput();

        // manipulate input with maxNumBatch < currentNumBatch
        const txIndex = 0;
        input.maxNumBatch[txIndex] = Number(bb4.currentNumBatch) - 1;

        try {
            await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
            expect(true).to.be.equal(false);
        } catch (error){
            expect(error.message.includes("Constraint doesn't match")).to.be.equal(true);
        }
    });
});

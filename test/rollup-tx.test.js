const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;
const Scalar = require("ffjavascript").Scalar;
const SMTMemDB = require("circomlib").SMTMemDB;

const RollupDB = require("@hermeznetwork/commonjs").RollupDB;
const Account = require("@hermeznetwork/commonjs").HermezAccount;
const Constants = require("@hermeznetwork/commonjs").Constants;
const float40 = require("@hermeznetwork/commonjs").float40;

const { depositTx, getSingleTxInput, assertTxs } = require("./helpers/helpers");

describe("Test rollup-tx", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "rollup-tx.test.circom");
    let circuit;

    const nLevels = 16;
    const nTokens = 16;
    const maxTx = 4;
    const maxL1Tx = 2;

    const account1 = new Account(1);
    const account2 = new Account(2);
    const account3 = new Account(3);

    async function newState(){
        const db = new SMTMemDB();
        const rollupDB = await RollupDB(db);
        return rollupDB;
    }

    before( async() => {
        const circuitCode = `
            include "../src/rollup-tx.circom";
            component main = RollupTx(${nLevels}, ${nTokens});
        `;

        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints: " + circuit.constraints.length + "\n");

        // const testerAux = require("circom").testerAux;
        // const pathTmp = "/tmp/circom_5800w3wbQYws58WN";
        // circuit = await testerAux(pathTmp, path.join(__dirname, "circuits", "rollup-tx.test.circom"));
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    it("Should check nop tx", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        await bb.build();

        await assertTxs(bb, circuit);
    });

    it("Should check L1 'createAccount' tx", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 0);
        await bb.build();

        await assertTxs(bb, circuit);
    });

    it("Should check L1 'createAccountDeposit' tx", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 1000);
        await bb.build();

        await assertTxs(bb, circuit);
    });

    it("Should check L1 'createAccountDepositTransfer' tx", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 1000);
        await bb.build();
        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        const tx = {
            fromIdx: 0,
            loadAmountF: 500,
            tokenID: 1,
            fromBjjCompressed: account2.bjjCompressed,
            fromEthAddr: account2.ethAddr,
            toIdx: 256,
            amount: 100,
            userFee: 0,
            onChain: true
        };
        bb2.addTx(tx);
        await bb2.build();

        await assertTxs(bb2, circuit);
    });

    it("Should check L1 'deposit' tx", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 1000);
        await bb.build();
        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        const tx = {
            fromIdx: 256,
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

        await assertTxs(bb2, circuit);
    });

    it("Should check L1 'depositTransfer' tx", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 1000);
        depositTx(bb, account2, 1, 2000);
        await bb.build();
        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        const tx = {
            fromIdx: 256,
            loadAmountF: 200,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: 257,
            amount: 100,
            userFee: 126,
            onChain: true
        };
        bb2.addTx(tx);
        await bb2.build();

        await assertTxs(bb2, circuit);
    });

    it("Should check L1 'forceTransfer' tx", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 1000);
        depositTx(bb, account2, 1, 2000);
        await bb.build();
        await rollupDB.consolidate(bb);

        // force transfer with amount != 0
        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        const tx = {
            fromIdx: 256,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: 257,
            amount: 100,
            userFee: 0,
            onChain: true
        };
        const tx2 = Object.assign({}, tx);

        bb2.addTx(tx);
        await bb2.build();

        await assertTxs(bb2, circuit);

        // force transfer with 0 amount
        const bb3 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        tx2.amount = 0;
        bb3.addTx(tx2);
        await bb3.build();

        await assertTxs(bb3, circuit);

        // two force transfers: amount != 0  & amount = 0
        const bb4 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        bb4.addTx(tx);
        bb4.addTx(tx2);
        await bb4.build();

        await assertTxs(bb4, circuit);
    });

    it("Should check L1 'forceExit' tx", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 1000);
        depositTx(bb, account2, 1, 2000);
        await bb.build();
        await rollupDB.consolidate(bb);

        // force exit with amount != 0
        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        const tx = {
            fromIdx: 256,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: Constants.exitIdx,
            amount: 100,
            userFee: 0,
            onChain: true
        };
        const tx2 = Object.assign({}, tx);

        bb2.addTx(tx);
        await bb2.build();

        await assertTxs(bb2, circuit);

        // two force exits in the same batch
        const bb3 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        bb3.addTx(tx);
        bb3.addTx(tx);
        await bb3.build();

        await assertTxs(bb3, circuit);

        // force exit with 0 amount
        const bb4 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        tx2.amount = 0;

        bb4.addTx(tx2);
        await bb4.build();

        await assertTxs(bb4, circuit);

        // two force exits: amount != 0  & amount = 0
        const bb5 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        bb5.addTx(tx);
        bb5.addTx(tx2);
        await bb5.build();

        await assertTxs(bb5, circuit);
    });

    it("Should check L2 'transfer' tx", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 1000);
        depositTx(bb, account2, 1, 2000);
        await bb.build();
        await rollupDB.consolidate(bb);

        // transfer with amount != 0
        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        const tx = {
            fromIdx: 256,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: 257,
            amount: 100,
            userFee: 184,
            onChain: 0,
            nonce: 0,
        };
        const tx2 = Object.assign({}, tx);
        const tx3 = Object.assign({}, tx);
        const tx4 = Object.assign({}, tx);

        account1.signTx(tx);

        bb2.addTx(tx);
        bb2.addToken(tx.tokenID);
        await bb2.build();

        await assertTxs(bb2, circuit);

        // transfer with amount = 0
        const bb3 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        tx2.amount = 0;
        account1.signTx(tx2);

        bb3.addTx(tx2);
        bb3.addToken(tx2.tokenID);
        await bb3.build();

        await assertTxs(bb3, circuit);

        // two transfers: amount != 0 & amount = 0
        const bb4 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        account1.signTx(tx3);
        tx4.amount = 0;
        tx4.nonce = 1;
        account1.signTx(tx4);

        bb4.addTx(tx3);
        bb4.addTx(tx4);
        bb4.addToken(tx3.tokenID);
        await bb4.build();

        await assertTxs(bb4, circuit);
    });

    it("Should check L2 'exit' tx", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 1000);
        depositTx(bb, account2, 1, 2000);
        await bb.build();
        await rollupDB.consolidate(bb);

        // exit with amount != 0
        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        const tx = {
            fromIdx: 256,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: Constants.exitIdx,
            amount: 100,
            userFee: 184,
            nonce: 0,
            onChain: 0,
        };
        const tx2 = Object.assign({}, tx);
        const tx3 = Object.assign({}, tx);
        const tx4 = Object.assign({}, tx);
        const tx5 = Object.assign({}, tx);

        account1.signTx(tx);

        bb2.addTx(tx);
        await bb2.build();

        await assertTxs(bb2, circuit);

        // two exits with amount != 0
        const bb3 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        account1.signTx(tx2);
        tx3.nonce = 1;
        account1.signTx(tx3);

        bb3.addTx(tx2);
        bb3.addTx(tx3);
        await bb3.build();

        await assertTxs(bb3, circuit);

        // exit with amount = 0
        const bb4 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        tx4.amount = 0;
        account1.signTx(tx4);

        bb4.addTx(tx4);
        await bb4.build();

        await assertTxs(bb4, circuit);

        // two exits: amount != 0 & amount = 0
        const bb5 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        account1.signTx(tx4);
        tx5.amount = 0;
        tx5.nonce = 1;
        account1.signTx(tx5);

        bb5.addTx(tx4);
        bb5.addTx(tx5);
        await bb5.build();

        await assertTxs(bb5, circuit);
    });

    it("Should check L2 'transfer to ethAddr' tx", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 1000);
        depositTx(bb, account2, 1, 2000);
        await bb.build();
        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        const tx = {
            fromIdx: 256,
            toIdx: Constants.nullIdx,
            toEthAddr: account2.ethAddr,
            tokenID: 1,
            amount: Scalar.e(50),
            nonce: 0,
            userFee: 126,
        };

        account1.signTx(tx);
        bb2.addTx(tx);

        await bb2.build();

        await assertTxs(bb2, circuit);
    });

    it("Should check L2 'transfer to bjj' tx", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 1000);
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

        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        const tx = {
            fromIdx: 256,
            toIdx: Constants.nullIdx,
            toEthAddr: Constants.nullEthAddr,
            toBjjAy: account2.ay,
            toBjjSign: account2.sign,
            tokenID: 1,
            amount: Scalar.e(50),
            nonce: 0,
            userFee: 126,
        };

        account1.signTx(tx);
        bb2.addTx(tx);

        await bb2.build();

        await assertTxs(bb2, circuit);
    });

    it("Should check L1 'createAccountDeposit' tx with invalid Bjj", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        bb.addTx({
            fromIdx: 0,
            loadAmountF: 1000,
            tokenID: 1,
            fromBjjCompressed: "0x123456",
            fromEthAddr: "0x123456789",
            toIdx: 0,
            onChain: true
        });
        await bb.build();

        await assertTxs(bb, circuit);
    });

    it("Should check nullifiers L1 'createAccountDepositTransfer' tx", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 1000);
        await bb.build();
        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        const tx = {
            fromIdx: 0,
            loadAmountF: 500,
            tokenID: 2,
            fromBjjCompressed: account2.bjjCompressed,
            fromEthAddr: account2.ethAddr,
            toIdx: 256,
            amount: 100,
            userFee: 0,
            onChain: true
        };
        bb2.addTx(tx);
        await bb2.build();

        await assertTxs(bb2, circuit);
    });

    it("Should check nullifiers L1 'deposit' tx", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 1000);
        await bb.build();
        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        const tx = {
            fromIdx: 256,
            loadAmountF: 500,
            tokenID: 2,
            fromBjjCompressed: 0,
            fromEthAddr: 0,
            toIdx: 0,
            amount: 0,
            userFee: 0,
            onChain: true
        };
        bb2.addTx(tx);
        await bb2.build();

        await assertTxs(bb2, circuit);
    });

    it("Should check nullifiers L1 'depositTransfer' tx part 1", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 1000);
        depositTx(bb, account2, 1, 2000);
        await bb.build();
        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        // nullify transfer amount since fromEthAddr does not match ethAddr1
        const tx = {
            fromIdx: 256,
            loadAmountF: 500,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account2.ethAddr,
            toIdx: 257,
            amount: 100,
            userFee: 126,
            onChain: true
        };

        // nullify loadAmount and transfer amount since tokenID
        // does not match tokenID1 neither tokenID2
        const tx2 = {
            fromIdx: 256,
            loadAmountF: 500,
            tokenID: 2,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: 257,
            amount: 100,
            userFee: 126,
            onChain: true
        };

        bb2.addTx(tx);
        bb2.addTx(tx2);
        await bb2.build();

        await assertTxs(bb2, circuit);
    });

    it("Should check nullifiers L1 'depositTransfer' tx part 2", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 1000);
        depositTx(bb, account2, 1, 2000);
        await bb.build();
        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        depositTx(bb2, account3, 2, 3000);

        // nullify transfer amount since tokenID does not match tokenID2
        const tx = {
            fromIdx: 256,
            loadAmountF: 500,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account2.ethAddr,
            toIdx: 258,
            amount: 100,
            userFee: 126,
            onChain: true
        };

        bb2.addTx(tx);
        await bb2.build();

        await assertTxs(bb2, circuit);
    });

    it("Should check nullifiers L1 'depositTransfer' tx part 3", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 1000);
        depositTx(bb, account2, 2, 2000);
        await bb.build();
        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        // nullify loadAmount and transfer amount since tokenID does not match tokenID1
        const tx = {
            fromIdx: 256,
            loadAmountF: 500,
            tokenID: 2,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: 257,
            amount: 100,
            userFee: 126,
            onChain: true
        };

        bb2.addTx(tx);
        await bb2.build();

        await assertTxs(bb2, circuit);
    });

    it("Should check nullifiers L1 'forceTransfer' tx", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 1000);
        depositTx(bb, account2, 1, 2000);
        await bb.build();
        await rollupDB.consolidate(bb);

        // nullify transfer amount since fromEthAddr does not match ethAddr1
        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        const tx = {
            fromIdx: 256,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account2.ethAddr,
            toIdx: 257,
            amount: 100,
            userFee: 0,
            onChain: true
        };
        bb2.addTx(tx);
        await bb2.build();

        // nullify transfer amount since tokenID does not match tokenID1
        const bb3 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb3, account3, 2, 3000);

        const tx2 = {
            fromIdx: 258,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account3.ethAddr,
            toIdx: 257,
            amount: 100,
            userFee: 0,
            onChain: true
        };
        bb3.addTx(tx2);
        await bb3.build();

        // nullify transfer amount since tokenID does not match tokenID2
        const bb4 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb4, account3, 2, 3000);

        const tx3 = {
            fromIdx: 256,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: 258,
            amount: 100,
            userFee: 0,
            onChain: true
        };
        bb4.addTx(tx3);
        await bb4.build();

        // Check bb
        await assertTxs(bb2, circuit);
        await assertTxs(bb3, circuit);
        await assertTxs(bb4, circuit);
    });

    it("Should check underflow L1 'forceTransfer' tx", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 1000);
        depositTx(bb, account2, 1, 2000);
        await bb.build();
        await rollupDB.consolidate(bb);

        // nullify transfer amount since there is underflow
        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        const tx = {
            fromIdx: 256,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: 257,
            amount: 1100,
            userFee: 0,
            onChain: true
        };
        bb2.addTx(tx);
        await bb2.build();

        await assertTxs(bb2, circuit);
    });

    it("Should check nullifiers L1 'forceExit' tx", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 1000);
        depositTx(bb, account2, 2, 1000);
        await bb.build();
        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        // insert on the exit tree with 0 amount
        // nullify exit amount since fromEthAddr does not match ethAddr1
        const tx = {
            fromIdx: 256,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account2.ethAddr,
            toIdx: Constants.exitIdx,
            amount: 100,
            userFee: 0,
            onChain: true
        };

        // perform exit
        const tx2 = {
            fromIdx: 256,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: Constants.exitIdx,
            amount: 100,
            userFee: 0,
            onChain: true
        };

        bb2.addTx(tx);
        bb2.addTx(tx2);
        await bb2.build();

        // insert on the exit tree with 0 amount
        // nullify exit amount since tokenID does not match tokenID1
        const bb3 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        const tx3 = {
            fromIdx: 256,
            loadAmountF: 0,
            tokenID: 2,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: Constants.exitIdx,
            amount: 100,
            userFee: 0,
            onChain: true
        };

        // perform exit
        const tx4 = {
            fromIdx: 256,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: Constants.exitIdx,
            amount: 100,
            userFee: 0,
            onChain: true
        };

        bb3.addTx(tx3);
        bb3.addTx(tx4);
        await bb3.build();

        // nullify exit amount since tokenID does not match tokenID1
        const bb4 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        // perform exit
        const tx5 = {
            fromIdx: 256,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: Constants.exitIdx,
            amount: 100,
            userFee: 0,
            onChain: true
        };

        // nullify exit amount since tokenID does not match tokenID1
        const tx6 = {
            fromIdx: 257,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: Constants.exitIdx,
            amount: 100,
            userFee: 0,
            onChain: true
        };

        bb4.addTx(tx5);
        bb4.addTx(tx6);
        await bb4.build();

        await assertTxs(bb2, circuit);
        await assertTxs(bb3, circuit);
        await assertTxs(bb4, circuit);
    });

    it("Should check L1 error 'forceExit' tx", async () => {
        const rollupDB = await newState();

        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);
        depositTx(bb, account1, 1, 1000);
        await bb.build();
        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx, nTokens);

        // perform exit
        const tx2 = {
            fromIdx: 256,
            loadAmountF: 0,
            tokenID: 1,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: Constants.exitIdx,
            amount: 100,
            userFee: 0,
            onChain: true
        };

        const tx = {
            fromIdx: 256,
            loadAmountF: 0,
            tokenID: 2,
            fromBjjCompressed: 0,
            fromEthAddr: account1.ethAddr,
            toIdx: Constants.exitIdx,
            amount: 100,
            userFee: 0,
            onChain: true
        };

        bb2.addTx(tx);
        bb2.addTx(tx2);
        await bb2.build();

        let res = getSingleTxInput(bb2, 1, bb2.txs[1], bb2.totalFeeTransactions);
        res.input.tokenID1 = 2;
        try {
            await circuit.calculateWitness(res.input, {logTrigger:false, logOutput: false, logSet: false});
            expect(true).to.be.equal(false);
        } catch (error){
            expect(error.message.includes("Constraint doesn't match 1 != 0")).to.be.equal(true);
        }
    });
});

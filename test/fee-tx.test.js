const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;
const Scalar = require("ffjavascript").Scalar;
const SMTMemDB = require("circomlib").SMTMemDB;

const RollupDB = require("@hermeznetwork/commonjs").RollupDB;
const Account = require("@hermeznetwork/commonjs").HermezAccount;
const { depositTx, random } = require("./helpers/helpers");

describe("Test fee-tx", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "fee-tx.test.circom");
    let circuit;

    let nLevels = 16;

    before( async() => {
        const circuitCode = `
            include "../src/fee-tx.circom";
            component main = FeeTx(${nLevels});
        `;

        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints: " + circuit.constraints.length + "\n");

        // const testerAux = require("circom").testerAux;
        // const pathTmp = "/tmp/circom_30214TGGN7Rai1jx8";
        // circuit = await testerAux(pathTmp, path.join(__dirname, "circuits", "fee-tx.test.circom"));
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    it("Should check empty fee-tx", async () => {
        const input = {
            oldStateRoot: 0,
            feePlanToken: 0,
            feeIdx: 0,
            accFee: 0,
            tokenID: 0,
            nonce: 0,
            sign: 0,
            balance: 0,
            ay: 0,
            ethAddr: 0,
            siblings: Array(nLevels+1).fill(0),
        };

        const w = await circuit.calculateWitness(input, { logTrigger:false, logOutput: false, logSet: false });
        await circuit.assertOut(w, { newStateRoot: 0 });
    });

    it("Should check non-change on root", async () => {
        const input = {
            oldStateRoot: Scalar.e(random(2**253)),
            feePlanToken: random(2**32),
            feeIdx: 0,
            accFee: random(2**128),
            tokenID: random(2**32),
            nonce: random(2**40),
            sign: random(1),
            balance: random(2**128),
            ay: random(2**253),
            ethAddr: random(2**160),
            siblings: Array(nLevels+1).fill(0),
        };

        for (let i = 0; i < input.siblings.length; i++){
            input.siblings[i] = random(2**253);
        }

        const w = await circuit.calculateWitness(input, { logTrigger:false, logOutput: false, logSet: false });
        await circuit.assertOut(w, { newStateRoot: input.oldStateRoot });
    });

    it("Should check fee-tx", async () => {
        // Start a new state
        const maxTx = 8;
        const maxL1Tx = 6;

        const db = new SMTMemDB();
        const rollupDB = await RollupDB(db);
        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx);

        const account1 = new Account(1);
        const account2 = new Account(2);

        const feeAccount1 = new Account(3);
        const feeAccount2 = new Account(4);

        depositTx(bb, account1, 1, 1000);
        depositTx(bb, account2, 1, 1000);
        depositTx(bb, account1, 2, 1000);
        depositTx(bb, account2, 2, 1000);
        depositTx(bb, feeAccount1, 1, 0);
        depositTx(bb, feeAccount2, 2, 0);

        await bb.build();
        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx);

        const tx = {
            fromIdx: 256,
            toIdx: 257,
            tokenID: 1,
            amount: 50,
            nonce: 0,
            userFee: 173,
        };

        account1.signTx(tx);
        bb2.addTx(tx);

        const tx2 = {
            fromIdx: 258,
            toIdx: 259,
            tokenID: 2,
            amount: 50,
            nonce: 0,
            userFee: 126,
        };

        account1.signTx(tx2);
        bb2.addTx(tx2);

        bb2.addToken(1);
        bb2.addFeeIdx(260);

        bb2.addToken(2);
        bb2.addFeeIdx(261);

        bb2.totalFeeTransactions = 2;
        await bb2.build();

        const genInput = bb2.getInput();

        // Check first root update
        let input = {
            oldStateRoot: bb2.stateRootBeforeFees,
            feePlanToken: genInput.feePlanTokens[0],
            feeIdx: genInput.feeIdxs[0],
            accFee: bb2.feeTotals[0],
            tokenID: genInput.tokenID3[0],
            nonce: genInput.nonce3[0],
            sign: genInput.sign3[0],
            balance: genInput.balance3[0],
            ay: genInput.ay3[0],
            ethAddr: genInput.ethAddr3[0],
            siblings: genInput.siblings3[0],
        };

        let w = await circuit.calculateWitness(input, { logTrigger:false, logOutput: false, logSet: false });
        await circuit.assertOut(w, { newStateRoot: bb2.input.imStateRootFee[0] });

        // Check second root update
        input = {
            oldStateRoot: bb2.input.imStateRootFee[0],
            feePlanToken: genInput.feePlanTokens[1],
            feeIdx: genInput.feeIdxs[1],
            accFee: bb2.feeTotals[1],
            tokenID: genInput.tokenID3[1],
            nonce: genInput.nonce3[1],
            sign: genInput.sign3[1],
            balance: genInput.balance3[1],
            ay: genInput.ay3[1],
            ethAddr: genInput.ethAddr3[1],
            siblings: genInput.siblings3[1],
        };

        w = await circuit.calculateWitness(input, { logTrigger:false, logOutput: false, logSet: false });
        await circuit.assertOut(w, { newStateRoot: bb2.getNewStateRoot() });
    });

    it("Should check error with different tokenID", async () => {
        const input = {
            oldStateRoot: Scalar.e(random(2**253)),
            feePlanToken: 1,
            feeIdx: 257,
            accFee: random(2**128),
            tokenID: 2,
            nonce: random(2**40),
            sign: random(1),
            balance: random(2**128),
            ay: random(2**253),
            ethAddr: random(2**160),
            siblings: Array(nLevels+1).fill(0),
        };

        try {
            await circuit.calculateWitness(input, { logTrigger:false, logOutput: false, logSet: false });
            expect(true).to.be.equal(false);
        } catch(error){
            expect(error.message.includes("Constraint doesn't match 1 != 0")).to.be.equal(true);
        }
    });
});
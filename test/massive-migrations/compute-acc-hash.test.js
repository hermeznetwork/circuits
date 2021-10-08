const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;
const SMTMemDB = require("circomlib").SMTMemDB;
const Scalar = require("ffjavascript").Scalar;

const RollupDB = require("@hermeznetwork/commonjs").RollupDB;
const Account = require("@hermeznetwork/commonjs").HermezAccount;
const txUtils = require("@hermeznetwork/commonjs").txUtils;
const helpers = require("../helpers/helpers");

describe("Test ComputeDecodeAccumulateHash", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "compute-acc-hash.test.circom");
    let circuit;

    const nLevels = 16;
    const maxTx = 4;
    const maxL1Tx = 2;

    before( async() => {
        const circuitCode = `
            include "../../src/massive-migrations/compute-acc-hash.circom";
            component main = ComputeDecodeAccumulateHash(${nLevels});
        `;
        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints: " + circuit.constraints.length + "\n");
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    it("Should decode L1L2Data and compute accumulate hash", async () => {
        // Start a new state
        const db = new SMTMemDB();
        const rollupDB = await RollupDB(db);
        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx);

        const account1 = new Account(1);
        const account2 = new Account(2);

        helpers.depositTx(bb, account1, 1, 1000);
        helpers.depositOnlyExitTx(bb, account2, 1, 2000);

        await bb.build();
        await rollupDB.consolidate(bb);

        const oldState = await rollupDB.getStateByIdx(257);

        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx);

        const tx = {
            fromIdx: 256,
            toIdx: 257,
            tokenID: 1,
            amount: Scalar.e(50),
            nonce: 0,
            userFee: 126,
        };

        account1.signTx(tx);
        bb2.addTx(tx);

        await bb2.build();
        await rollupDB.consolidate(bb2);

        const newState = await rollupDB.getStateByIdx(257);

        const L2L1Data = await rollupDB.getL1L2Data(bb2.batchNumber);

        const input = {
            inAccHash: oldState.accumulatedHash,
            L1L2TxsData: Scalar.fromString(L2L1Data[0], 16),
            inCounter: 20,
        };

        const decodeDataL1L2 = txUtils.decodeL2Tx(L2L1Data[0], nLevels);

        const output = {
            userFee: decodeDataL1L2.userFee,
            amount: decodeDataL1L2.amount,
            toIdx: decodeDataL1L2.toIdx,
            fromIdx: decodeDataL1L2.fromIdx,
            outCounter: input.inCounter + 1,
            outAccHash: newState.accumulatedHash,
            isNop: 0,
        };

        const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, output);
    });

    it("Should compute NOP L1L2Data", async () => {
        // Start a new state
        const db = new SMTMemDB();
        const rollupDB = await RollupDB(db);
        const bb = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx);

        const account1 = new Account(1);
        const account2 = new Account(2);

        helpers.depositTx(bb, account1, 1, 1000);
        helpers.depositOnlyExitTx(bb, account2, 1, 2000);

        await bb.build();
        await rollupDB.consolidate(bb);

        const oldState = await rollupDB.getStateByIdx(257);

        const bb2 = await rollupDB.buildBatch(maxTx, nLevels, maxL1Tx);

        const tx = {
            fromIdx: 256,
            toIdx: 257,
            tokenID: 1,
            amount: Scalar.e(50),
            nonce: 0,
            userFee: 126,
        };

        account1.signTx(tx);
        bb2.addTx(tx);

        await bb2.build();
        await rollupDB.consolidate(bb2);

        const input = {
            inAccHash: oldState.accumulatedHash,
            L1L2TxsData: Scalar.e(0),
            inCounter: 20,
        };

        const output = {
            userFee: Scalar.e(0),
            amount: Scalar.e(0),
            toIdx: Scalar.e(0),
            fromIdx: Scalar.e(0),
            outCounter: input.inCounter,
            outAccHash: input.inAccHash,
            isNop: 1,
        };

        const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, output);
    });
});
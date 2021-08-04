const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;
const Scalar = require("ffjavascript").Scalar;

const SMTMemDB = require("circomlib").SMTMemDB;
const { RollupDB, HermezAccount, massiveMigrationsUtils } = require("@hermeznetwork/commonjs");
const { depositTx } = require("../helpers/helpers");

describe("Test SetIdx", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "set-idx.test.circom");
    let circuit;

    const NTX = 4;
    const NLEVELS = 16;

    const input = {};

    before( async() => {
        const circuitCode = `
            include "../../src/massive-migrations/set-idx.circom";
            component main = SetIdx(${NLEVELS});
        `;
        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints: " + circuit.constraints.length + "\n");
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    it("Should check succesfull set-idx", async () => {
        // Start a new rollup state
        const db = new SMTMemDB();
        const rollupDB = await RollupDB(db);
        const bb = await rollupDB.buildBatch(NTX, NLEVELS);

        const account1 = new HermezAccount(1);
        const account2 = new HermezAccount(2);
        const account3 = new HermezAccount(3);
        const account4 = new HermezAccount(4);

        // Add 4 deposits
        depositTx(bb, account1, 0, 1000);
        depositTx(bb, account2, 0, 2000);
        depositTx(bb, account3, 0, 3000);
        depositTx(bb, account4, 0, 4000);

        await bb.build();
        await rollupDB.consolidate(bb);

        const bb2 = await rollupDB.buildBatch(NTX, NLEVELS);

        // Add deposit --> set-idx
        const account5 = new HermezAccount(5);
        depositTx(bb2, account5, 0, 0);

        await bb2.build();
        const stateRootBb2 = bb2.getNewStateRoot();
        await rollupDB.consolidate(bb2);

        // fill private inputs
        input.stateRoot = stateRootBb2;
        const tmpState = await rollupDB.getStateByIdx(260);
        input.ethAddr = Scalar.fromString(tmpState.ethAddr, 16);
        input.tokenID = tmpState.tokenID;
        input.balance = tmpState.balance;
        input.nonce = tmpState.nonce;
        input.idx = tmpState.idx;
        input.exitBalance = tmpState.exitBalance;
        input.accumulatedHash = tmpState.accumulatedHash;
        input.sign = tmpState.sign;
        input.ay = Scalar.fromString(tmpState.ay, 16);

        const tmpStateInfo = await rollupDB.getStateTreeInfo(260, 2);

        let siblings = tmpStateInfo.siblings;
        while (siblings.length < (NLEVELS + 1)) siblings.push(Scalar.e(0));
        input.siblingsState = siblings;

        // compute output: global input hash
        const output = massiveMigrationsUtils.hashInputsSetIdx(input);

        const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, {hashGlobalInputs: output});
    });

    it("Should check error invalid input", async () => {
        // Wrong input when checking SMTVerifier
        const inputSMTKO = Object.assign({}, input);
        inputSMTKO.nonce = Scalar.e(2);

        try {
            await circuit.calculateWitness(inputSMTKO, {logTrigger:false, logOutput: false, logSet: false});
            expect(true).to.be.equal(false);
        } catch (error) {
            expect(error.message.includes("Constraint doesn't match 1 != 0")).to.be.equal(true);
        }
    });
});
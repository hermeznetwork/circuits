const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;
const Scalar = require("ffjavascript").Scalar;

const SMTMemDB = require("circomlib").SMTMemDB;
const { RollupDB, HermezAccount, Constants, withdrawUtils } = require("@hermeznetwork/commonjs");
const { depositTx } = require("./helpers/helpers");

describe("Test withdraw", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "withdraw.test.circom");
    let circuit;

    const NTX = 4;
    const NLEVELS = 32;

    const inputs = [];
    const outputs = [];

    before( async() => {
        const circuitCode = `
            include "../src/withdraw.circom";
            component main = Withdraw(${NLEVELS});
        `;

        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints: " + circuit.constraints.length + "\n");
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    it("Should check succesfull withdraw", async () => {
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

        // Add 4 exits
        const bb2 = await rollupDB.buildBatch(NTX, NLEVELS);

        const tx0 = {
            fromIdx: 256,
            toIdx: Constants.exitIdx,
            tokenID: 0,
            amount: Scalar.e(100),
            nonce: 0,
            userFee: 0,
        };
        account1.signTx(tx0);

        const tx1 = {
            fromIdx: 257,
            toIdx: Constants.exitIdx,
            tokenID: 0,
            amount: Scalar.e(200),
            nonce: 0,
            userFee: 0,
        };
        account2.signTx(tx1);

        const tx2 = {
            fromIdx: 258,
            toIdx: Constants.exitIdx,
            tokenID: 0,
            amount: Scalar.e(300),
            nonce: 0,
            userFee: 0,
        };
        account3.signTx(tx2);

        const tx3 = {
            fromIdx: 259,
            toIdx: Constants.exitIdx,
            tokenID: 0,
            amount: Scalar.e(400),
            nonce: 0,
            userFee: 0,
        };
        account4.signTx(tx3);

        bb2.addTx(tx0);
        bb2.addTx(tx1);
        bb2.addTx(tx2);
        bb2.addTx(tx3);

        await bb2.build();
        const rootExitBb2 = bb2.getNewExitRoot();
        await rollupDB.consolidate(bb2);

        const exitInfo1 = await rollupDB.getExitTreeInfo(256, 2);
        const exitInfo2 = await rollupDB.getExitTreeInfo(257, 2);
        const exitInfo3 = await rollupDB.getExitTreeInfo(258, 2);
        const exitInfo4 = await rollupDB.getExitTreeInfo(259, 2);

        const exitInfo = [];
        exitInfo.push(exitInfo1);
        exitInfo.push(exitInfo2);
        exitInfo.push(exitInfo3);
        exitInfo.push(exitInfo4);

        expect(exitInfo1.found).to.be.equal(true);
        expect(exitInfo2.found).to.be.equal(true);
        expect(exitInfo3.found).to.be.equal(true);
        expect(exitInfo4.found).to.be.equal(true);

        const numWithdraw = 4;

        for (let i = 0; i < numWithdraw; i++){
            const tmpInput = {};
            const tmpExitInfo = exitInfo[i];
            const tmpState = tmpExitInfo.state;

            // fill private inputs
            tmpInput.rootExit = rootExitBb2;
            tmpInput.ethAddr = Scalar.fromString(tmpState.ethAddr, 16);
            tmpInput.tokenID = tmpState.tokenID;
            tmpInput.balance = tmpState.balance;
            tmpInput.idx = tmpState.idx;
            tmpInput.sign = tmpState.sign;
            tmpInput.ay = Scalar.fromString(tmpState.ay, 16);

            let siblings = tmpExitInfo.siblings;
            while (siblings.length < (NLEVELS + 1)) siblings.push(Scalar.e(0));
            tmpInput.siblingsState = siblings;

            inputs.push(tmpInput);

            // compute output: global input hash
            outputs.push(withdrawUtils.hashInputsWithdraw(tmpInput));
        }

        for (let i = 0; i < inputs.length ; i++){
            const w = await circuit.calculateWitness(inputs[i], {logTrigger:false, logOutput: false, logSet: false});
            await circuit.assertOut(w, {hashGlobalInputs: outputs[i]});
        }
    });


    it("Should check error invalid input", async () => {
        // Wrong input when checking SMTVerifier
        const inputSMTKO = Object.assign({}, inputs[0]);
        inputSMTKO.balance = Scalar.e(2);

        try {
            await circuit.calculateWitness(inputSMTKO, {logTrigger:false, logOutput: false, logSet: false});
            expect(true).to.be.equal(false);
        } catch (error) {
            expect(error.message.includes("Constraint doesn't match 1 != 0")).to.be.equal(true);
        }
    });
});
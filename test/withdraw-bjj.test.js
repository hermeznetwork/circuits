const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;
const Scalar = require("ffjavascript").Scalar;

const SMTMemDB = require("circomlib").SMTMemDB;
const { RollupDB, HermezAccount, Constants, withdrawUtils } = require("@hermeznetwork/commonjs");
const { depositTx } = require("./helpers/helpers");

describe("Test withdraw-bjj", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "withdraw.test.circom");
    let circuit;

    const NTX = 4;
    const NLEVELS = 32;
    const inputWithdraw = {};

    before( async() => {
        const circuitCode = `
            include "../src/withdraw-bjj.circom";
            component main = WithdrawBjj(${NLEVELS});
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

        // Add 1 deposits
        depositTx(bb, account1, 0, 1000);

        await bb.build();
        await rollupDB.consolidate(bb);

        // Add 1 exits
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
        bb2.addTx(tx0);

        await bb2.build();
        const rootStateBb2 = bb2.getNewStateRoot();
        await rollupDB.consolidate(bb2);

        const numBatch = 2;
        const exitInfo = await rollupDB.getExitInfo(256, numBatch);

        expect(exitInfo.found).to.be.equal(true);


        const tmpExitInfo = exitInfo;
        const tmpState = tmpExitInfo.state;

        // fill private inputs
        inputWithdraw.rootState = rootStateBb2;
        inputWithdraw.ethAddrState = Scalar.fromString(tmpState.ethAddr, 16);
        inputWithdraw.tokenID = tmpState.tokenID;
        inputWithdraw.nonce = tmpState.nonce;
        inputWithdraw.balance = tmpState.balance;
        inputWithdraw.idx = tmpState.idx;
        inputWithdraw.exitBalance = tmpState.exitBalance;
        inputWithdraw.accumulatedHash = tmpState.accumulatedHash;
        inputWithdraw.sign = tmpState.sign;
        inputWithdraw.ay = Scalar.fromString(tmpState.ay, 16);

        // withdraw bjj inputs
        inputWithdraw.ethAddrCaller = Scalar.fromString(account1.ethAddr, 16);
        inputWithdraw.ethAddrCallerAuth = Scalar.fromString(account1.ethAddr, 16);
        inputWithdraw.ethAddrBeneficiary = Scalar.fromString(account1.ethAddr, 16);

        // bjj signature
        const signature = account1.signWithdrawBjj(
            inputWithdraw.ethAddrCallerAuth.toString(16),
            inputWithdraw.ethAddrBeneficiary.toString(16),
            inputWithdraw.rootState,
            inputWithdraw.idx
        );
        expect(withdrawUtils.verifyWithdrawBjjSig(
            inputWithdraw.ethAddrCallerAuth.toString(16),
            inputWithdraw.ethAddrBeneficiary.toString(16),
            inputWithdraw.rootState,
            inputWithdraw.idx,
            account1,
            signature
        )).to.be.equal(true);
        inputWithdraw.s = signature.S;
        inputWithdraw.r8x = signature.R8[0];
        inputWithdraw.r8y = signature.R8[1];

        let siblings = tmpExitInfo.siblings;
        while (siblings.length < (NLEVELS + 1)) siblings.push(Scalar.e(0));
        inputWithdraw.siblingsState = siblings;

        // compute output: global input hash
        const outputWithdraw = withdrawUtils.hashInputsWithdrawBjj(inputWithdraw);
        const w = await circuit.calculateWitness(inputWithdraw, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, {hashGlobalInputs: outputWithdraw});
    });

    it("Should check succesfull withdraw with 0xFFF... authorization", async () => {
        // Start a new rollup state
        const db = new SMTMemDB();
        const rollupDB = await RollupDB(db);
        const bb = await rollupDB.buildBatch(NTX, NLEVELS);

        const account1 = new HermezAccount(1);

        // Add 1 deposits
        depositTx(bb, account1, 0, 1000);

        await bb.build();
        await rollupDB.consolidate(bb);

        // Add 1 exits
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
        bb2.addTx(tx0);

        await bb2.build();
        const rootStateBb2 = bb2.getNewStateRoot();
        await rollupDB.consolidate(bb2);

        const numBatch = 2;
        const exitInfo = await rollupDB.getExitInfo(256, numBatch);

        expect(exitInfo.found).to.be.equal(true);


        const tmpExitInfo = exitInfo;
        const tmpState = tmpExitInfo.state;

        // fill private inputs
        inputWithdraw.rootState = rootStateBb2;
        inputWithdraw.ethAddrState = Scalar.fromString(tmpState.ethAddr, 16);
        inputWithdraw.tokenID = tmpState.tokenID;
        inputWithdraw.nonce = tmpState.nonce;
        inputWithdraw.balance = tmpState.balance;
        inputWithdraw.idx = tmpState.idx;
        inputWithdraw.exitBalance = tmpState.exitBalance;
        inputWithdraw.accumulatedHash = tmpState.accumulatedHash;
        inputWithdraw.sign = tmpState.sign;
        inputWithdraw.ay = Scalar.fromString(tmpState.ay, 16);

        // withdraw bjj inputs
        inputWithdraw.ethAddrCaller = Scalar.fromString("0x0000000000000000000000000000000000000000", 16);
        inputWithdraw.ethAddrCallerAuth = Scalar.fromString(Constants.nullEthAddr, 16);
        inputWithdraw.ethAddrBeneficiary = Scalar.fromString(account1.ethAddr, 16);

        // bjj signature
        const signature = account1.signWithdrawBjj(
            inputWithdraw.ethAddrCallerAuth.toString(16),
            inputWithdraw.ethAddrBeneficiary.toString(16),
            inputWithdraw.rootState,
            inputWithdraw.idx
        );

        expect(withdrawUtils.verifyWithdrawBjjSig(
            inputWithdraw.ethAddrCallerAuth.toString(16),
            inputWithdraw.ethAddrBeneficiary.toString(16),
            inputWithdraw.rootState,
            inputWithdraw.idx,
            account1,
            signature
        )).to.be.equal(true);
        inputWithdraw.s = signature.S;
        inputWithdraw.r8x = signature.R8[0];
        inputWithdraw.r8y = signature.R8[1];

        let siblings = tmpExitInfo.siblings;
        while (siblings.length < (NLEVELS + 1)) siblings.push(Scalar.e(0));
        inputWithdraw.siblingsState = siblings;

        // compute output: global input hash
        const outputWithdraw = withdrawUtils.hashInputsWithdrawBjj(inputWithdraw);
        const w = await circuit.calculateWitness(inputWithdraw, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, {hashGlobalInputs: outputWithdraw});
    });


    it("Should check error invalid input SMT", async () => {
        // Wrong input when checking SMTVerifier
        const inputSMTKO = Object.assign({}, inputWithdraw);
        inputSMTKO.ethAddrBeneficiary = Scalar.e(123123123);

        try {
            await circuit.calculateWitness(inputSMTKO, {logTrigger:false, logOutput: false, logSet: false});
            expect(true).to.be.equal(false);
        } catch (error) {
            expect(error.message.includes("Constraint doesn't match 1 != 0")).to.be.equal(true);
        }
    });

    it("Should check error invalid input eth addr", async () => {
        // Wrong input when checking SMTVerifier
        const inputEthAddrKO = Object.assign({}, inputWithdraw);
        inputEthAddrKO.balance = Scalar.e(4);

        try {
            await circuit.calculateWitness(inputEthAddrKO, {logTrigger:false, logOutput: false, logSet: false});
            expect(true).to.be.equal(false);
        } catch (error) {
            expect(error.message.includes("Constraint doesn't match 1 != 0")).to.be.equal(true);
        }
    });
});
const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;
const Scalar = require("ffjavascript").Scalar;

const SMTMemDB = require("circomlib").SMTMemDB;
const { RollupDB, HermezAccount, Constants, withdrawMultiUtils } = require("@hermeznetwork/commonjs");
const { depositTx } = require("./helpers/helpers");

describe("Test withdraw multi token", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "withdraw-multi-token.test.circom");
    let circuit;

    const NTX = 4;
    const NLEVELS = 32;
    const NTOKENS = 3;

    const inputs = [];
    const outputs = [];

    before( async() => {
        const circuitCode = `
            include "../src/withdraw-multi-token.circom";
            component main = WithdrawMultiToken(${NLEVELS},${NTOKENS});
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

        // Add 4 deposits
        depositTx(bb, account1, 0, 1000);
        depositTx(bb, account1, 1, 2000);
        depositTx(bb, account1, 2, 3000);
        depositTx(bb, account1, 3, 4000);

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
            tokenID: 1,
            amount: Scalar.e(200),
            nonce: 0,
            userFee: 0,
        };
        account1.signTx(tx1);

        const tx2 = {
            fromIdx: 258,
            toIdx: Constants.exitIdx,
            tokenID: 2,
            amount: Scalar.e(300),
            nonce: 0,
            userFee: 0,
        };
        account1.signTx(tx2);

        const tx3 = {
            fromIdx: 259,
            toIdx: Constants.exitIdx,
            tokenID: 3,
            amount: Scalar.e(400),
            nonce: 0,
            userFee: 0,
        };
        account1.signTx(tx3);

        bb2.addTx(tx0);
        bb2.addTx(tx1);
        bb2.addTx(tx2);
        bb2.addTx(tx3);

        await bb2.build();
        const rootStateBb2 = bb2.getNewStateRoot();
        await rollupDB.consolidate(bb2);

        const exitInfo1 = await rollupDB.getExitInfo(256, 2);
        const exitInfo2 = await rollupDB.getExitInfo(257, 2);
        const exitInfo3 = await rollupDB.getExitInfo(258, 2);
        const exitInfo4 = await rollupDB.getExitInfo(259, 2);

        const exitInfo = [];
        exitInfo.push(exitInfo1);
        exitInfo.push(exitInfo2);
        exitInfo.push(exitInfo3);
        exitInfo.push(exitInfo4);

        expect(exitInfo1.found).to.be.equal(true);
        expect(exitInfo2.found).to.be.equal(true);
        expect(exitInfo3.found).to.be.equal(true);
        expect(exitInfo4.found).to.be.equal(true);

        const numWithdraw = NTOKENS;
        const tokensIDs = [];
        const nonces = [];
        const balances = [];
        const idxs = [];
        const ays = [];
        const signs = [];
        const exitBalances = [];
        const accumulatedHashes = [];
        const siblingsStates = [];

        for (let i = 0; i < numWithdraw; i++){
            const tmpExitInfo = exitInfo[i];
            const tmpState = tmpExitInfo.state;

            tokensIDs.push(tmpState.tokenID);
            nonces.push(tmpState.nonce);
            balances.push(tmpState.balance);
            idxs.push(tmpState.idx);
            ays.push(Scalar.fromString(tmpState.ay, 16));
            signs.push(tmpState.sign);
            exitBalances.push(tmpState.exitBalance);
            accumulatedHashes.push(tmpState.accumulatedHash);

            let siblings = tmpExitInfo.siblings;
            while (siblings.length < (NLEVELS + 1)) siblings.push(Scalar.e(0));
            siblingsStates.push(siblings);
        }

        const tmpInput = {};
        // fill private inputs
        tmpInput.rootState = rootStateBb2;
        tmpInput.ethAddr = Scalar.fromString(account1.ethAddr, 16);
        tmpInput.tokenIDs = tokensIDs;
        tmpInput.nonces = nonces;
        tmpInput.balances = balances;
        tmpInput.idxs = idxs;
        tmpInput.exitBalances = exitBalances;
        tmpInput.accumulatedHashes = accumulatedHashes;
        tmpInput.signs = signs;
        tmpInput.ays = ays;
        tmpInput.siblingsStates = siblingsStates;

        inputs.push(tmpInput);
        // compute output: global input hash
        outputs.push(withdrawMultiUtils.hashInputsWithdrawMultiTokens(tmpInput, numWithdraw));
        for (let i = 0; i < inputs.length ; i++){
            const w = await circuit.calculateWitness(inputs[i], {logTrigger:false, logOutput: false, logSet: false});
            await circuit.assertOut(w, {hashGlobalInputs: outputs[i]});
        }
    });


    it("Should check error invalid input", async () => {
        // Wrong input when checking SMTVerifier
        const inputSMTKO = Object.assign({}, inputs[0]);
        inputSMTKO.balances[0] = Scalar.e(2);
        try {
            await circuit.calculateWitness(inputSMTKO, {logTrigger:false, logOutput: false, logSet: false});
            expect(true).to.be.equal(false);
        } catch (error) {
            expect(error.message.includes("Constraint doesn't match 1 != 0")).to.be.equal(true);
        }
    });
});
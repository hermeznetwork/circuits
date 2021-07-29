const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;
const Scalar = require("ffjavascript").Scalar;

const Constants = require("@hermeznetwork/commonjs").Constants;

describe("Test rollup-tx-states", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "rollup-tx-states.test.circom");
    let circuit;

    before( async() => {
        const circuitCode = `
            include "../src/rollup-tx-states.circom";
            component main = RollupTxStates();
        `;

        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints: " + circuit.constraints.length + "\n");
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    // Reminder SMT processor states:
    //     Function     |   Action
    // fnc[0]  fnc[1]   |
    // ------------------------------
    // 0       0        |    NOP
    // 0       1        |   UPDATE
    // 1       0        |   INSERT
    // 1       1        |   DELETE

    it("Should check states for L1 'createAccountDeposit' tx", async () => {
        // Should take auxFromIdx as key1
        // Should INSERT on first processor
        // Should NOP on second processor

        const input = {
            fromIdx: 0,
            toIdx: 0,
            toEthAddr: 0,
            auxFromIdx: 256,
            auxToIdx: 0,
            amount: 0,
            loadAmount: 30,
            newAccount: 1,
            onChain: 1,
            // check onChain params
            fromEthAddr: 2,
            ethAddr1: 3,
            tokenID: 4,
            tokenID1: 5,
            tokenID2: 6,
            sign2: 0,
            ay2: 0,
        };

        const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        const output = {
            isP1Insert: 1,
            key1: input.auxFromIdx,
            P1_fnc0: 1,
            P1_fnc1: 0,
            key2: 0,
            P2_fnc0: 0,
            P2_fnc1: 0,
            isExit: 0,
            isOnlyExit: 0,
            verifySignEnabled: 0,
            nop: 0,
            checkToEthAddr: 0,
            checkToBjj: 0,
            nullifyLoadAmount: 0,
            nullifyAmount: 0,
        };
        await circuit.assertOut(w, output);
    });

    it("Should check states for L1 'createAccountDepositTransfer' tx", async () => {
        // Should take auxFromIdx as key1
        // Should INSERT on processor 1
        // Should take toIdx as key2
        // Should UPDATE on processor 2

        const input = {
            fromIdx: 0,
            toIdx: 257,
            toEthAddr: 0,
            auxFromIdx: 256,
            auxToIdx: 0,
            amount: 10,
            loadAmount: 30,
            newAccount: 1,
            onChain: 1,
            // check onChain params
            fromEthAddr: 2,
            ethAddr1: 2,
            tokenID: 3,
            tokenID1: 3,
            tokenID2: 3,
            sign2: 0,
            ay2: 0,
        };

        let w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        const output = {
            isP1Insert: 1,
            key1: input.auxFromIdx,
            P1_fnc0: 1,
            P1_fnc1: 0,
            key2: input.toIdx,
            P2_fnc0: 0,
            P2_fnc1: 1,
            isExit: 0,
            isOnlyExit: 0,
            verifySignEnabled: 0,
            nop: 0,
            checkToEthAddr: 0,
            checkToBjj: 0,
            nullifyLoadAmount: 0,
            nullifyAmount: 0,
        };
        await circuit.assertOut(w, output);

        // Should check nullify amount with different tokenID2
        input.tokenID2 = 4;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        output.nullifyAmount = 1;
        await circuit.assertOut(w, output);
    });

    it("Should check states for L1 'deposit' tx", async () => {
        // Should take fromIdx as key1
        // Should UPDATE on processor 1
        // Should NOP on processor2

        const input = {
            fromIdx: 256,
            toIdx: 0,
            toEthAddr: 0,
            auxFromIdx: 0,
            auxToIdx: 0,
            amount: 0,
            loadAmount: 30,
            newAccount: 0,
            onChain: 1,
            // check onChain params
            fromEthAddr: 2,
            ethAddr1: 3,
            tokenID: 4,
            tokenID1: 4,
            tokenID2: 6,
            sign2: 0,
            ay2: 0,
        };

        let w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        const output = {
            isP1Insert: 0,
            key1: input.fromIdx,
            P1_fnc0: 0,
            P1_fnc1: 1,
            key2: 0,
            P2_fnc0: 0,
            P2_fnc1: 0,
            isExit: 0,
            isOnlyExit: 0,
            verifySignEnabled: 0,
            nop: 0,
            checkToEthAddr: 0,
            checkToBjj: 0,
            nullifyLoadAmount: 0,
            nullifyAmount: 0,
        };
        await circuit.assertOut(w, output);

        // Should check nullify load amount with different tokenID user parameter
        input.tokenID = 2;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        output.nullifyLoadAmount = 1;
        await circuit.assertOut(w, output);

        // Should check nullify load amount with different tokenID1 coordinator parameter
        input.tokenID = 4;
        input.tokenID1 = 2;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, output);
    });

    it("Should check states for L1 'depositTransfer' tx", async () => {
        // Should take fromIdx as key1
        // Should UPDATE on processor 1
        // Should take toIdx as key2
        // Should UPDATE on processor 2

        const input = {
            fromIdx: 256,
            toIdx: 257,
            toEthAddr: 0,
            auxFromIdx: 0,
            auxToIdx: 0,
            amount: 30,
            loadAmount: 30,
            newAccount: 0,
            onChain: 1,
            // check onChain params
            fromEthAddr: 2,
            ethAddr1: 2,
            tokenID: 3,
            tokenID1: 3,
            tokenID2: 3,
            sign2: 0,
            ay2: 0,
        };

        let w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        const output = {
            isP1Insert: 0,
            key1: input.fromIdx,
            P1_fnc0: 0,
            P1_fnc1: 1,
            key2: input.toIdx,
            P2_fnc0: 0,
            P2_fnc1: 1,
            isExit: 0,
            isOnlyExit: 0,
            verifySignEnabled: 0,
            nop: 0,
            checkToEthAddr: 0,
            checkToBjj: 0,
            nullifyLoadAmount: 0,
            nullifyAmount: 0,
        };
        await circuit.assertOut(w, output);

        // Should check nullify load amount & nullify amount with different tokenID1 coordinator parameter
        input.tokenID1 = 4;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        output.nullifyLoadAmount = 1;
        output.nullifyAmount = 1;
        await circuit.assertOut(w, output);

        // Should check nullify load amount & nullify amount with different tokenID user parameter
        input.tokenID1 = 3;
        input.tokenID = 4;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, output);

        // Should check nullify amount with different ethAddr1 coordinator parameter
        input.tokenID = 3;
        input.ethAddr1 = 4;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        output.nullifyLoadAmount = 0;
        output.nullifyAmount = 1;
        await circuit.assertOut(w, output);

        // Should check nullify amount with different fromEthAddr user parameter
        input.ethAddr1 = 2;
        input.fromEthAddr = 4;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, output);

        // Should check nullify amount with different tokenID2 coordinator parameter
        input.tokenID2 = 4;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        output.nullifyLoadAmount = 0;
        output.nullifyAmount = 1;
        await circuit.assertOut(w, output);

        // Should check nullify amount with different tokenID user parameter
        input.tokenID2 = 3;
        input.tokenID = 4;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        output.nullifyLoadAmount = 1; // mismatch with tokenID1
        await circuit.assertOut(w, output);
    });

    it("Should check states for L1 'forceTransfer' tx", async () => {
        // Should take fromIdx as key1
        // Should UPDATE on processor 1
        // Should take toIdx as key2
        // Should UPDATE on processor 2

        const input = {
            fromIdx: 256,
            toIdx: 257,
            toEthAddr: 0,
            auxFromIdx: 0,
            auxToIdx: 0,
            amount: 30,
            loadAmount: 0,
            newAccount: 0,
            onChain: 1,
            // check onChain params
            fromEthAddr: 2,
            ethAddr1: 2,
            tokenID: 3,
            tokenID1: 3,
            tokenID2: 3,
            sign2: 0,
            ay2: 0,
        };

        let w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        const output = {
            isP1Insert: 0,
            key1: input.fromIdx,
            P1_fnc0: 0,
            P1_fnc1: 1,
            key2: input.toIdx,
            P2_fnc0: 0,
            P2_fnc1: 1,
            isExit: 0,
            isOnlyExit: 0,
            verifySignEnabled: 0,
            nop: 0,
            checkToEthAddr: 0,
            checkToBjj: 0,
            nullifyLoadAmount: 0,
            nullifyAmount: 0,
        };
        await circuit.assertOut(w, output);

        // Should check nullify amount with different ethAddr coordinator parameter
        input.ethAddr1 = 4;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        output.nullifyLoadAmount = 0;
        output.nullifyAmount = 1;
        await circuit.assertOut(w, output);

        // Should check nullify amount with different fromEthAddr user parameter
        input.ethAddr1 = 2;
        input.fromEthAddr = 4;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, output);

        // Should check nullify amount with different tokenID1 coordinator parameter
        input.fromEthAddr = 2;
        input.tokenID1 = 4;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        output.nullifyLoadAmount = 0;
        output.nullifyAmount = 1;
        await circuit.assertOut(w, output);

        // Should check nullify amount with different tokenID user parameter
        input.tokenID1 = 3;
        input.tokenID = 4;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, output);

        // Should check nullify amount with different tokenID2 coordinator parameter
        input.tokenID = 3;
        input.tokenID2 = 2;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        output.nullifyLoadAmount = 0;
        output.nullifyAmount = 1;
        await circuit.assertOut(w, output);

        // Should check nullify amount with different tokenID user parameter
        input.tokenID2 = 3;
        input.tokenID = 2;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, output);
    });

    it("Should check states for L1 'forceExit' tx", async () => {
        // Should take fromIdx as key1
        // Should UPDATE on processor 1
        // Should take fromIdx as key2
        // Should UPDATE on processor 2

        const input = {
            fromIdx: 256,
            toIdx: Constants.exitIdx,
            toEthAddr: 0,
            auxFromIdx: 0,
            auxToIdx: 0,
            amount: 30,
            loadAmount: 0,
            newAccount: 0,
            onChain: 1,
            // check onChain params
            fromEthAddr: 2,
            ethAddr1: 2,
            tokenID: 3,
            tokenID1: 3,
            tokenID2: 3,
            sign2: 0,
            ay2: 0,
        };

        let w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        let output = {
            isP1Insert: 0,
            key1: input.fromIdx,
            P1_fnc0: 0,
            P1_fnc1: 1,
            key2: input.fromIdx,
            P2_fnc0: 0,
            P2_fnc1: 1,
            isExit: 1,
            isOnlyExit: 0,
            verifySignEnabled: 0,
            nop: 0,
            checkToEthAddr: 0,
            checkToBjj: 0,
            nullifyLoadAmount: 0,
            nullifyAmount: 0,
        };
        await circuit.assertOut(w, output);

        // Should check nullify amount with different ethAddr coordinator parameter
        input.ethAddr1 = 4;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        output.nullifyAmount = 1;
        await circuit.assertOut(w, output);

        // Should check nullify amount with different fromEthAddr user parameter
        input.ethAddr1 = 2;
        input.fromEthAddr = 4;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, output);

        // Should check nullify amount with different tokenID1 coordinator parameter
        input.fromEthAddr = 2;
        input.tokenID1 = 4;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        output.nullifyLoadAmount = 0;
        output.nullifyAmount = 1;
        await circuit.assertOut(w, output);

        // Should check nullify amount with different tokenID user parameter
        input.tokenID1 = 3;
        input.tokenID = 4;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, output);

        // Should check not nullify amount with different tokenID2 coordinator parameter
        input.tokenID = 3;
        input.tokenID2 = 4;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, output);

        // Should check not nullify amount with different tokenID user parameter
        input.tokenID2 = 3;
        input.tokenID = 4;
        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, output);
    });

    it("Should check states for L2 'transfer' tx", async () => {
        // Should take fromIdx as key1
        // Should UPDATE on processor 1
        // Should take toIdx as key2
        // Should UPDATE on processor 2

        const input = {
            fromIdx: 256,
            toIdx: 257,
            toEthAddr: 0,
            auxFromIdx: 0,
            auxToIdx: 0,
            amount: 30,
            loadAmount: 0,
            newAccount: 0,
            onChain: 0,
            // check onChain params
            fromEthAddr: 2,
            ethAddr1: 2,
            tokenID: 3,
            tokenID1: 3,
            tokenID2: 3,
            sign2: 0,
            ay2: 0,
        };

        const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        const output = {
            isP1Insert: 0,
            key1: input.fromIdx,
            P1_fnc0: 0,
            P1_fnc1: 1,
            key2: input.toIdx,
            P2_fnc0: 0,
            P2_fnc1: 1,
            isExit: 0,
            isOnlyExit: 0,
            verifySignEnabled: 1,
            nop: 0,
            checkToEthAddr: 0,
            checkToBjj: 0,
            nullifyLoadAmount: 0,
            nullifyAmount: 0,
        };
        await circuit.assertOut(w, output);
    });

    it("Should check states for L2 'exit' tx", async () => {
        // Should take fromIdx as key1
        // Should UPDATE on processor 1
        // Should take fromIdx as key2
        // Should UPDATE on processor 2

        const input = {
            fromIdx: 256,
            toIdx: Constants.exitIdx,
            toEthAddr: 0,
            auxFromIdx: 0,
            auxToIdx: 0,
            amount: 30,
            loadAmount: 0,
            newAccount: 0,
            onChain: 0,
            // check onChain params
            fromEthAddr: 2,
            ethAddr1: 2,
            tokenID: 3,
            tokenID1: 3,
            tokenID2: 3,
            sign2: 0,
            ay2: 0,
        };

        let w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        let output = {
            isP1Insert: 0,
            key1: input.fromIdx,
            P1_fnc0: 0,
            P1_fnc1: 1,
            key2: input.fromIdx,
            P2_fnc0: 0,
            P2_fnc1: 1,
            isExit: 1,
            isOnlyExit: 0,
            verifySignEnabled: 1,
            nop: 0,
            checkToEthAddr: 0,
            checkToBjj: 0,
            nullifyLoadAmount: 0,
            nullifyAmount: 0,
        };
        await circuit.assertOut(w, output);
    });

    it("Should check states for L2 'transferToEthAddr' tx", async () => {
        // Should take fromIdx as key1
        // Should UPDATE on processor 1
        // Should take auxToIdx as key2
        // Should UPDATE on processor 2

        const input = {
            fromIdx: 256,
            toIdx: Constants.nullIdx,
            toEthAddr: 0x1234,
            auxFromIdx: 0,
            auxToIdx: 257,
            amount: 30,
            loadAmount: 0,
            newAccount: 0,
            onChain: 0,
            // check onChain params
            fromEthAddr: 2,
            ethAddr1: 2,
            tokenID: 3,
            tokenID1: 3,
            tokenID2: 3,
            sign2: 0,
            ay2: 0,
        };

        const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        const output = {
            isP1Insert: 0,
            key1: input.fromIdx,
            P1_fnc0: 0,
            P1_fnc1: 1,
            key2: input.auxToIdx,
            P2_fnc0: 0,
            P2_fnc1: 1,
            isExit: 0,
            isOnlyExit: 0,
            verifySignEnabled: 1,
            nop: 0,
            checkToEthAddr: 1,
            checkToBjj: 0,
            nullifyLoadAmount: 0,
            nullifyAmount: 0,
        };
        await circuit.assertOut(w, output);
    });

    it("Should check states for L2 'transferToBjj' tx", async () => {
        // Should take fromIdx as key1
        // Should UPDATE on processor 1
        // Should take auxToIdx as key2
        // Should UPDATE on processor 2

        const input = {
            fromIdx: 256,
            toIdx: Constants.nullIdx,
            toEthAddr: Constants.nullEthAddr,
            auxFromIdx: 0,
            auxToIdx: 257,
            amount: 30,
            loadAmount: 0,
            newAccount: 0,
            onChain: 0,
            // check onChain params
            fromEthAddr: 2,
            ethAddr1: 2,
            tokenID: 3,
            tokenID1: 3,
            tokenID2: 3,
            sign2: 0,
            ay2: 0,
        };

        const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        const output = {
            isP1Insert: 0,
            key1: input.fromIdx,
            P1_fnc0: 0,
            P1_fnc1: 1,
            key2: input.auxToIdx,
            P2_fnc0: 0,
            P2_fnc1: 1,
            isExit: 0,
            isOnlyExit: 0,
            verifySignEnabled: 1,
            nop: 0,
            checkToEthAddr: 0,
            checkToBjj: 1,
            nullifyLoadAmount: 0,
            nullifyAmount: 0,
        };
        await circuit.assertOut(w, output);
    });

    it("Should check states for L2 'nop' tx", async () => {
        // Should take 0 as key1
        // Should take 0 as key2
        // Should NOP on processor 1
        // Should NOP on processor 2
        // Should set nop signal to 1

        const input = {
            fromIdx: 0,
            toIdx: 0,
            toEthAddr: 0,
            auxFromIdx: 0,
            auxToIdx: 0,
            amount: 0,
            loadAmount: 0,
            newAccount: 0,
            onChain: 0,
            // check onChain params
            fromEthAddr: 2,
            ethAddr1: 2,
            tokenID: 3,
            tokenID1: 3,
            tokenID2: 3,
            sign2: 0,
            ay2: 0,
        };

        const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        const output = {
            isP1Insert: 0,
            key1: 0,
            P1_fnc0: 0,
            P1_fnc1: 0,
            key2: 0,
            P2_fnc0: 0,
            P2_fnc1: 0,
            isExit: 0,
            isOnlyExit: 0,
            verifySignEnabled: 0,
            nop: 1,
            checkToEthAddr: 0,
            checkToBjj: 0,
            nullifyLoadAmount: 0,
            nullifyAmount: 0,
        };
        await circuit.assertOut(w, output);
    });

    it("Should check error for L2 tx", async () => {
        // Should take fromIdx as key1
        // Should UPDATE on processor 1
        // Should take toIdx as key2
        // Should UPDATE on processor 2

        const input = {
            fromIdx: 256,
            toIdx: 257,
            toEthAddr: 0,
            auxFromIdx: 0,
            auxToIdx: 0,
            amount: 30,
            loadAmount: 0,
            newAccount: 0,
            onChain: 0,
            // check onChain params
            fromEthAddr: 2,
            ethAddr1: 2,
            tokenID: 3,
            tokenID1: 3,
            tokenID2: 3,
            sign2: 0,
            ay2: 0,
        };

        // loadAmount must be 0 if L2 Tx
        input.loadAmount = 1;
        try {
            await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        } catch(error){
            expect(error.message.includes("Constraint doesn't match")).to.be.equal(true);
        }

        // newAccount must be 0 if L2 Tx
        input.loadAmount = 0;
        input.newAccount = 1;
        try {
            await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        } catch(error){
            expect(error.message.includes("Constraint doesn't match")).to.be.equal(true);
        }
    });

    it("Should check states for only-exit account", async () => {
        // Should take fromIdx as key1
        // Should UPDATE on processor 1
        // Should take toIdx as key2
        // Should UPDATE on processor 2

        const input = {
            fromIdx: 256,
            toIdx: 257,
            toEthAddr: 0,
            auxFromIdx: 0,
            auxToIdx: 0,
            amount: 30,
            loadAmount: 0,
            newAccount: 0,
            onChain: 0,
            // check onChain params
            fromEthAddr: 2,
            ethAddr1: 2,
            tokenID: 3,
            tokenID1: 3,
            tokenID2: 3,
            sign2: Constants.onlyExitBjjSign,
            ay2: Scalar.fromString(Constants.onlyExitBjjAy, 16),
        };

        let w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        const output = {
            isP1Insert: 0,
            key1: input.fromIdx,
            P1_fnc0: 0,
            P1_fnc1: 1,
            key2: input.toIdx,
            P2_fnc0: 0,
            P2_fnc1: 1,
            isExit: 0,
            isOnlyExit: 1,
            verifySignEnabled: 1,
            nop: 0,
            checkToEthAddr: 0,
            checkToBjj: 0,
            nullifyLoadAmount: 0,
            nullifyAmount: 0,
        };
        await circuit.assertOut(w, output);

        // modify sign2
        input.sign2 = 0;
        output.isOnlyExit = 0;

        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, output);

        // modify ay2 + 1
        input.sign2 = 1;
        input.ay2 = Scalar.add(input.ay2, 1);

        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, output);

        // modify ay2 - 1
        input.ay2 = Scalar.sub(input.ay2, 2);
        output.isOnlyExit = 0;

        w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, output);
    });
});
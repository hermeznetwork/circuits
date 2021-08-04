const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;
const feeUtils = require("@hermeznetwork/commonjs").feeTable;
const Scalar = require("ffjavascript").Scalar;

describe("Test MigrationTxStates", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "migrate-tx-states.test.circom");
    let circuit;

    before( async() => {
        const circuitCode = `
            include "../../src/massive-migrations/migrate-tx-states.circom";
            component main = MigrationTxStates();
        `;
        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints: " + circuit.constraints.length + "\n");
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    it("Should check UPDATE migrate tx", async () => {
        const input = {
            idx: 256,
            inIdx: 257,
            userFee: 126,
            migrateAmount: 100,
            isNop: 0
        };
        const fee = feeUtils.computeFee(input.migrateAmount, input.userFee);

        const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        const output = {
            fee2Charge: fee,
            depositAmount: Scalar.sub(input.migrateAmount, fee),
            isInsert: 0,
            outIdx: input.inIdx
        };

        await circuit.assertOut(w, output);
    });

    it("Should check INSERT migrate tx", async () => {
        const input = {
            idx: 0,
            inIdx: 257,
            userFee: 126,
            migrateAmount: 100,
            isNop: 0
        };
        const fee = feeUtils.computeFee(input.migrateAmount, input.userFee);

        const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        const output = {
            fee2Charge: fee,
            depositAmount: Scalar.sub(input.migrateAmount, fee),
            isInsert: 1,
            outIdx: input.inIdx + 1
        };

        await circuit.assertOut(w, output);
    });

    it("Should check UPDATE migrate tx underflow", async () => {
        const input = {
            idx: 258,
            inIdx: 258,
            userFee: 200,
            migrateAmount: 100,
            isNop: 0
        };

        const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        const output = {
            fee2Charge: input.migrateAmount,
            depositAmount: 0,
            isInsert: 0,
            outIdx: input.inIdx
        };

        await circuit.assertOut(w, output);
    });

    it("Should check INSERT migrate tx underflow", async () => {
        const input = {
            idx: 0,
            inIdx: 1024,
            userFee: 200,
            migrateAmount: 100,
            isNop: 0
        };

        const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        const output = {
            fee2Charge: input.migrateAmount,
            depositAmount: 0,
            isInsert: 1,
            outIdx: input.inIdx + 1
        };

        await circuit.assertOut(w, output);
    });

    it("Should check NOP migrate tx", async () => {
        const input = {
            idx: 0,
            inIdx: 1024,
            userFee: 200,
            migrateAmount: 100,
            isNop: 1
        };

        const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        const output = {
            fee2Charge: 0,
            depositAmount: 0,
            isInsert: 1,
            outIdx: input.inIdx
        };

        await circuit.assertOut(w, output);

        const input2 = {
            idx: 327,
            inIdx: 1024,
            userFee: 200,
            migrateAmount: 100,
            isNop: 1
        };

        const w2 = await circuit.calculateWitness(input2, {logTrigger:false, logOutput: false, logSet: false});
        const output2 = {
            fee2Charge: 0,
            depositAmount: 0,
            isInsert: 0,
            outIdx: input.inIdx
        };

        await circuit.assertOut(w2, output2);
    });
});
const { expect } = require("chai");
const path = require("path");
const fs = require("fs");
const tester = require("circom").tester;
const Scalar = require("ffjavascript").Scalar;

const { random } = require("./helpers/helpers");
const { computeFee, tableAdjustedFee } = require("@hermeznetwork/commonjs").feeTable;
const float40 = require("@hermeznetwork/commonjs").float40;

describe("Test compute-fee", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "compute-fee.test.circom");
    let circuit;

    before( async() => {
        const circuitCode = `
            include "../src/compute-fee.circom";
            component main = ComputeFee();
        `;

        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints: " + circuit.constraints.length + "\n");
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    it("Should test compute fee with applyFee = 0", async () => {
        // fee computation with noApplyFee
        const testVector = [];

        // populate testVector
        for (let i = 0; i < tableAdjustedFee.length; i++){
            const amount = random(10**18);
            testVector.push([i, amount]);
        }

        for (let i = 0; i < testVector.length; i++){
            const feeSelector = testVector[i][0];
            const amount = testVector[i][1];

            const input = {
                feeSel: feeSelector,
                amount,
                applyFee: 0,
            };

            const output = {
                feeOut: 0,
            };

            const w = await circuit.calculateWitness(input, {logOutput: false});
            await circuit.assertOut(w, output);
        }
    });

    it("Should test standard compute fee", async () => {
        // standard fee computation
        const testVector = [];

        // populate testVector
        const amount = Scalar.e(10**18);

        for (let i = 0; i < tableAdjustedFee.length; i++){
            const fee2apply = computeFee(amount, i);
            testVector.push([i, fee2apply]);
        }

        for (let i = 0; i < testVector.length; i++){
            const feeSelector = testVector[i][0];
            const expectedValue = testVector[i][1];

            const input = {
                feeSel: feeSelector,
                amount,
                applyFee: 1,
            };

            const output = {
                feeOut: expectedValue,
            };

            const w = await circuit.calculateWitness(input, {logOutput: false});
            await circuit.assertOut(w, output);
        }
    });

    it("Should test error compute fee overflow 128 bits", async () => {
        const amountMaxTransfer = float40.float2Fix(0xF8000002FF);
        // This selected fee is the minimal fee to get an applied fee over 128 bits
        const feeSelected = 208;

        for (let i = 0; i < feeSelected; i++){
            const input = {
                feeSel: i,
                amount: amountMaxTransfer,
                applyFee: 1,
            };

            const output = {
                feeOut: computeFee(amountMaxTransfer, i),
            };

            const w = await circuit.calculateWitness(input, {logOutput: false});
            await circuit.assertOut(w, output);
        }

        // manual fee computation
        const manualFeeApplied = Scalar.mul(amountMaxTransfer, tableAdjustedFee[feeSelected]);
        expect(Scalar.bitLength(manualFeeApplied)).to.be.greaterThan(128);

        const input = {
            feeSel: feeSelected,
            amount: amountMaxTransfer,
            applyFee: 1,
        };

        try {
            await circuit.calculateWitness(input, {logOutput: false});
            expect(true).to.be.equal(false);
        } catch (error) {
            expect(error.message.includes("Constraint doesn't match 1 != 0")).to.be.equal(true);
        }
    });
});

const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;
const Scalar = require("ffjavascript").Scalar;

const { computeFee, tableAdjustedFee } = require("@hermeznetwork/commonjs").feeTable;

describe("Test compute-tx-fee", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "check.test.circom");
    let circuit;

    before( async() => {
        const circuitCode = `
            include "../src/check.circom";
            component main = Check();
        `;

        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints: " + circuit.constraints.length + "\n");
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    it("Test", async () => {
        const input = {
            in1: Scalar.shl(1, 150), // 2**150
            in2: Scalar.shl(1, 150), // 2**150
        };

        const output = Scalar.mul(input.in1, input.in2);
        console.log(output);

        const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});

        const outBits = Scalar.bits(output);

        for (let i = 0; i < outBits.length; i++){
            const signalOutBit = await circuit.getSignal(w, `main.outBits[${i}]`);
            console.log(`${i}: ${signalOutBit} - ${outBits[i]}`);
        }
    });
});
const path = require("path");
const fs = require("fs");
const tester = require("circom").tester;
const Scalar = require("ffjavascript").Scalar;
const { tableAdjustedFee } = require("@hermeznetwork/commonjs").feeTable;

describe("Test fee-table-selector", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "fee-table-selector.test.circom");
    let circuit;

    before( async() => {
        const circuitCode = `
            include "../../src/lib/fee-table-selector.circom";
            component main = FeeTableSelector();
        `;

        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints: " + circuit.constraints.length + "\n");
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    it("Should test fee table", async () => {
        const input = {};
        const output = {};

        for (let i = 0; i < tableAdjustedFee.length; i ++){
            input.feeSel = i;

            output.feeOut = Scalar.e(tableAdjustedFee[i]);

            const w = await circuit.calculateWitness(input);
            await circuit.assertOut(w, output);
        }
    });
});

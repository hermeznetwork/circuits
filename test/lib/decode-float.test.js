const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;

describe("Test decode-float", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "decode-float.test.circom");
    let circuit;

    before( async() => {
        const circuitCode = `
            include "../../src/lib/decode-float.circom";
            component main = DecodeFloat();
        `;

        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints: " + circuit.constraints.length + "\n");
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    it("Should check test vectors", async () => {
        const testVector = [
            [0x307B, "123000000"],
            [0x1DC6, "454500"],
            [0xFFFF, "10235000000000000000000000000000000"],
            [0x0000, "0"],
            [0x0400, "0"],
            [0x0001, "1"],
            [0x0401, "1"],
            [0x0800, "0"],
            [0x0c00, "5"],
            [0x0801, "10"],
            [0x0c01, "15"],
        ];

        for (let i = 0; i < testVector.length; i++) {
            const w = await circuit.calculateWitness({in: testVector[i][0]}, {logOutput: false});

            await circuit.assertOut(w, {out: testVector[i][1]});
        }
    });
});

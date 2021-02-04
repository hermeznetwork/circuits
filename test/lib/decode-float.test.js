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
            [6 * 0x800000000 + 123, "123000000"],
            [2 * 0x800000000 + 4545, "454500"],
            [30 * 0x800000000 + 10235, "10235000000000000000000000000000000"],
            [0, "0"],
            [0x800000000, "0"],
            [0x0001, "1"],
            [31 * 0x800000000, "0"],
            [0x800000000 + 1, "10"],
            [0xFFFFFFFFFF, "343597383670000000000000000000000000000000"],
        ];

        for (let i = 0; i < testVector.length; i++) {
            const w = await circuit.calculateWitness({in: testVector[i][0]}, {logOutput: false});

            await circuit.assertOut(w, {out: testVector[i][1]});
        }
    });
});

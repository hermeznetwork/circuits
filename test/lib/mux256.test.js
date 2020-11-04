const path = require("path");
const fs = require("fs");
const tester = require("circom").tester;
const Scalar = require("ffjavascript").Scalar;

describe("Test mux256", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "mux256.test.circom");
    let circuit;

    before( async() => {
        const circuitCode = `
            include "../../src/lib/mux256.circom";
            component main = Mux256();
        `;

        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints: " + circuit.constraints.length + "\n");
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    it("Should test mux256", async () => {
        // input multiplexer
        const inputMux = [];
        for (let i = 0; i < 256; i++){
            inputMux.push(i);
        }

        // test all selectors
        for (let i = 0; i < 256; i ++){
            const selector = Scalar.e(i);
            const bitsSelector = Scalar.bits(selector);

            while(bitsSelector.length < 8){
                bitsSelector.push(0);
            }

            // set input
            const input = {
                s: bitsSelector,
                in: inputMux,
            };

            const output = {
                out: inputMux[i],
            };

            const w = await circuit.calculateWitness(input, {logOutput: false});
            await circuit.assertOut(w, output);
        }
    });
});

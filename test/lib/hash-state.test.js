const path = require("path");
const fs = require("fs");
const Scalar = require("ffjavascript").Scalar;

const tester = require("circom").tester;
const stateUtils = require("@hermeznetwork/commonjs").stateUtils;

describe("Test hash-state", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "state-hash.test.circom");
    let circuit;

    before( async() => {
        const circuitCode = `
            include "../../src/lib/hash-state.circom";
            component main = HashState();
        `;

        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints: " + circuit.constraints.length + "\n");
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    it("Should check hash with Js version", async () => {
        const state = {
            tokenID: 1,
            nonce: 49,
            balance: Scalar.e(12343256),
            sign: 1,
            ay: "144e7e10fd47e0c67a733643b760e80ed399f70e78ae97620dbb719579cd645d",
            ethAddr: "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf",
        };

        const hashJs = stateUtils.hashState(state);

        const input = {
            tokenID: Scalar.e(state.tokenID),
            nonce: Scalar.e(state.nonce),
            balance: Scalar.e(state.balance),
            sign: Scalar.e(state.tokenID),
            ay: Scalar.fromString(state.ay, 16),
            ethAddr: Scalar.fromString(state.ethAddr, 16),
        };

        const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});

        const output = {
            out: hashJs
        };

        await circuit.assertOut(w, output);
    });
});
const path = require("path");
const fs = require("fs");
const Scalar = require("ffjavascript").Scalar;

const tester = require("circom").tester;
const withdrawUtils = require("@hermeznetwork/commonjs").withdrawUtils;

describe("Test hash-state bjj", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "state-hash.test.circom");
    let circuit;
    const NLEVELS = 32;

    before( async() => {
        const circuitCode = `
            include "../../src/withdraw-bjj.circom";
            component main = HashInputsWithdrawal(${NLEVELS});
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
        const hashElements = {
            rootState: Scalar.e("13969287823376165653186379345270261451887728599848123787165210811264316379055"),
            ethAddrCaller: Scalar.fromString("0x7e5f4552091a69125d5dfcb7b8c2659029395bdf", 16),
            ethAddrBeneficiary: Scalar.fromString("0x7e5f4552091a69125d5dfcb7b8c2659029395bdf", 16),
            tokenID: Scalar.e("0"),
            exitBalance: Scalar.e("100"),
            idx: Scalar.e("256"),
        };

        const input = {
            rootState: hashElements.rootState,
            ethAddrCaller: hashElements.ethAddrCaller,
            ethAddrBeneficiary: hashElements.ethAddrBeneficiary,
            tokenID: hashElements.tokenID,
            exitBalance: hashElements.exitBalance,
            idx: hashElements.idx
        };

        const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});

        const hashJs = withdrawUtils.hashInputsWithdrawBjj(hashElements);
        const output = {
            hashInputsOut: hashJs
        };

        await circuit.assertOut(w, output);
    });
});
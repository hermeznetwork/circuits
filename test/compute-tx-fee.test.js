const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;
const Scalar = require("ffjavascript").Scalar;

const { computeFee, tableAdjustedFee } = require("@hermeznetwork/commonjs").feeTable;

describe("Test compute-tx-fee", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "compute-tx-fee.test.circom");
    let circuit;

    before( async() => {
        const circuitCode = `
            include "../src/compute-tx-fee.circom";
            component main = ComputeTxFee();
        `;

        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints: " + circuit.constraints.length + "\n");
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    it("Should check non applied fee", async () => {
        const testVector = [];

        testVector.push({
            input: {
                amount: Scalar.e("9823765"),
                feeSelector: 200,
                feeApplies: 0,
            },
            output: {
                fee2Charge: 0,
            }
        });

        // vary amount
        testVector.push({
            input: {
                amount: Scalar.e("20987"),
                feeSelector: 200,
                feeApplies: 0,
            },
            output: {
                fee2Charge: 0,
            }
        });

        // vary feeSelector
        testVector.push({
            input: {
                amount: Scalar.e("20987"),
                feeSelector: 32,
                feeApplies: 0,
            },
            output: {
                fee2Charge: 0,
            }
        });

        for (let i = 0; i < testVector.length; i++){
            const { input, output } = testVector[i];
            const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
            await circuit.assertOut(w, output);
        }
    });

    it("Should check applied fee", async () => {
        // build test vectors for edge top amount transfer
        const maxFeeSelectorToApply = [];

        for (let j = 192; j > 70; j--) {
            let flagNext = false;
            const testVector = [];
            const amountTest2 = Scalar.sub(Scalar.shl(1, j), 1);

            for (let i = 0; i < tableAdjustedFee.length; i++){
                const feeSelector = i;
                testVector.push({
                    input: {
                        amount: amountTest2,
                        feeSelector: feeSelector,
                        feeApplies: 1,
                    },
                    output: {
                        fee2Charge: computeFee(amountTest2, feeSelector),
                    }
                });
            }

            for (let i = 0; i < testVector.length; i++){
                const { input, output } = testVector[i];
                // console.log("selector: ", input.feeSelector);
                // console.log("feeFactor << 79: ", tableAdjustedFee[input.feeSelector]);
                const amountShifted = Scalar.mul(input.amount, tableAdjustedFee[input.feeSelector]);
                // console.log("amountShifted: ", amountShifted);
                // console.log("bits amount shifted: ", Scalar.bitLength(amountShifted));
                const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
                try {
                    await circuit.assertOut(w, output);
                } catch(error){
                    console.log(error.message);
                    flagNext = true;
                    console.log(`<-----${j}----->`);
                    console.log("feeMaxSelectorAllowed: ", i);
                    console.log();
                    maxFeeSelectorToApply.push({
                        bitsAmount: j,
                        feeMaxSelectorAllowed: i,
                    });
                    break;
                }
            }
            if (flagNext) continue;
        }
    });
});
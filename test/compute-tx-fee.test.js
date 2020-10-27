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

    // it("Should check non applied fee", async () => {
    //     const testVector = [];

    //     testVector.push({
    //         input: {
    //             amount: Scalar.e("9823765"),
    //             feeSelector: 200,
    //             feeApplies: 0,
    //         },
    //         output: {
    //             fee2Charge: 0,
    //         }
    //     });

    //     // vary amount
    //     testVector.push({
    //         input: {
    //             amount: Scalar.e("20987"),
    //             feeSelector: 200,
    //             feeApplies: 0,
    //         },
    //         output: {
    //             fee2Charge: 0,
    //         }
    //     });

    //     // vary feeSelector
    //     testVector.push({
    //         input: {
    //             amount: Scalar.e("20987"),
    //             feeSelector: 32,
    //             feeApplies: 0,
    //         },
    //         output: {
    //             fee2Charge: 0,
    //         }
    //     });

    //     for (let i = 0; i < testVector.length; i++){
    //         const { input, output } = testVector[i];
    //         const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
    //         await circuit.assertOut(w, output);
    //     }
    // });

    it("Should check applied fee", async () => {
        const testVector = [];

        // // build test vectors for standard amount transfer
        // const amountTest1 = Scalar.e("37422786796");

        // for (let i = 0; i < tableAdjustedFee.length; i++){
        //     const feeSelector = i;
        //     testVector.push({
        //         input: {
        //             amount: amountTest1,
        //             feeSelector: feeSelector,
        //             feeApplies: 1,
        //         },
        //         output: {
        //             fee2Charge: computeFee(amountTest1, feeSelector),
        //         }
        //     });
        // }

        // build test vectors for edge top amount transfer
        const amountTest2 = Scalar.sub(Scalar.shl(1, 72), 1);

        for (let i = 255; i < tableAdjustedFee.length; i++){
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
            console.log("selector: ", input.feeSelector);
            console.log("feeFactor << 79: ", tableAdjustedFee[input.feeSelector]);
            console.log("feeComputed << 79: ", Scalar.mul(input.amount, tableAdjustedFee[input.feeSelector]));
            const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
            await circuit.assertOut(w, output);
        }
    });
});

// let fee2Charge = Scalar.mul(amount, tableAdjustedFee[feeSelector]);
// fee2Charge = Scalar.shr(fee2Charge, 79);
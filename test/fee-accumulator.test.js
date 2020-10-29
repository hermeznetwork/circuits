const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;

describe("Test fee-accumulator", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "fee-accumulator.test.circom");
    let circuit;

    before( async() => {
        const circuitCode = `
            include "../src/fee-accumulator.circom";
            component main = FeeAccumulator(16);
        `;

        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints: " + circuit.constraints.length + "\n");
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    it("Should check fee accumulator", async () => {
        const testVectors = [
            // Normal situation
            {
                input: {
                    tokenID: 110,
                    fee2Charge: 1000,
                    feePlanTokenID: [101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116],
                    accFeeIn: [1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016]
                },
                out: {
                    accFeeOut: [1001,1002,1003,1004,1005,1006,1007,1008,1009,2010,1011,1012,1013,1014,1015,1016]
                }
            },
            // repeated situation
            {
                input: {
                    tokenID: 103,
                    fee2Charge: 1000,
                    feePlanTokenID: [101,102,103,103,105,106,107,108,109,110,111,112,113,114,115,103],
                    accFeeIn: [1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016]
                },
                out: {
                    accFeeOut: [1001,1002,2003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016]
                }
            },
            // Not in list situation
            {
                input: {
                    tokenID: 0,
                    fee2Charge: 1000,
                    feePlanTokenID: [101,102,103,103,105,106,107,108,109,110,111,112,113,114,115,103],
                    accFeeIn: [1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016]
                },
                out: {
                    accFeeOut: [1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016]
                }
            },
            // No fee to update
            {
                input: {
                    tokenID: 111,
                    fee2Charge: 0,
                    feePlanTokenID: [101,102,103,103,105,106,107,108,109,110,111,112,113,114,115,103],
                    accFeeIn: [1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016]
                },
                out: {
                    accFeeIn: [1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016]
                }
            },
            // Empty fee plan tokenID
            {
                input: {
                    tokenID: 0,
                    fee2Charge: 0,
                    feePlanTokenID: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                    accFeeIn: [1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016]
                },
                out: {
                    accFeeOut: [1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016]
                }
            },
            // Update tokenID 0 in a half empty fee plan tokenID
            {
                input: {
                    tokenID: 0,
                    fee2Charge: 3000,
                    feePlanTokenID: [5,4,3,2,1,0,6,7,8,0,0,0,0,0,0,0],
                    accFeeIn: [1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016]
                },
                out: {
                    accFeeOut: [1001,1002,1003,1004,1005,4006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016]
                }
            },
            // Update tokenID 0, being the only tokenID defined in the fee plan tokenID
            {
                input: {
                    tokenID: 0,
                    fee2Charge: 1000,
                    feePlanTokenID: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                    accFeeIn: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
                },
                out: {
                    accFeeOut: [1000,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
                }
            }
        ];

        for (let i = 0; i < 1; i++) {
            const w = await circuit.calculateWitness(testVectors[i].input, {logOutput: false});
            await circuit.assertOut(w, testVectors[i].out);
        }
    });
});

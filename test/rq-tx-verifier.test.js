const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;

function emptyInput(){
    return {
        futureTxCompressedDataV2: Array(3).fill(0),
        pastTxCompressedDataV2: Array(4).fill(0),
        futureToEthAddr: Array(3).fill(0),
        pastToEthAddr: Array(4).fill(0),
        futureToBjjAy: Array(3).fill(0),
        pastToBjjAy: Array(4).fill(0),
        rqTxCompressedDataV2: 0,
        rqToEthAddr: 0,
        rqToBjjAy: 0,
        rqTxOffset: 0
    };
}

describe("Test rq-tx-verifier", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "rq-tx-verifier.test.circom");
    let circuit;

    before( async() => {
        const circuitCode = `
            include "../src/rq-tx-verifier.circom";
            component main = RqTxVerifier();
        `;

        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints: " + circuit.constraints.length + "\n");
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    it("Should check empty rqTxData", async () => {
        const input = emptyInput();
        await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
    });

    it("Should check fail rqTxData", async () => {
        const input = emptyInput();

        // future data
        input.futureTxCompressedDataV2[0] = 1;

        // data requested
        input.rqTxCompressedDataV2 = 0;
        input.rqToEthAddr = 0;
        input.rqToBjjAy = 0;

        // request Tx 1 does not match
        input.rqTxOffset = 1;

        try {
            await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
            expect(true).to.be.equal(false);
        } catch(error){
            expect(error.message.includes("Constraint doesn't match 1 != 0")).to.be.equal(true);
        }
    });

    it("Should check all rqTxData", async () => {
        const input = emptyInput();

        const totalRqData = 8;

        for (let i = 1; i < totalRqData; i++){
            if (i < 4) {
                input.futureTxCompressedDataV2[i - 1] = i;
                input.futureToEthAddr[i - 1] = i;
                input.futureToBjjAy[i - 1] = i;
            } else {
                const pos = 3 - (i - 4);
                input.pastTxCompressedDataV2[pos] = i;
                input.pastToEthAddr[pos] = i;
                input.pastToBjjAy[pos] = i;
            }

            input.rqTxCompressedDataV2 = i;
            input.rqToEthAddr = i;
            input.rqToBjjAy = i;

            input.rqTxOffset = i;

            await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        }
    });
});
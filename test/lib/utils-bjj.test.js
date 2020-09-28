const path = require("path");
const fs = require("fs");
const babyJub = require("circomlib").babyJub;
const Scalar = require("ffjavascript").Scalar;
const utils = require("ffjavascript").utils;
const eddsa = require("circomlib").eddsa;
const crypto = require("crypto");

const tester = require("circom").tester;

describe("Test utils-bjj: BitsCompressed2AySign", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "bjj-utils-BitsCompressed2AySign.test.circom");
    let circuitPath2 = path.join(__dirname, "bjj-utils-AySign2Ax.test.circom");
    let circuit;
    let circuit2;

    function getSign(compressedBuff){
        let sign = 0;
        if (compressedBuff[31] & 0x80) {
            sign = 1;
        }
        return sign;
    }

    before( async() => {
        const circuitCode = `
            include "../../src/lib/utils-bjj.circom";
            component main = BitsCompressed2AySign();
        `;

        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints BitsCompressed2AySign: " + circuit.constraints.length + "\n");

        const circuitCode2 = `
            include "../../src/lib/utils-bjj.circom";
            component main = AySign2Ax();
        `;

        fs.writeFileSync(circuitPath2, circuitCode2, "utf8");

        circuit2 = await tester(circuitPath2, {reduceConstraints:false});
        await circuit2.loadConstraints();
        console.log("Constraints AySign2Ax: " + circuit2.constraints.length + "\n");
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
        fs.unlinkSync(circuitPath2);
    });

    it("Should check BitsCompressed2AySign", async () => {
        // Base point
        const point = babyJub.Base8;
        const compressedBuff = babyJub.packPoint(point);

        const bjjCompressedScalar = utils.leBuff2int(compressedBuff);

        const input = {
            bjjCompressed: Scalar.bits(bjjCompressedScalar),
        };

        while(input.bjjCompressed.length < 256) input.bjjCompressed.push(0);

        const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});

        const output = {
            ay: point[1],
            sign: getSign(compressedBuff),
        };

        await circuit.assertOut(w, output);

        // Random points
        const rounds = 25;

        for (let i = 0; i < rounds; i++){
            const privKey = crypto.randomBytes(32);
            const pointRand = eddsa.prv2pub(privKey);

            const compressedBuffRand = babyJub.packPoint(pointRand);

            const bjjCompressedScalarRand = utils.leBuff2int(compressedBuffRand);

            const input = {
                bjjCompressed: Scalar.bits(bjjCompressedScalarRand),
            };

            while(input.bjjCompressed.length < 256) input.bjjCompressed.push(0);

            const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});

            const output = {
                ay: pointRand[1],
                sign: getSign(compressedBuffRand),
            };
            await circuit.assertOut(w, output);
        }
    });

    it("Should check AySign2Ax", async () => {
        // Base point
        const point = babyJub.Base8;
        const compressedBuff = babyJub.packPoint(point);
        const sign = getSign(compressedBuff);

        const input = {
            ay: point[1],
            sign: sign
        };

        const w = await circuit2.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});

        const output = {
            ax: point[0],
        };

        await circuit2.assertOut(w, output);

        // Random points
        const rounds = 25;

        for (let i = 0; i < rounds; i++){
            const privKey = crypto.randomBytes(32);
            const pointRand = eddsa.prv2pub(privKey);

            const compressedBuffRand = babyJub.packPoint(pointRand);
            const signRand = getSign(compressedBuffRand);

            const input = {
                ay: pointRand[1],
                sign: signRand
            };

            const w = await circuit2.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});

            const output = {
                ax: pointRand[0],
            };

            await circuit2.assertOut(w, output);
        }
    });
});
const fs = require("fs");
const path = require("path");
const process = require("child_process");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const { stringifyBigInts } = require("ffjavascript").utils;
const { performance } = require("perf_hooks");
const Scalar = require("ffjavascript").Scalar;
const buildZqField = require("ffiasm").buildZqField;

const SMTMemDB = require("circomlib").SMTMemDB;
const RollupDb = require("@hermeznetwork/commonjs").RollupDB;

// Define name-files
const circuitName = "circuit";

async function createCircuit(nTx, nLevels, maxL1Tx, maxFeeTx){
    // create folder to store circuit files
    const pathName = path.join(__dirname, `../rollup-${nTx}-${nLevels}-${maxL1Tx}-${maxFeeTx}`);
    if (!fs.existsSync(pathName))
        fs.mkdirSync(pathName);

    const circuitCode = `include "../../src/rollup-main.circom";\n
    component main = RollupMain(${nTx}, ${nLevels}, ${maxL1Tx}, ${maxFeeTx});`;

    // store circuit
    const circuitCodeFile = path.join(pathName, `${circuitName}-${nTx}-${nLevels}-${maxL1Tx}-${maxFeeTx}.circom`);
    fs.writeFileSync(circuitCodeFile, circuitCode, "utf8");
}

async function compileCircuit(nTx, nLevels, maxL1Tx, maxFeeTx, flagParallelize) {
    const startTime = performance.now();

    const pathName = path.join(__dirname, `../rollup-${nTx}-${nLevels}-${maxL1Tx}-${maxFeeTx}`);
    const cirName = `${circuitName}-${nTx}-${nLevels}-${maxL1Tx}-${maxFeeTx}.circom`;

    let flagsCircom;

    if (flagParallelize){
        console.log("Parallelization: TRUE");
        flagsCircom = `-c -r -v -n ${"^RollupTx$|^DecodeTx$|^FeeTx$"}`;
    } else {
        console.log("Parallelization: FALSE");
        flagsCircom = "-c -r -v";
    }

    const cmd = `cd ${pathName} && \
    node \
    --trace-gc \
    --trace-gc-ignore-scavenger \
    --max-old-space-size=2048000 \
    --initial-old-space-size=2048000 \
    --no-global-gc-scheduling \
    --no-incremental-marking \
    --max-semi-space-size=1024 \
    --initial-heap-size=2048000 \
    ../../node_modules/circom/cli.js \
    ${cirName} \
    ${flagsCircom}`;

    console.log(cmd);
    const out = process.exec(cmd);
    out.stdout.on("data", (data) => {
        console.log(data);
    });

    const stopTime = performance.now();

    console.log(`Compile command took ${(stopTime - startTime)/1000} s`);
}

async function inputs(nTx, nLevels, maxL1Tx, maxFeeTx) {
    const startTime = performance.now();

    // create folder to store input file
    const pathName = path.join(__dirname, `../rollup-${nTx}-${nLevels}-${maxL1Tx}-${maxFeeTx}`);
    if (!fs.existsSync(pathName))
        fs.mkdirSync(pathName);

    const inputName = `input-${nTx}-${nLevels}-${maxL1Tx}-${maxFeeTx}`;
    const inputFile = path.join(pathName, `${inputName}.json`);

    // Start a new state
    const db = new SMTMemDB();
    const rollupDB = await RollupDb(db);
    const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);

    await bb.build();
    const input = bb.getInput();

    fs.writeFileSync(inputFile, JSON.stringify(stringifyBigInts(input), null, 1), "utf-8");

    const stopTime = performance.now();

    console.log(`Input command took ${(stopTime - startTime)/1000} s`);
}

async function compileWitness(nTx, nLevels, maxL1Tx, maxFeeTx, platform){
    const startTime = performance.now();

    // create folder to store input file
    const pathName = path.join(__dirname, `../rollup-${nTx}-${nLevels}-${maxL1Tx}-${maxFeeTx}`);
    const cppName = path.join(pathName, `${circuitName}-${nTx}-${nLevels}-${maxL1Tx}-${maxFeeTx}.cpp`);

    // compile witness cpp program
    const pathBase = path.dirname(cppName);
    const baseName = path.basename(cppName);

    const pThread = await compileFr(pathBase, platform);

    const cdir = path.join(path.dirname(require.resolve("circom_runtime")), "c");

    console.info("Compiling witness...");
    await exec("g++" + ` ${pThread}` +
            ` ${path.join(cdir,  "main.cpp")}` +
            ` ${path.join(cdir,  "calcwit.cpp")}` +
            ` ${path.join(cdir,  "utils.cpp")}` +
            ` ${path.join(pathBase,  "fr.cpp")}` +
            ` ${path.join(pathBase,  "fr.o")}` +
            ` ${path.join(pathBase, baseName)} ` +
            ` -o ${path.join(pathBase, path.parse(baseName).name)}` +
            ` -I ${pathBase} -I${cdir}` +
            " -lgmp -std=c++11 -O3"
    );
    console.info("Witness compilation done");

    const stopTime = performance.now();

    console.log(`Compile witness command took ${(stopTime - startTime)/1000} s`);
}

async function computeWitness(nTx, nLevels, maxL1Tx, maxFeeTx){
    const pathName = path.join(__dirname, `../rollup-${nTx}-${nLevels}-${maxL1Tx}-${maxFeeTx}`);

    // generate empty witness as an example
    const witnessName = path.join(pathName, `witness-${nTx}-${nLevels}-${maxL1Tx}-${maxFeeTx}.json`);
    const inputName = path.join(pathName, `input-${nTx}-${nLevels}-${maxL1Tx}-${maxFeeTx}.json`);

    const cmd2 = `cd ${pathName} && ./${circuitName}-${nTx}-${nLevels}-${maxL1Tx}-${maxFeeTx} ${inputName} ${witnessName}`;

    console.log("Calculating witness example...");
    console.time("witness time");
    await exec(cmd2);
    console.timeEnd("witness time");
    console.log("Witness example calculated");
}

async function computeZkey(nTx, nLevels, maxL1Tx, maxFeeTx, ptauFile){
    const pathName = path.join(__dirname, `../rollup-${nTx}-${nLevels}-${maxL1Tx}-${maxFeeTx}`);
    const r1csName = `${circuitName}-${nTx}-${nLevels}-${maxL1Tx}-${maxFeeTx}.r1cs`;
    const zkeyName = `${circuitName}-${nTx}-${nLevels}-${maxL1Tx}-${maxFeeTx}.zkey`;
    const ptauName = (ptauFile == undefined) ?
        "/home/tester/contracts-circuits/pot23_final.ptau" :
        ptauFile;

    if (!fs.existsSync(path.join(pathName, r1csName))) {
        console.error(`Constraint file ${path.join(pathName,r1csName)} doesnt exist`);
        return;
    }

    if (!fs.existsSync(ptauName)) {
        console.error(`Powers of Tau file ${ptauName} doesnt exist`);
        return;
    }

    console.log(`Powers of Tau file: ${ptauName}`);

    let zkeyCmd = `cd ${pathName} && \
    npx \
    --max-old-space-size=2048000 \
    --initial-old-space-size=2048000 \
    --no-global-gc-scheduling \
    --no-incremental-marking \
    --max-semi-space-size=1024 \
    --initial-heap-size=2048000 \
    ../../node_modules/snarkjs/cli.js zkey new \
    ${r1csName} \
    ${ptauName} \
    ${pathName,zkeyName}`;

    const out = process.exec(zkeyCmd);
    out.stdout.on("data", (data) => {
        console.log(data);
    });
}

async function generateSolidityVerifier(nTx, nLevels, maxL1Tx, maxFeeTx){
    const pathName = path.join(__dirname, `../rollup-${nTx}-${nLevels}-${maxL1Tx}-${maxFeeTx}`);
    const zkeyName = `${circuitName}-${nTx}-${nLevels}-${maxL1Tx}-${maxFeeTx}.zkey`;
    const solName = `${circuitName}-${nTx}-${nLevels}-${maxL1Tx}-${maxFeeTx}_verifier.sol`;

    if (!fs.existsSync(path.join(pathName, zkeyName))) {
        console.log(`ZKey file ${path.join(pathName,zkeyName)} doesnt exist`);
        return;
    }

    const cmd = `snarkjs zkey export solidityverifier \
       ${path.join(pathName, zkeyName)} \
       ${path.join(pathName, solName)}`;

    const out = process.exec(cmd);
    out.stdout.on("data", (data) => {
        console.log(data);
    });
}

async function compileFr(pathC, platform){

    const p = Scalar.fromString("21888242871839275222246405745257275088548364400416034343698204186575808495617");

    const source = await buildZqField(p, "Fr");

    fs.writeFileSync(path.join(pathC, "fr.asm"), source.asm, "utf8");
    fs.writeFileSync(path.join(pathC, "fr.hpp"), source.hpp, "utf8");
    fs.writeFileSync(path.join(pathC, "fr.cpp"), source.cpp, "utf8");

    let pThread = "";

    if (platform === "darwin") {
        await exec("nasm -fmacho64 --prefix _ " +
            ` ${path.join(pathC,  "fr.asm")}`
        );
    }  else if (platform === "linux") {
        pThread = "-pthread";
        await exec("nasm -felf64 " +
            ` ${path.join(pathC,  "fr.asm")}`
        );
    } else throw("Unsupported platform");

    return pThread;
}

module.exports = {
    createCircuit,
    compileCircuit,
    inputs,
    compileWitness,
    computeWitness,
    computeZkey,
    generateSolidityVerifier
};

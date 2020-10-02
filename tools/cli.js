const { createCircuit, compileCircuit, inputs,
    compileWitness, computeWitness, computeZkey,
     generateSolidityVerifier} = require("./helpers/actions");

// Input parameters
const command = process.argv[2];

const nTx = Number(process.argv[3]);
const nLevels = Number(process.argv[4]);
const maxL1Tx = Number(process.argv[5]);
const maxFeeTx = Number(process.argv[6]);
const flagParallelize = Number(process.argv[7]) ? true: false;

function checkParam(param, paramStr){
    if (!param){
        console.error(`option "${paramStr}" not set`);
        process.exit(1);
    }
}

checkParam(nTx, "number of tx");
checkParam(nLevels, "number of levels");
checkParam(maxL1Tx, "maximum L1 tx");
checkParam(maxFeeTx, "number of fee tx");

// compile circuit
if (command == "create"){
    createCircuit(nTx, nLevels, maxL1Tx, maxFeeTx);
} else if (command == "compile") {
    compileCircuit(nTx, nLevels, maxL1Tx, maxFeeTx, flagParallelize);
} else if (command == "input"){
    inputs(nTx, nLevels, maxL1Tx, maxFeeTx);
} else if (command == "compilewitness"){
    compileWitness(nTx, nLevels, maxL1Tx, maxFeeTx, process.platform);
} else if (command == "witness"){
    computeWitness(nTx, nLevels, maxL1Tx, maxFeeTx);
} else if (command == "zkey"){
    const ptauFile = process.argv[7]
    computeZkey(nTx, nLevels, maxL1Tx, maxFeeTx, ptauFile);
} else if (command == "solidity"){
    generateSolidityVerifier(nTx, nLevels, maxL1Tx, maxFeeTx);
} else {
    console.error(`command "${command}" not accepted`);
}

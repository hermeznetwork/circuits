const nTx = Number(process.argv[2]);
const nLevels = Number(process.argv[3]);
const maxL1Tx = Number(process.argv[4]);
const maxFeeTx = Number(process.argv[5]);

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

async function main(){
    const res =  await totalConstrainsts(nTx, nLevels, maxL1Tx, maxFeeTx);
    console.log("rollup-main circuit");
    console.log("<------------------->");
    console.log(`   nTx: ${nTx}`);
    console.log(`   nLevels: ${nLevels}`);
    console.log(`   maxL1Tx: ${maxL1Tx}`);
    console.log(`   maxFeeTx: ${maxFeeTx}`);
    console.log("<------------------->");
    console.log(`Constraints: ${res} \n`);
}

// Helper functions
function singleDecodeTx(nLevels){
    const numConstraints = 4*nLevels + 1473;
    return numConstraints;
}

function singleFeeTx(nLevels){
    const numConstraints = 483*nLevels + 2592;
    return numConstraints;
}

function singleRollupTx(nLevels, maxFeeTx){
    const numConstraints = 974*nLevels + 14552 + 5*maxFeeTx;
    return numConstraints;
}

function hashInputsTx(nLevels, nTx, maxL1Tx, maxFeeTx){
    var bitsIndex = nLevels;
    var bitsRoots = 256;
    var bitsChainID = 16;
    var bitsL1TxsData = maxL1Tx * (2*nLevels + 528);
    var bitsL2TxsData = nTx * (2*nLevels + 48);
    var bitsFeeTxsData = maxFeeTx * bitsIndex;

    const bitsSha256 = 2*bitsIndex + 3*bitsRoots + bitsChainID + bitsL1TxsData + bitsL2TxsData + bitsFeeTxsData;

    const constraintsSha256 = 28953 + 29305*Math.floor(((bitsSha256 + 64) / 512));

    return constraintsSha256 + 2*bitsL1TxsData + 2*bitsL2TxsData + (48 + 2*nLevels)*maxFeeTx;
}

function intermediarySignals(nTx, maxFeeTx){
    return 2*3*nTx + (2+maxFeeTx)*2*nTx + 2*(1 + 2*maxFeeTx);
}

async function totalConstrainsts(nTx, nLevels, maxL1Tx, maxFeeTx){
    let totalConstrainsts = 0;

    totalConstrainsts += singleDecodeTx(nLevels)*nTx;
    totalConstrainsts += singleFeeTx(nLevels)*maxFeeTx;
    totalConstrainsts += singleRollupTx(nLevels, maxFeeTx)*nTx;
    totalConstrainsts += hashInputsTx(nLevels, nTx, maxL1Tx, maxFeeTx);
    totalConstrainsts += intermediarySignals(nTx, maxFeeTx);

    return totalConstrainsts;
}

main();
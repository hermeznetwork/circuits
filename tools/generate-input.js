const fs = require("fs");
const Scalar = require("ffjavascript").Scalar;
const SMTMemDB = require("circomlib").SMTMemDB;
const { stringifyBigInts } = require("ffjavascript").utils;

const RollupDB = require("@hermeznetwork/commonjs").RollupDB;
const Account = require("@hermeznetwork/commonjs").HermezAccount;
const utils = require("./helpers/gen-inputs-utils");


// cmd input parameters
////////
const paramAccounts = process.argv[2];
if (paramAccounts === undefined){
    console.log("Number of accounts not valid");
    console.log("Usage:");
    console.log("node generate-input.js \"nAccounts\" \"nTransfers\"");
    process.exit(0);
}
const nAccounts = Number(paramAccounts);

const paramTranfers = process.argv[3];
if (paramTranfers === undefined){
    console.log("Number of transfers not valid");
    console.log("Usage:");
    console.log("node generate-input.js \"nAccounts\" \"nTransfers\"");
    process.exit(0);
}
const nTransfers = Number(paramTranfers);

// optional params
// argv[4] : nTx
// argv[5] : nLevels
// argv[6] : maxL1Tx
// argv[7] : maxFeeTx

const paramNTx      = Number(process.argv[4]);
const paramNLevels  = Number(process.argv[5]);
const paramMaxL1Tx  = Number(process.argv[6]);
const paramMaxFeeTx = Number(process.argv[7]);

// global vars
////////
const nTx      = paramNTx      == undefined ? 32 : paramNTx;
const nLevels  = paramNLevels  == undefined ? 8  : paramNLevels;
const maxL1Tx  = paramMaxL1Tx  == undefined ? 8  : paramMaxL1Tx;
const maxFeeTx = paramMaxFeeTx == undefined ? 64 : paramMaxFeeTx;

const minBalance = Scalar.e(0);
const maxBalance = Scalar.sub(Scalar.shl(1, 96), 1);
const numBatches = Math.ceil(nAccounts / maxL1Tx);
let rollupDB;
let accounts = [];

const maxTransfers = nTx - maxL1Tx;
if (nTransfers > maxTransfers){
    console.error(`Max transfers allowed are ${maxTransfers}`);
    process.exit(0);
}

async function populateDB(){
    const db = new SMTMemDB();
    rollupDB = await RollupDB(db);

    console.log("Total batches to add: ", numBatches);
    let totalAccounts = nAccounts;

    for (let i = 0; i < numBatches; i++){
        console.log("   Adding batch : ", i);
        const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        const account = new Account(i + 1);
        accounts.push(account);
        for (let j = 0; j < (totalAccounts > maxL1Tx ? maxL1Tx : totalAccounts); j++){
            utils.depositTx(bb, account, utils.randomInterval(minBalance, maxBalance));
        }
        await bb.build();
        await rollupDB.consolidate(bb);
        if (totalAccounts > maxL1Tx){
            totalAccounts -= maxL1Tx;
        }
    }
}

async function generateInput(){
    // Add full 256 on.chain transactions
    const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
    const account = new Account(numBatches);
    for (let i = 0; i < maxL1Tx; i++){
        utils.depositTx(bb, account, utils.randomInterval(minBalance, maxBalance));
    }

    // Add transfers
    console.log("Total tranfers to add: ", nTransfers);
    for (let i = 0; i < nTransfers; i++){
        const randAccountFrom = utils.randomInterval(0, accounts.length);
        const randAccountTo = utils.randomInterval(0, accounts.length);
        await utils.transferTx(bb, accounts[randAccountFrom], accounts[randAccountTo], rollupDB);
        console.log("   adding transfer: ", i);
    }

    // add fee transaction
    bb.addToken(1);
    bb.addFeeIdx(utils.randomInterval(256, 256+nAccounts));

    console.log("   computing inputs...");
    await bb.build();
    const input = bb.getInput();
    fs.writeFileSync(`${__dirname}/inputs-${nAccounts}.json`, JSON.stringify(stringifyBigInts(input), null, 1), "utf-8");
}

async function main(){
    console.log("Populating database...");
    await populateDB();
    console.log("Populating finished");

    console.log("Generating inputs...");
    await generateInput();
    console.log("Finish input generation");
}

main();

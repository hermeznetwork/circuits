const SMTMemDB = require("circomlib").SMTMemDB;
const Scalar = require("ffjavascript").Scalar;
const RollupDB = require("@hermeznetwork/commonjs").RollupDB;
const Constants = require("@hermeznetwork/commonjs").Constants;
const txUtils = require("@hermeznetwork/commonjs").txUtils;

const helpers = require("../../helpers/helpers");

async function setAccountIdx(account, idx){
    account.idx = idx;
}

async function initSourceRollupDb(maxTx, nLevels, maxL1Tx, accounts, numDeposits, migrationAccount){
    // RollupSourceDB
    const db = new SMTMemDB();
    const rollupSourceDB = await RollupDB(db);
    const bb = await rollupSourceDB.buildBatch(maxTx, nLevels, maxL1Tx);

    for (let i = 0; i < numDeposits; i++){
        helpers.depositTx(bb, accounts[i], 1, 1000);
        accounts[i].sourceIdx = (i == 0) ? Constants.firstIdx + 1: accounts[i-1].sourceIdx + 1;
    }

    // add migrationIdx
    helpers.depositOnlyExitTx(bb, accounts[migrationAccount], 1, 0);
    accounts[migrationAccount].migrationIdx = accounts[numDeposits - 1].sourceIdx + 1;

    await bb.build();
    await rollupSourceDB.consolidate(bb);

    return rollupSourceDB;
}

async function printStateAccounts(accounts, rollupDb){
    for (let i = 0; i < accounts.length; i++){
        if (accounts[i].sourceIdx != undefined){
            const state = await rollupDb.getStateByIdx(accounts[i].sourceIdx);
            console.log(`State ${accounts[i].sourceIdx}: `, state);
        }
    }
}

async function getSingleMigrationTxInput(mb, numTx){
    const nLevels = mb.nLevels;
    const finalInput = mb.getInput();
    const finalOutput = mb.getPretendedPublicInputs();

    const L1L2DataHex = txUtils.scalarToHexL2Data(finalInput.L1L2TxsData[numTx], nLevels);
    const L1L2TxData = txUtils.decodeL2Tx(L1L2DataHex, nLevels);

    const input = {
        // global
        oldStateRoot: finalInput.imStateRoot[numTx-1] || finalInput.oldStateRoot,
        accFeeIn: finalInput.imAccFeeOut[numTx-1] || Scalar.e(0),
        inIdx: finalInput.imOutIdx[numTx-1] || mb.initialIdx,
        isNop: Scalar.eq(L1L2TxData.toIdx, 0) ? Scalar.e(1): Scalar.e(0),
        // 0 means INSERT, any other value means UPDATE
        idx: finalInput.idxDestiny[numTx],
        // state vars
        migrateAmount: L1L2TxData.amount,
        userFee: L1L2TxData.userFee,
        ay: finalInput.ay1[numTx],
        sign: finalInput.sign1[numTx],
        ethAddr: finalInput.ethAddr1[numTx],
        tokenID: finalInput.tokenID1[numTx],
        // insert and deletes
        isOld0: finalInput.isOld0_2[numTx],
        oldKey: finalInput.oldKey2[numTx],
        oldValue: finalInput.oldValue2[numTx],
        // aux signals to compute hash states
        nonce: finalInput.nonce2[numTx],
        balance: finalInput.balance2[numTx],
        exitBalance: finalInput.exitBalance2[numTx],
        accumulatedHash: finalInput.accumulatedHash2[numTx],
        siblings: finalInput.siblings2[numTx],
    };

    const output = {
        newStateRoot: finalInput.imStateRoot[numTx] || finalOutput.newStateRoot,
        accFeeOut: finalInput.imAccFeeOut[numTx] || mb.accumulatedFee,
        outIdx: finalInput.imOutIdx[numTx] || finalOutput.newLastIdx,
    };

    return {input, output};
}

async function assertTxs(mb, circuit){
    for (let i = 0; i < mb.maxMigrationTx; i++){
        let res = await getSingleMigrationTxInput(mb, i);

        let w = await circuit.calculateWitness(res.input, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, res.output);
    }
}

async function assertMigrationBatch(mb, circuit){
    const input = mb.getInput();
    const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});

    const output = {
        hashGlobalInputs: mb.getHashInputs(),
    };

    await circuit.assertOut(w, output);
}

module.exports = {
    setAccountIdx,
    initSourceRollupDb,
    printStateAccounts,
    assertTxs,
    getSingleMigrationTxInput,
    assertMigrationBatch
};
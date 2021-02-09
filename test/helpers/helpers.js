const { expect } = require("chai");
const Scalar = require("ffjavascript").Scalar;

const { float40 } = require("@hermeznetwork/commonjs");
const feeUtils = require("@hermeznetwork/commonjs").feeTable;
const txUtils = require("@hermeznetwork/commonjs").txUtils;

async function depositTx(bb, account, tokenID, loadAmount) {
    bb.addTx({
        fromIdx: 0,
        loadAmountF: float40.fix2Float(loadAmount),
        tokenID: tokenID,
        fromBjjCompressed: account.bjjCompressed,
        fromEthAddr: account.ethAddr,
        toIdx: 0,
        onChain: true
    });
}

function random(ceil){
    return Math.floor((Math.random() * ceil));
}

function accumulateFees(input, nTokens){
    const res = Array(nTokens).fill(0);

    // compute fee2Charge
    let fee2Charge;
    if (input.onChain){
        fee2Charge = Scalar.e(0);
    } else {
        fee2Charge = feeUtils.computeFee(input.amount, input.userFee);
    }

    // find token index
    const indexToken = input.feePlanTokens.indexOf(Number(input.tokenID));

    if (indexToken !== -1){
        res[indexToken] = Scalar.add(res[indexToken], fee2Charge);
    }

    return res;
}

function getSingleTxInput(bb, numTx, tx, nTokens){
    const finalInput = bb.getInput();

    const decodeTxCompressedData = txUtils.decodeTxCompressedData(finalInput.txCompressedData[numTx]);

    const input = {
        // accmulate fees
        feePlanTokens: finalInput.feePlanTokens,
        accFeeIn: Array(nTokens).fill(0),

        // past and future data
        futureTxCompressedDataV2: Array(3).fill(0),
        pastTxCompressedDataV2: Array(4).fill(0),
        futureToEthAddr: Array(3).fill(0),
        pastToEthAddr: Array(4).fill(0),
        futureToBjjAy: Array(3).fill(0),
        pastToBjjAy: Array(4).fill(0),
        // tx
        // from
        fromIdx: finalInput.fromIdx[numTx],
        auxFromIdx: finalInput.auxFromIdx[numTx],
        // to
        toIdx: finalInput.toIdx[numTx],
        auxToIdx: finalInput.auxToIdx[numTx],
        toBjjAy: finalInput.toBjjAy[numTx],
        toBjjSign: decodeTxCompressedData.toBjjSign ? 1 : 0,
        toEthAddr: finalInput.toEthAddr[numTx],

        amount: float40.float2Fix(finalInput.amountF[numTx]),
        tokenID: decodeTxCompressedData.tokenID,
        nonce: decodeTxCompressedData.nonce,
        userFee: decodeTxCompressedData.userFee,
        rqOffset: finalInput.rqOffset[numTx], // added by the coordinator
        onChain: finalInput.onChain[numTx], // added by the coordinator
        newAccount: finalInput.newAccount[numTx], // added by the coordinator

        rqTxCompressedDataV2: finalInput.rqTxCompressedDataV2[numTx],
        rqToEthAddr: finalInput.rqToEthAddr[numTx],
        rqToBjjAy: finalInput.rqToBjjAy[numTx],

        sigL2Hash: tx ? txUtils.buildHashSig(tx) : 0,
        s: finalInput.s[numTx],
        r8x: finalInput.r8x[numTx],
        r8y: finalInput.r8y[numTx],

        // L1 Tx
        fromEthAddr: finalInput.fromEthAddr[numTx],
        fromBjjCompressed: finalInput.fromBjjCompressed[numTx],
        loadAmountF: finalInput.loadAmountF[numTx],

        // State 1
        sign1: finalInput.sign1[numTx],
        ay1: finalInput.ay1[numTx],
        balance1: finalInput.balance1[numTx],
        nonce1: finalInput.nonce1[numTx],
        tokenID1: finalInput.tokenID1[numTx],
        ethAddr1: finalInput.ethAddr1[numTx],
        siblings1: finalInput.siblings1[numTx],

        // Required for inserts and delete
        isOld0_1: finalInput.isOld0_1[numTx],
        oldKey1: finalInput.oldKey1[numTx],
        oldValue1: finalInput.oldValue1[numTx],

        // State 2
        sign2: finalInput.sign2[numTx],
        ay2: finalInput.ay2[numTx],
        balance2: finalInput.balance2[numTx],
        newExit: finalInput.newExit[numTx],
        nonce2: finalInput.nonce2[numTx],
        tokenID2: finalInput.tokenID2[numTx],
        ethAddr2: finalInput.ethAddr2[numTx],
        siblings2: finalInput.siblings2[numTx],
        // Required for inserts and delete
        isOld0_2: finalInput.isOld0_2[numTx],
        oldKey2: finalInput.oldKey2[numTx],
        oldValue2: finalInput.oldValue2[numTx],

        // Roots
        oldStateRoot: finalInput.imStateRoot[numTx-1] || finalInput.oldStateRoot,
        oldExitRoot: finalInput.imExitRoot[numTx-1] || 0,
    };

    const output = {
        accFeeOut: accumulateFees(input, nTokens),
        newStateRoot: (finalInput.imStateRoot[numTx] === undefined) ? bb.getNewStateRoot() :
            finalInput.imStateRoot[numTx],
        newExitRoot: (finalInput.imExitRoot[numTx] === undefined) ? bb.getNewExitRoot() :
            finalInput.imExitRoot[numTx],
        isAmountNullified: tx.isAmountNullified ? 1 : 0,
    };
    return {input, output};
}

async function assertTxs(bb, circuit){
    for (let i = 0; i < bb.maxNTx ; i++){
        let res = getSingleTxInput(bb, i, bb.txs[i], bb.totalFeeTransactions);
        let w = await circuit.calculateWitness(res.input, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, res.output);
    }
}

async function assertBatch(bb, circuit){
    const input = bb.getInput();
    const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});

    const output = {
        hashGlobalInputs: bb.getHashInputs(),
    };
    await circuit.assertOut(w, output);
}

async function assertAccountsBalances(accounts, balances, rollupDb){
    for (let i = 0; i < accounts.length; i++){
        const balance = balances[i];
        if (balance != null){
            const idx = accounts[i].idx;
            const res = await rollupDb.getStateByIdx(idx);
            expect(Scalar.e(res.balance).toString()).to.be.equal(Scalar.e(balance).toString());
        }
    }
}

async function printSignals(signals, circuit, w){
    for (let i = 0; i < signals.length ;i++){
        const value = await circuit.getSignal(w, `${signals[i]}`);
        console.log(`${signals[i]}: `, value);
    }
}

async function printBatchOutputs(bb){
    console.log("BB oldLastIdx: ", bb.getOldLastIdx());
    console.log("BB newLastIdx: ", bb.getNewLastIdx());
    console.log("BB oldStRoot: ", bb.getOldStateRoot());
    console.log("BB newStateRoot: ", bb.getNewStateRoot());
    console.log("BB newExitRoot: ", bb.getNewExitRoot());
    console.log("BB L1FullTxsData: ", bb.getL1TxsFullData());
    console.log("BB L2TxsData: ", bb.getL1L2TxsData());
    console.log("BB getFeeTxsData: ", bb.getFeeTxsData());
    console.log("BB chainID: ", bb.chainID);
    console.log("BB currentNumBatch: ", bb.currentNumBatch);
    console.log("BB globalInputStr: ", bb.getInputsStr());
    console.log("BB hashGlobalInput: ", bb.getHashInputs());
}

module.exports = {
    depositTx,
    random,
    accumulateFees,
    getSingleTxInput,
    assertTxs,
    assertBatch,
    assertAccountsBalances,
    printSignals,
    printBatchOutputs,
};

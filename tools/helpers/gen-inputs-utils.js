const Scalar = require("ffjavascript").Scalar;

const float40 = require("@hermeznetwork/commonjs").float40;
const utilsFee = require("@hermeznetwork/commonjs").feeTable;

function randomInterval(min, max) {
    const randMul = Math.floor(Math.random() * 100);
    const intervalRes = Scalar.mul(randMul, (max - min));
    const offsetRes = Scalar.add(Scalar.mul(min, 100), intervalRes);
    return Scalar.div(offsetRes, 100);
}

async function depositTx(bb, account, loadAmount) {
    bb.addTx({
        fromIdx: 0,
        loadAmountF: float40.floorFix2Float(loadAmount),
        tokenID: 1,
        fromBjjCompressed: account.bjjCompressed,
        fromEthAddr: account.ethAddr,
        toIdx: 0,
        onChain: true
    });
}

let tmpAccounts = {};

async function transferTx(bb, accountFrom, accountTo, rollupDb) {
    // get info from
    const fromInfoArray = await rollupDb.getStateByEthAddr(accountFrom.ethAddr);
    const fromInfo = fromInfoArray[randomInterval(0, fromInfoArray.length)];

    // get info to
    const toInfoArray = await rollupDb.getStateByEthAddr(accountTo.ethAddr);
    const toInfo = toInfoArray[randomInterval(0, toInfoArray.length)];

    // check tmpDb
    let baseAmount;
    if (tmpAccounts[fromInfo.idx]){
        baseAmount = tmpAccounts[fromInfo.idx].amount;
    } else {
        baseAmount = fromInfo.balance;
    }

    let baseNonce;
    if (tmpAccounts[fromInfo.idx]){
        baseNonce = tmpAccounts[fromInfo.idx].nonce;
    } else {
        baseNonce = fromInfo.nonce;
    }

    const tx = {
        fromIdx: fromInfo.idx,
        loadAmountF: 0,
        tokenID: 1,
        fromBjjCompressed: 0,
        fromEthAddr: 0,
        toIdx: toInfo.idx,
        amount: float40.round(Scalar.div(Scalar.mul(baseAmount, 20), 100)),
        userFee: 176, // 1 %
        onChain: 0,
        nonce: baseNonce,
    };

    accountFrom.signTx(tx);
    bb.addTx(tx);

    // update tmpAccounts
    tmpAccounts[tx.fromIdx] = {
        amount: Scalar.sub(Scalar.sub(baseAmount, tx.amount), utilsFee.computeFee(tx.amount, tx.userFee)),
        nonce: baseNonce + 1};
}

module.exports = {
    randomInterval,
    depositTx,
    transferTx
};

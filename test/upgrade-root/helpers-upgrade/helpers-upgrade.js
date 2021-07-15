/**
 * Retrieve proof for single step
 * @param {Object} upgradeDb - updareDb Class
 * @param {Number} numProof  - proof number
 * @param {Number} i - relative account index
 * @returns {Object} - input and output for upgrade-step circuit
 */
async function getSingleUpgradeStep(upgradeDb, numProof, i){
    const fullInput = upgradeDb.getProof(numProof);

    const imFinalIdxs = upgradeDb.getImFinalIdxs(numProof);
    const imStateRoot = upgradeDb.getImStateRoot(numProof);

    // build input step
    const input = {
        maxIdx: fullInput.maxIdx,
        inIdx: i == 0 ? fullInput.initialIdx : imFinalIdxs[i - 1],
        inStateRoot: i == 0 ? fullInput.oldStateRoot : imStateRoot[i - 1],
        tokenID: fullInput.tokenID[i],
        nonce: fullInput.nonce[i],
        sign: fullInput.sign[i],
        balance: fullInput.balance[i],
        ay: fullInput.ay[i],
        ethAddr: fullInput.ethAddr[i],
        siblingsState: fullInput.siblings[i],
    };

    const output = {
        outIdx: imFinalIdxs[i],
        outStateRoot: imStateRoot[i],
    };

    return { input, output };
}

/**
 * Assert upgrade-step proof input
 * @param {Object} upgradeDb - upgradeDb Class
 * @param {Object} circuit - circuit compiled
 */
async function assertUpgradeSteps(upgradeDb, circuit){
    const numProofs = upgradeDb.numProofs;
    const nAccounts = upgradeDb.nAccounts;

    for (let i = 0; i < numProofs; i++){
        for (let j = 0; j < nAccounts; j++){
            const res = await getSingleUpgradeStep(upgradeDb, i, j);
            const w = await circuit.calculateWitness(res.input, {logTrigger:false, logOutput: false, logSet: false});
            await circuit.assertOut(w, res.output);
        }
    }
}

/**
 * Assert upgrade-root proof
 * @param {Object} upgradeDb - upgradeDb Class
 * @param {Object} circuit - circuit compiled
 */
async function assertUpgradeRoot(upgradeDb, circuit){
    for (let i = 0; i < upgradeDb.numProofs; i++){
        const input = await upgradeDb.getProof(i);
        const output = await upgradeDb.getOutput(i);
        const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
        await circuit.assertOut(w, output);
    }
}

module.exports = {
    assertUpgradeSteps,
    assertUpgradeRoot
};
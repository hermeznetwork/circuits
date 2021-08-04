const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;
const SMTMemDB = require("circomlib").SMTMemDB;

const commonjsOld = require("@hermeznetwork/commonjs-old");
const Account = require("@hermeznetwork/commonjs").HermezAccount;
const Constants = require("@hermeznetwork/commonjs").Constants;

const { depositTx } = require("../helpers/helpers");
const { assertUpgradeSteps } = require("./helpers-upgrade/helpers-upgrade");
const UpgradeDb = require("../../js/upgrade-db");

describe("Test upgrade-step", function () {
    this.timeout(0);

    const reuse = false;
    const pathTmp = "/tmp/circom_7888jFqbR1qDZW77";

    let circuitPath = path.join(__dirname, "upgrade-step.test.circom");
    let circuit;

    const nAccountsUpgrade = 2;

    const nTx = 10;
    const nLevels = 16;
    const maxL1Tx = 5;
    const maxFeeTx = 5;

    const numInitAccounts = 100;
    const accounts = [];

    before( async() => {
        if (!reuse){
            const circuitCode = `
                include "../../src/upgrade-root/upgrade-step.circom";
                component main = UpgradeStep(${nLevels});
            `;

            fs.writeFileSync(circuitPath, circuitCode, "utf8");

            circuit = await tester(circuitPath, {reduceConstraints:false});
            await circuit.loadConstraints();
            console.log("Constraints: " + circuit.constraints.length + "\n");
        } else {
            const testerAux = require("circom").testerAux;
            circuit = await testerAux(pathTmp, path.join(__dirname, "circuits", "upgrade-step.test.circom"));
        }
    });

    after( async() => {
        if (!reuse)
            fs.unlinkSync(circuitPath);
    });

    it("should initialize accounts", async () => {
        for (let i = 0; i < numInitAccounts; i++){
            const account = new Account(i + 1);
            account.idx = Constants.firstIdx + i;
            accounts.push(account);
        }
    });

    it("Should check migration step one leaf", async () => {
        const db = new SMTMemDB();
        const rollupDB = await commonjsOld.RollupDB(db);

        const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, accounts[0], 1, 1000);

        await bb.build();
        await rollupDB.consolidate(bb);

        const upgradeDb = new UpgradeDb(rollupDB, nAccountsUpgrade, nLevels);

        await upgradeDb.doUpgrade();
        await assertUpgradeSteps(upgradeDb, circuit);
    });

    it("Should check migration step several leaves in one proof", async () => {
        const db = new SMTMemDB();
        const rollupDB = await commonjsOld.RollupDB(db);

        const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, accounts[0], 1, 1000);
        await depositTx(bb, accounts[1], 1, 1000);

        await bb.build();
        await rollupDB.consolidate(bb);

        const upgradeDb = new UpgradeDb(rollupDB, nAccountsUpgrade, nLevels);

        await upgradeDb.doUpgrade();
        await assertUpgradeSteps(upgradeDb, circuit);
    });

    it("Should check migration step several leaves in several proofs", async () => {
        const db = new SMTMemDB();
        const rollupDB = await commonjsOld.RollupDB(db);

        const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        const totalDeposits = 5;
        for (let i = 0; i < totalDeposits; i++){
            await depositTx(bb, accounts[i], i, 1000*i);
        }

        await bb.build();
        await rollupDB.consolidate(bb);

        const upgradeDb = new UpgradeDb(rollupDB, nAccountsUpgrade, nLevels);

        await upgradeDb.doUpgrade();
        await assertUpgradeSteps(upgradeDb, circuit);
    });
});
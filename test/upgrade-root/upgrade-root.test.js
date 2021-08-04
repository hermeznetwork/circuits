const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;
const SMTMemDB = require("circomlib").SMTMemDB;

const commonjsOld = require("@hermeznetwork/commonjs-old");
const Account = require("@hermeznetwork/commonjs").HermezAccount;
const Constants = require("@hermeznetwork/commonjs").Constants;

const { depositTx } = require("../helpers/helpers");
const { assertUpgradeRoot } = require("./helpers-upgrade/helpers-upgrade");
const UpgradeDb = require("../../js/upgrade-db");

describe("Test upgrade-root", function () {
    this.timeout(0);

    const reuse = false;
    const pathTmp = "/tmp/circom_14676q9wEzEedL20V";

    let circuitPath = path.join(__dirname, "upgrade-root.test.circom");
    let circuit;

    const nAccountsUpgrade = 4;

    const nTx = 10;
    const nLevels = 16;
    const maxL1Tx = 5;
    const maxFeeTx = 5;

    const numInitAccounts = 100;
    const accounts = [];

    before( async() => {
        if (!reuse){
            const circuitCode = `
                include "../../src/upgrade-root/upgrade-root.circom";
                component main = UpgradeRoot(${nLevels}, ${nAccountsUpgrade});
            `;

            fs.writeFileSync(circuitPath, circuitCode, "utf8");

            circuit = await tester(circuitPath, {reduceConstraints:false});
            await circuit.loadConstraints();
            console.log("Constraints: " + circuit.constraints.length + "\n");
        } else {
            const testerAux = require("circom").testerAux;
            circuit = await testerAux(pathTmp, path.join(__dirname, "circuits", "upgrade-root.test.circom"));
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

    it("Should check one leaf upgrade", async () => {
        const db = new SMTMemDB();
        const rollupDB = await commonjsOld.RollupDB(db);

        const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, accounts[0], 1, 1000);

        await bb.build();
        await rollupDB.consolidate(bb);

        const upgradeDb = new UpgradeDb(rollupDB, nAccountsUpgrade, nLevels);

        await upgradeDb.doUpgrade();

        await assertUpgradeRoot(upgradeDb, circuit);
    });

    it("Should check several leaves upgrade in one proof", async () => {
        const db = new SMTMemDB();
        const rollupDB = await commonjsOld.RollupDB(db);

        const bb = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        await depositTx(bb, accounts[0], 1, 1000);
        await depositTx(bb, accounts[1], 2, 500);
        await depositTx(bb, accounts[2], 3, 250);

        await bb.build();
        await rollupDB.consolidate(bb);

        const upgradeDb = new UpgradeDb(rollupDB, nAccountsUpgrade, nLevels);

        await upgradeDb.doUpgrade();

        await assertUpgradeRoot(upgradeDb, circuit);
    });

    it("Should check several leaves upgrade with several proofs", async () => {
        const db = new SMTMemDB();
        const rollupDB = await commonjsOld.RollupDB(db);

        // Fill 10 accounts:
        // - 2 full proofs
        // - 1 proof: 2 accounts and 2 empty
        const bb1 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        for (let i = 0; i < maxL1Tx; i++){
            await depositTx(bb1, accounts[i], i, i*238);
        }
        await bb1.build();
        await rollupDB.consolidate(bb1);

        const bb2 = await rollupDB.buildBatch(nTx, nLevels, maxL1Tx, maxFeeTx);
        for (let i = 0; i < maxL1Tx; i++){
            await depositTx(bb2, accounts[i + maxL1Tx], 10, 20000);
        }
        await bb2.build();
        await rollupDB.consolidate(bb2);


        const upgradeDb = new UpgradeDb(rollupDB, nAccountsUpgrade, nLevels);

        await upgradeDb.doUpgrade();

        await assertUpgradeRoot(upgradeDb, circuit);
    });
});
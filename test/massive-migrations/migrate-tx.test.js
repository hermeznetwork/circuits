const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;
const Scalar = require("ffjavascript").Scalar;
const SMTMemDB = require("circomlib").SMTMemDB;

const RollupDB = require("@hermeznetwork/commonjs").RollupDB;
const Account = require("@hermeznetwork/commonjs").HermezAccount;
const helpersMigrations = require("./helpers-migrations/helpers-migrations");

describe("Test MigrateTx", function () {
    this.timeout(0);

    const reuse = false;
    const pathTmp = "/tmp/circom_22241kzA2pttkBsZI";

    let circuitPath = path.join(__dirname, "migrate-tx.test.circom");
    let circuit;

    const maxTx = 20;
    const maxL1Tx = 5;
    const nLevels = 16;
    const numAccounts = 5;
    const migrationAccount = numAccounts - 1;
    const numDeposits = migrationAccount - 1;
    const maxMigrationTx = 2;

    let accounts = [];
    let sourceRollupDb;
    let destRollupDb;

    before( async() => {
        if (!reuse){
            const circuitCode = `
            include "../../src/massive-migrations/migrate-tx.circom";
            component main = MigrateTx(${nLevels});
        `;
            fs.writeFileSync(circuitPath, circuitCode, "utf8");

            circuit = await tester(circuitPath, {reduceConstraints:false});
            await circuit.loadConstraints();
            console.log("Constraints: " + circuit.constraints.length + "\n");
        } else {
            const testerAux = require("circom").testerAux;
            circuit = await testerAux(pathTmp, path.join(__dirname, "circuits", "migrate-tx.test.circom"));
        }
    });

    after( async() => {
        if (!reuse)
            fs.unlinkSync(circuitPath);
    });

    it("Should initialize test environment", async () => {
        for (let i = 0; i < numAccounts; i++){
            const account = new Account(i+1);
            accounts.push(account);
        }

        sourceRollupDb = await helpersMigrations.initSourceRollupDb(maxTx, nLevels, maxL1Tx, accounts, numDeposits, migrationAccount);

        // RollupDestinyDB
        const destDb = new SMTMemDB();
        destRollupDb = await RollupDB(destDb);
        await destRollupDb.setMigrationIdx(accounts[migrationAccount].migrationIdx);
    });

    it("Should test empty migration transactions", async () => {
        // add empty batches to migrate minBatches
        const bbToBuild = 10;

        while (sourceRollupDb.lastBatch < bbToBuild){
            const bb = await sourceRollupDb.buildBatch(maxTx, nLevels, maxL1Tx);
            bb.build();
            await sourceRollupDb.consolidate(bb);
        }

        // migration-builder
        const initBatch = 1;
        const finalBatch = 10;
        const mb = await destRollupDb.buildMigration(maxMigrationTx, nLevels, sourceRollupDb, initBatch, finalBatch);

        await mb.build();
        await destRollupDb.consolidateMigrate(mb);
        await helpersMigrations.assertTxs(mb, circuit);
    });

    it("Should check an insert migration tx", async () => {
        const bb2 = await sourceRollupDb.buildBatch(maxTx, nLevels, maxL1Tx);

        // transfer to migrateIdx that triggers a migration transaction:
        // insert
        const tx = {
            fromIdx: accounts[0].sourceIdx,
            toIdx: destRollupDb.migrationIdx,
            tokenID: 1,
            amount: Scalar.e(20),
            nonce: 0,
            userFee: 125,
        };

        accounts[0].signTx(tx);
        bb2.addTx(tx);

        await bb2.build();
        await sourceRollupDb.consolidate(bb2);

        // add empty batches to migrate at least `minBatchesToMigrate`
        const bbToBuild = 20;

        while (sourceRollupDb.lastBatch < bbToBuild){
            const bb = await sourceRollupDb.buildBatch(maxTx, nLevels, maxL1Tx);
            bb.build();
            await sourceRollupDb.consolidate(bb);
        }

        // migration-builder
        const initBatch = 10;
        const finalBatch = 20;
        const mb = await destRollupDb.buildMigration(maxMigrationTx, nLevels, sourceRollupDb, initBatch, finalBatch);

        await mb.build();
        await destRollupDb.consolidateMigrate(mb);
        await helpersMigrations.assertTxs(mb, circuit);
    });

    it("Should check an update migration tx", async () => {
        const bb3 = await sourceRollupDb.buildBatch(maxTx, nLevels, maxL1Tx);

        // transfer to migrateIdx that triggers a migration transaction:
        // update (leaf already exist)
        const tx = {
            fromIdx: accounts[0].sourceIdx,
            toIdx: destRollupDb.migrationIdx,
            tokenID: 1,
            amount: Scalar.e(20),
            nonce: 1,
            userFee: 125,
        };

        accounts[0].signTx(tx);
        bb3.addTx(tx);

        await bb3.build();
        await sourceRollupDb.consolidate(bb3);

        // add empty batches to migrate at least `minBatchesToMigrate`
        const bbToBuild = 30;

        while (sourceRollupDb.lastBatch < bbToBuild){
            const bb = await sourceRollupDb.buildBatch(maxTx, nLevels, maxL1Tx);
            bb.build();
            await sourceRollupDb.consolidate(bb);
        }

        // migration-builder
        const initBatch = 20;
        const finalBatch = 30;
        const mb = await destRollupDb.buildMigration(maxMigrationTx, nLevels, sourceRollupDb, initBatch, finalBatch);

        await mb.build();
        await destRollupDb.consolidateMigrate(mb);
        await helpersMigrations.assertTxs(mb, circuit);
    });

    it("Should check several migration txs", async () => {
        const bb4 = await sourceRollupDb.buildBatch(maxTx, nLevels, maxL1Tx);

        // transfer to migrateIdx that triggers a migration transaction:
        // update (cannot pay fees twice)
        const tx = {
            fromIdx: accounts[0].sourceIdx,
            toIdx: destRollupDb.migrationIdx,
            tokenID: 1,
            amount: Scalar.e(100),
            nonce: 2,
            userFee: 193,
        };

        // transfer to migrateIdx that triggers a migration transaction:
        // insert with 0 amount (cannot pay fees twice)
        const tx2 = {
            fromIdx: accounts[1].sourceIdx,
            toIdx: destRollupDb.migrationIdx,
            tokenID: 1,
            amount: Scalar.e(0),
            nonce: 0,
            userFee: 0,
        };

        accounts[0].signTx(tx);
        accounts[1].signTx(tx2);
        bb4.addTx(tx);
        bb4.addTx(tx2);

        await bb4.build();
        await sourceRollupDb.consolidate(bb4);

        // add empty batches to migrate at least `minBatchesToMigrate`
        const bbToBuild = 40;

        while (sourceRollupDb.lastBatch < bbToBuild){
            const bb = await sourceRollupDb.buildBatch(maxTx, nLevels, maxL1Tx);
            bb.build();
            await sourceRollupDb.consolidate(bb);
        }

        // migration-builder
        const initBatch = 30;
        const finalBatch = 40;
        const mb = await destRollupDb.buildMigration(maxMigrationTx, nLevels, sourceRollupDb, initBatch, finalBatch);

        await mb.build();
        await destRollupDb.consolidateMigrate(mb);
        await helpersMigrations.assertTxs(mb, circuit);
    });
});
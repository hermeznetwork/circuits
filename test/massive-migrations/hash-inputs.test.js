const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;
const Scalar = require("ffjavascript").Scalar;
const SMTMemDB = require("circomlib").SMTMemDB;

const RollupDB = require("@hermeznetwork/commonjs").RollupDB;
const Account = require("@hermeznetwork/commonjs").HermezAccount;
const helpersMigrations = require("./helpers-migrations/helpers-migrations");

describe("Test HashInputs", function () {
    this.timeout(0);

    const reuse = false;
    const pathTmp = "/tmp/circom_14421rpwfmG0Bw8oh";

    let circuitPath = path.join(__dirname, "hash-inputs.test.circom");
    let circuit;

    const maxTx = 20;
    const maxL1Tx = 5;
    const nLevels = 16;
    const numAccounts = 5;
    const migrationAccount = numAccounts - 1;
    const numDeposits = migrationAccount - 1;
    const maxMigrationTx = 10;

    let accounts = [];
    let sourceRollupDb;
    let destRollupDb;

    before( async() => {
        if (!reuse){
            const circuitCode = `
                include "../../src/massive-migrations/hash-inputs.circom";
                component main = HashInputs(${nLevels});
            `;
            fs.writeFileSync(circuitPath, circuitCode, "utf8");

            circuit = await tester(circuitPath, {reduceConstraints:false});
            await circuit.loadConstraints();
            console.log("Constraints: " + circuit.constraints.length + "\n");
        } else {
            const testerAux = require("circom").testerAux;
            circuit = await testerAux(pathTmp, path.join(__dirname, "circuits", "hash-inputs.test.circom"));
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

    it("Should check empty migration txs", async () => {
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

        const pretendedInputs = mb.getPretendedPublicInputs();

        const inputs = {
            initSourceStateRoot: pretendedInputs.initSourceStateRoot,
            finalSourceStateRoot: pretendedInputs.finalSourceStateRoot,
            destinyOldStateRoot: pretendedInputs.oldStateRoot,
            destinyNewStateRoot: pretendedInputs.newStateRoot,
            oldLastIdx: pretendedInputs.oldLastIdx,
            newLastIdx: pretendedInputs.newLastIdx,
            migrationIdx: pretendedInputs.migrationIdx,
            feeIdx: pretendedInputs.feeIdx,
            batchesToMigrate: pretendedInputs.batchesToMigrate,
        };

        const w = await circuit.calculateWitness(inputs, {logTrigger:false, logOutput: false, logSet: false});

        const checkOut = {
            hashInputsOut: mb.getHashInputs(),
        };

        await circuit.assertOut(w, checkOut);
    });

    it("Should check several migration txs", async () => {
        const bb2 = await sourceRollupDb.buildBatch(maxTx, nLevels, maxL1Tx);
        // two sends to exit-only account
        const tx = {
            fromIdx: accounts[0].sourceIdx,
            toIdx: destRollupDb.migrationIdx,
            tokenID: 1,
            amount: Scalar.e(20),
            nonce: 0,
            userFee: 125,
        };

        const tx2 = {
            fromIdx: accounts[1].sourceIdx,
            toIdx: destRollupDb.migrationIdx,
            tokenID: 1,
            amount: Scalar.e(100),
            nonce: 0,
            userFee: 127,
        };

        accounts[0].signTx(tx);
        accounts[1].signTx(tx2);
        bb2.addTx(tx);
        bb2.addTx(tx2);

        await bb2.build();
        await sourceRollupDb.consolidate(bb2);

        // add empty batches to migrate minBatches
        const bbToBuild = 20;

        while (sourceRollupDb.lastBatch < bbToBuild){
            const bb = await sourceRollupDb.buildBatch(maxTx, nLevels, maxL1Tx);
            bb.build();
            await sourceRollupDb.consolidate(bb);
        }

        // migration-builder
        const initBatch = 11;
        const finalBatch = 20;
        const mb = await destRollupDb.buildMigration(maxMigrationTx, nLevels, sourceRollupDb, initBatch, finalBatch);

        await mb.build();

        const pretendedInputs = mb.getPretendedPublicInputs();

        const inputs = {
            initSourceStateRoot: pretendedInputs.initSourceStateRoot,
            finalSourceStateRoot: pretendedInputs.finalSourceStateRoot,
            destinyOldStateRoot: pretendedInputs.oldStateRoot,
            destinyNewStateRoot: pretendedInputs.newStateRoot,
            oldLastIdx: pretendedInputs.oldLastIdx,
            newLastIdx: pretendedInputs.newLastIdx,
            migrationIdx: pretendedInputs.migrationIdx,
            feeIdx: pretendedInputs.feeIdx,
            batchesToMigrate: pretendedInputs.batchesToMigrate,
        };

        const w = await circuit.calculateWitness(inputs, {logTrigger:false, logOutput: false, logSet: false});

        const checkOut = {
            hashInputsOut: mb.getHashInputs(),
        };

        await circuit.assertOut(w, checkOut);
    });
});
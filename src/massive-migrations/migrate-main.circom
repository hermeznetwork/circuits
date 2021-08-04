include "../../node_modules/circomlib/circuits/smt/smtverifier.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";

include "../fee-tx.circom";
include "../lib/hash-state.circom";
include "./compute-acc-hash.circom";
include "./migrate-tx.circom";
include "./hash-inputs.circom";

/**
 * Decodes and process all rollup transactions and pay accumulated fees
 * @param nTx - absolute maximum of L1 or L2 transactions
 * @param nLevels - merkle tree depth
 * @input imOutAccHash[nTx-1] - {Array(Field)} - intermediary signals: decode transaction computed accumulated hash
 * @input imOutCounter[nTx-1] - {Array(Field)} - intermediary signals: decode transaction counter
 * @input imStateRoot[nTx-1] - {Array(Field)} - intermediary signals: transaction final state root
 * @input imOutIdx[nTx-1] - {Array(Uint48)} - intermediary signals: transaction final index merkle tree assigned
 * @input imAccFeeOut[nTx-1] - {Array(Uin192)} - intermediary signals: transaction final accumulate fee 
 * @input imInitStateRootFeeTx - {Field} - intermediary signals: state root before processing fee transaction
 * @input imFinalAccFee - {Uin192} - intermediary signals: accumulated fee before processing fee transaction
 * @input imFinalOutIdx - {Uint48} - intermediary signals: final index merkle tre assigned
 * @input initSourceStateRoot - {Field} - initial state root source rollup
 * @input finalSourceStateRoot - {Field} - final state root source rollup
 * @input oldStateRoot - {Field} - initial state root
 * @input oldLastIdx - {Uint48} - old last index assigned
 * @input migrationIdx - {Uint48} - migration merkle tree index on source rollup
 * @input feeIdx - {Uint48} - merkle tree index to receive fees
 * @input totalBatchesToMigrate - {Uint32} - number of batches that will be migrated
 * @input tokenID - {Uint32} - tokenID of the migration leaf
 * @input initBalance - {Uint192} - balance of the migration leaf on the initial state root
 * @input finalBalance - {Uint192} - balance of the migration leaf on the final state root
 * @input ethAddr - {Uint160} - ethAddr of the migration leaf
 * @input initExitBalance - {Uint192} - exit balance of the migration leaf on the initial source state root
 * @input finalExitBalance - {Uint192} - exit balance of the migration leaf on the final source state root
 * @input initAccHash - {Field} - received transactions hash chain of the migration leaf on the initial state root
 * @input finalAccHash - {Field} - received transactions hash chain of the migration leaf on the final state root
 * @input initSiblings[nLevels + 1] - {Array[Field)]} - siblings merkle proof of the migration leaf on the initial state root
 * @input finalSiblings[nLevels + 1] - {Array[Field)]} - siblings merkle proof of the migration leaf on the final state root
 * @input L1-L2 data availability[nTx] - {Array[Field]} - data-availability of all transactions to migrate
 * @input tokenID1[nTx] - {Array(Uint32)} - tokenID of the source rollup leaf 
 * @input nonce1[nTx] - {Array(Uint40)} - nonce of the source rollup leaf
 * @input sign1[nTx] - {Array(Bool)} - sign of the source rollup leaf
 * @input balance1[nTx] - {Array(Uint192)} - balance of the source rollup leaf
 * @input ay1[nTx] - {Array(Field)} - ay of the source rollup leaf
 * @input ethAddr1[nTx] - {Array(Uint160)} - ethAddr of the source rollup leaf
 * @input exitBalance1[nTx] - {Array(Uint192)} - account exit balance of the source rollup leaf
 * @input accumulatedHash1[nTx] - {Array(Field)} - received transactions hash chain of the source rollup leaf
 * @input siblings1[nTx][nLevels + 1] - {Array[Array(Field)]} - siblings merkle proof of the source rollup leaf
 * @input idxDestiny[nTx] - {Array[Uint48]} - merkle tree index to receiver balance migrated
 * @input nonce2[nTx] - {Array(Uint40)} - nonce of the receiver leaf
 * @input balance2[nTx] - {Array(Uint192)} - balance of the receiver leaf
 * @input exitBalance2[nTx] - {Array(Uint192)} - exit balance of the receiver leaf
 * @input accumulatedHash2[nTx] - {Array(Field)} - received transactions hash chain of the receiver leaf
 * @input siblings2[nTx][nLevels + 1] - {Array[Array(Field)]} - siblings merkle proof of the receiver leaf
 * @input isOld0_2[nTx] - {Array(Bool)} - flag to require old key - value
 * @input oldKey2[nTx] - {Array(Uint48)} - old key of the receiver leaf
 * @input oldValue2[nTx] - {Array(Field)} - old value of the receiver leaf
 * @input tokenID3 - {Uint32} - tokenID of the fee receiver leaf
 * @input nonce3 - {Uint40} - nonce of the fee receiver leaf
 * @input sign3 - {Bool} - sign of the fee receiver leaf
 * @input balance3 - {Uint192} - balance of the fee receiver leaf
 * @input ay3 - {Field} - ay of the fee receiver leaf
 * @input ethAddr3 - {Uint160} - ethAddr of the fee receiver leaf
 * @input exitBalance3 - {Uint192} - account exit balance of the fee receiver leaf
 * @input accumulatedHash3 - {Field} - received transactions hash chain of the fee receiver leaf
 * @input siblings3[nLevels + 1] - {Array(Field)} - siblings merkle proof of the fee receiver leaf
 * @output hashGlobalInputs - {Field} - hash of all pretended input signals
 */
template MigrateMain(nTx, nLevels) {
    // Phases migrate-main circuit:
        // A: Verify correctness of accumulated hash for migration idx in initSourceStateRoot and finalSourceStateRoot
        // B: Decode and verify transactions to process
        // C: Check minimum batches to process or minimum transaction to process
        // D: Verify correctness data provided for each transaction idx
        // E: Process migrate transactions in oldStateRoot
        // F: Process accumulated fee tx
        // G: Hash global inputs

    // Unique public signal
    signal output hashGlobalInputs;

    // Intermediary States to parallelize witness computation
    // decode-compute-accumulated-hash
    signal private input imOutAccHash[nTx-1];
    signal private input imOutCounter[nTx-1];
    // migration-tx
    signal private input imStateRoot[nTx-1];
    signal private input imOutIdx[nTx-1];
    signal private input imAccFeeOut[nTx-1];
    // fee-tx
    signal private input imInitStateRootFeeTx;
    signal private input imFinalAccFee;
    // hash global input
    signal private input imFinalOutIdx;

    // private signals taking part of the hashGlobalInputs
    signal private input initSourceStateRoot;
    signal private input finalSourceStateRoot;
    signal private input oldStateRoot;
    signal private input oldLastIdx;
    signal private input migrationIdx;
    signal private input feeIdx;
    signal private input totalBatchesToMigrate;

    // signals needed to proof accumulatedHash in initSourceStateRoot & finalSourceStateRoot
    signal private input tokenID;
    signal private input initBalance;
    signal private input finalBalance;
    signal private input ethAddr;
    signal private input initExitBalance;
    signal private input finalExitBalance;
    signal private input initAccHash;
    signal private input finalAccHash;
    signal private input initSiblings[nLevels+1];
    signal private input finalSiblings[nLevels+1];

    // data availability for each transaction to process
    signal private input L1L2TxsData[nTx];

    // signals to proof fromIdx[nTx] data correctness
    signal private input tokenID1[nTx];
    signal private input nonce1[nTx];
    signal private input sign1[nTx];
    signal private input balance1[nTx];
    signal private input ay1[nTx];
    signal private input ethAddr1[nTx];
    signal private input exitBalance1[nTx];
    signal private input accumulatedHash1[nTx];
    signal private input siblings1[nTx][nLevels+1];

    // signals needed to process migration transactions
    // signaling add balance to the same leaf or create new one
    signal private input idxDestiny[nTx];
    // receiver state
    signal private input nonce2[nTx];
    signal private input balance2[nTx];
    signal private input exitBalance2[nTx];
    signal private input accumulatedHash2[nTx];
    signal private input siblings2[nTx][nLevels+1];
    // Required for inserts and deletes
    signal private input isOld0_2[nTx];
    signal private input oldKey2[nTx];
    signal private input oldValue2[nTx];

    // signals needed to process fee tx
    signal private input tokenID3;
    signal private input nonce3;
    signal private input sign3;
    signal private input balance3;
    signal private input ay3;
    signal private input ethAddr3;
    signal private input exitBalance3;
    signal private input accumulatedHash3;
    signal private input siblings3[nLevels+1];

    var i;
    var j;

    // A: verify correctness of accumulated hash for migration idx in initSourceStateRoot and finalSourceStateRoot
    //////////
    var SIGN_EXIT_ONLY = 1;
    var AY_EXIT_ONLY = (1<<253) - 1; // 0x1FFF...FFFF

    // build init state and verify it
    component initState = HashState();
    initState.tokenID <== tokenID;
    initState.nonce <== 0; // only-exit accounts cannot perform L2 tx
    initState.sign <== SIGN_EXIT_ONLY;
    initState.balance <== initBalance;
    initState.ay <== AY_EXIT_ONLY;
    initState.ethAddr <== ethAddr;
    initState.exitBalance <== initExitBalance;
    initState.accumulatedHash <== initAccHash;

	component initSmtVerify = SMTVerifier(nLevels + 1);
	initSmtVerify.enabled <== 1;
	initSmtVerify.fnc <== 0;
	initSmtVerify.root <== initSourceStateRoot;
	for (var i = 0; i < nLevels + 1; i++) {
		initSmtVerify.siblings[i] <== initSiblings[i];
	}
	initSmtVerify.oldKey <== 0;
	initSmtVerify.oldValue <== 0;
	initSmtVerify.isOld0 <== 0;
	initSmtVerify.key <== migrationIdx;
	initSmtVerify.value <== initState.out;

    // build final state and verify it
    component finalState = HashState();
    finalState.tokenID <== tokenID;
    finalState.nonce <== 0;
    finalState.sign <== SIGN_EXIT_ONLY;
    finalState.balance <== finalBalance;
    finalState.ay <== AY_EXIT_ONLY;
    finalState.ethAddr <== ethAddr;
    finalState.exitBalance <== finalExitBalance;
    finalState.accumulatedHash <== finalAccHash;

    component finalSmtVerify = SMTVerifier(nLevels + 1);
	finalSmtVerify.enabled <== 1;
	finalSmtVerify.fnc <== 0;
	finalSmtVerify.root <== finalSourceStateRoot;
	for (var i = 0; i < nLevels + 1; i++) {
		finalSmtVerify.siblings[i] <== finalSiblings[i];
	}
	finalSmtVerify.oldKey <== 0;
	finalSmtVerify.oldValue <== 0;
	finalSmtVerify.isOld0 <== 0;
	finalSmtVerify.key <== migrationIdx;
	finalSmtVerify.value <== finalState.out;

    // B: Decode and verify transactions to process
    //////////
    // decode and verify data availability
    component decodeTx[nTx];

    for (i = 0; i < nTx; i++){
        decodeTx[i] = ComputeDecodeAccumulateHash(nLevels);

        if (i == 0) {
            decodeTx[i].inAccHash <== initAccHash;
            decodeTx[i].inCounter <== 0;
        } else {
            decodeTx[i].inAccHash <== imOutAccHash[i-1];
            decodeTx[i].inCounter <== imOutCounter[i-1];
        }
        decodeTx[i].L1L2TxsData <== L1L2TxsData[i];
    }

    // check integrity decode-compute intermediary signals
    ////////
    for (i = 0; i < nTx-1; i++) {
        decodeTx[i].outAccHash  === imOutAccHash[i];
        decodeTx[i].outCounter  === imOutCounter[i];
    }

    // check integrity final accumulated hash 
    decodeTx[nTx-1].outAccHash === finalAccHash;

    // C: Check minimum batches to process or minimum transaction to process
    //////////
    // If there are more than or equal MIN_BATCHES_MIGRATE to migrate, do not check MIN_TXS_MIGRATE
    // If there are less than MIN_BATCHES_MIGRATE to migrate, then check MIN_TXS_MIGRATE

    // checks: MIN_BATCHES_MIGRATE > totalBatchesToMigrate
    var MIN_BATCHES_MIGRATE = 10;
    component minBatchesToMigrate = GreaterThan(8);

    minBatchesToMigrate.in[0] <== MIN_BATCHES_MIGRATE;
    minBatchesToMigrate.in[1] <== totalBatchesToMigrate;

    // checks: numTxToProcess > MIN_TXS_MIGRATE
    var MIN_TXS_MIGRATE = 100;
    component minTxToMigrate = GreaterThan(8);

    minTxToMigrate.in[0] <== decodeTx[nTx-1].outCounter;
    minTxToMigrate.in[1] <== MIN_TXS_MIGRATE;

    (1 - minTxToMigrate.out) * minBatchesToMigrate.out === 0;

    // D: Verify correctness data provided for each transaction idx
    //////////
    component smtVerify[nTx];
    component stateFromIdx[nTx];

    for (i = 0; i < nTx; i++){
        smtVerify[i] = SMTVerifier(nLevels + 1);
        stateFromIdx[i] = HashState();

        stateFromIdx[i].tokenID <== tokenID1[i];
        stateFromIdx[i].nonce <== nonce1[i];
        stateFromIdx[i].sign <== sign1[i];
        stateFromIdx[i].balance <== balance1[i];
        stateFromIdx[i].ay <== ay1[i];
        stateFromIdx[i].ethAddr <== ethAddr1[i];
        stateFromIdx[i].exitBalance <== exitBalance1[i];
        stateFromIdx[i].accumulatedHash <== accumulatedHash1[i];

        smtVerify[i].enabled <== (1 - decodeTx[i].isNop);
	    smtVerify[i].fnc <== 0;
	    smtVerify[i].root <== finalSourceStateRoot;
	    for (j = 0; j < nLevels + 1; j++) {
	    	smtVerify[i].siblings[j] <== siblings1[i][j];
	    }
	    smtVerify[i].oldKey <== 0;
	    smtVerify[i].oldValue <== 0;
	    smtVerify[i].isOld0 <== 0;
	    smtVerify[i].key <== decodeTx[i].fromIdx;
	    smtVerify[i].value <== stateFromIdx[i].out;
    }

    // E: Process migrate transactions in oldStateRoot
    //////////
    component migrateTx[nTx];

    for (i = 0; i < nTx; i++){
        migrateTx[i] = MigrateTx(nLevels);

        if (i == 0) {
            migrateTx[i].oldStateRoot <== oldStateRoot;
            migrateTx[i].inIdx <== oldLastIdx;
            migrateTx[i].accFeeIn <== 0;
        } else {
            migrateTx[i].oldStateRoot <== imStateRoot[i-1];
            migrateTx[i].inIdx <== imOutIdx[i-1];
            migrateTx[i].accFeeIn <== imAccFeeOut[i-1];
        }

        migrateTx[i].isNop <== decodeTx[i].isNop;
        migrateTx[i].idx <== idxDestiny[i];
        migrateTx[i].migrateAmount <== decodeTx[i].amount;
        migrateTx[i].userFee <== decodeTx[i].userFee;
        migrateTx[i].ay <== ay1[i];
        migrateTx[i].sign <== sign1[i];
        migrateTx[i].ethAddr <== ethAddr1[i];
        migrateTx[i].tokenID <== tokenID1[i];

        migrateTx[i].isOld0 <== isOld0_2[i];
        migrateTx[i].oldKey <== oldKey2[i];
        migrateTx[i].oldValue <== oldValue2[i];

        migrateTx[i].nonce <== nonce2[i];
        migrateTx[i].balance <== balance2[i];
        migrateTx[i].exitBalance <== exitBalance2[i];
        migrateTx[i].accumulatedHash <== accumulatedHash2[i];

        for (j = 0; j < nLevels + 1; j++) {
	    	migrateTx[i].siblings[j] <== siblings2[i][j];
	    }
    }

    // check integrity transactions intermediary signals
    for (i = 0; i < nTx-1; i++) {
        migrateTx[i].newStateRoot  === imStateRoot[i];
        migrateTx[i].accFeeOut  === imAccFeeOut[i];
        migrateTx[i].outIdx  === imOutIdx[i];
    }

    // F: Process accumulated fee tx
    ////////
    component feeTx;
    feeTx = FeeTx(nLevels);

    feeTx.oldStateRoot <== migrateTx[nTx-1].newStateRoot;
    feeTx.feePlanToken <== tokenID;
    feeTx.feeIdx <== feeIdx;
    feeTx.accFee <== imFinalAccFee;

    feeTx.tokenID <== tokenID3;
    feeTx.nonce <== nonce3;
    feeTx.sign <== sign3;
    feeTx.balance <== balance3;
    feeTx.ay <== ay3;
    feeTx.ethAddr <== ethAddr3;
    feeTx.exitBalance <== exitBalance3;
    feeTx.accumulatedHash <== accumulatedHash3;

    for (j = 0; j < nLevels+1; j++) {
        feeTx.siblings[j] <== siblings3[j]
    }

    // check integrity transactions intermediary signals
    migrateTx[nTx-1].newStateRoot === imInitStateRootFeeTx;
    migrateTx[nTx-1].accFeeOut === imFinalAccFee;

    // G: Hash global inputs
    ////////
    component hasherInputs = HashInputs(nLevels);

    hasherInputs.initSourceStateRoot <== initSourceStateRoot;
    hasherInputs.finalSourceStateRoot <== finalSourceStateRoot;
    hasherInputs.destinyOldStateRoot <== oldStateRoot;
    hasherInputs.destinyNewStateRoot <== feeTx.newStateRoot;
    hasherInputs.oldLastIdx <== oldLastIdx;
    hasherInputs.newLastIdx <== imFinalOutIdx;
    hasherInputs.migrationIdx <== migrationIdx;
    hasherInputs.feeIdx <== feeIdx;
    hasherInputs.batchesToMigrate <== totalBatchesToMigrate;

    // check integrity hash global inputs intermediary signals
    migrateTx[nTx-1].outIdx === imFinalOutIdx;

    // set public output
    hashGlobalInputs <== hasherInputs.hashInputsOut;
}
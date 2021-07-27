include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/smt/smtprocessor.circom";
include "../../node_modules/circomlib/circuits/smt/smtverifier.circom";
include "../../node_modules/circomlib/circuits/sha256/sha256.circom";

include "./upgrade-step.circom"

/**
 * Upgrade state root account by account
 * @param nLevels - merkle tree depth
 * @param nAccounts - accounts to update
 * @input initialIdx - {Uint48} - first account to update
 * @input maxIdx - {Field} - maximum account to update
 * @input oldStateRoot - {Field} - initial state root
 * @input tokenID[nAccounts] - {Array(Uint32)} - tokenID of the account to update
 * @input nonce[nAccounts] - {Array(Uint40)} - nonce of the account to update
 * @input sign[nAccounts] - {Array(Bool)} - sign of the account to update
 * @input balance[nAccounts] - {Array(Uint192)} - balance of the account to update
 * @input ay[nAccounts] - {Array(Field)} - ay of the account to update
 * @input ethAddr[nAccounts] - {Array(Uint160)} - ethAddr of the account to update
 * @input siblings[nAccounts][nLevels + 1] - {Array[Array(Field)]} - siblings merkle proof account to update
 * @output finalIdx - {Uint48} - last account that has been updated
 * @output newStateRoot - {Field} - last state root after account updating
 */
template UpgradeRoot(nLevels, nAccounts) {

    signal input initialIdx;
    signal output finalIdx;

    signal input maxIdx;

    signal input oldStateRoot;
    signal output newStateRoot;

    // private inputs old state
	signal private input tokenID[nAccounts];
    signal private input nonce[nAccounts];
    signal private input sign[nAccounts];
    signal private input balance[nAccounts];
    signal private input ay[nAccounts];
    signal private input ethAddr[nAccounts];
    signal private input siblings[nAccounts][nLevels + 1];

    var i;
    var j;

    component upgradeStep[nAccounts];

    for (i = 0; i < nAccounts; i++){
        upgradeStep[i] = UpgradeStep(nLevels);

        if (i == 0){
            upgradeStep[i].inIdx <== initialIdx;
            upgradeStep[i].inStateRoot <== oldStateRoot;
        } else {
            upgradeStep[i].inIdx <== upgradeStep[i-1].outIdx;
            upgradeStep[i].inStateRoot <== upgradeStep[i-1].outStateRoot;
        }

        upgradeStep[i].maxIdx <== maxIdx;
        upgradeStep[i].tokenID <== tokenID[i];
        upgradeStep[i].nonce <== nonce[i];
        upgradeStep[i].sign <== sign[i];
        upgradeStep[i].balance <== balance[i];
        upgradeStep[i].ay <== ay[i];
        upgradeStep[i].ethAddr <== ethAddr[i];

        for (j = 0; j < nLevels+1; j++) {
            upgradeStep[i].siblingsState[j] <== siblings[i][j];
        }
    }

    finalIdx <== upgradeStep[nAccounts-1].outIdx;
    newStateRoot <== upgradeStep[nAccounts-1].outStateRoot;
}

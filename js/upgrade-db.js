const Scalar = require("ffjavascript").Scalar;
const commonjs = require("@hermeznetwork/commonjs");
const commonjsOld = require("@hermeznetwork/commonjs-old");
const SMT = require("circomlib").SMT;
const poseidonHash = require("circomlib").poseidon;

/**
 * Upgrade rollupDb account to v1
 */
class UpgradeDb {

    /**
     * constructor
     * @param {Object} rollupDb - RollupDb with old accounts
     * @param {Number} nAccounts - maximum accounts to update in each proof
     * @param {Number} nLevels - merkle tree depth
     */
    constructor(rollupDb, nAccounts, nLevels){
        this.rollupDb = rollupDb;
        this.nAccounts = nAccounts;
        this.maxIdx = this.rollupDb.initialIdx;
        this.initIdx = commonjs.Constants.firstIdx + 1;
        this.isUpgraded = false;
        this.lastBatch = this.rollupDb.lastBatch;
        this.nLevels = nLevels;

        // compute number of proofs to build
        this.numProofs = Math.ceil((this.maxIdx - this.initIdx + 1) / this.nAccounts);
        this.proofs = [];
        this.newStateRoots = [];
        this.finalIdxs = [];
        this.imStateRoots = [];
        this.imFinalIdxs = [];

        this.dbState = new commonjs.SMTTmpDb(this.rollupDb.db);
        this.stateTree = new SMT(this.dbState, this.rollupDb.stateRoot);
    }

    /**
     * Perform upgrade for each account to new leaf state
     */
    async doUpgrade(){
        let initKeyStateTree;
        let finalKeystateTree;

        for (let i = 0; i < this.numProofs; i++){
            initKeyStateTree = this.initIdx + i*this.nAccounts;
            finalKeystateTree = this.initIdx + (i+1)*this.nAccounts;
            await this._buildSingleProof(initKeyStateTree, finalKeystateTree);
        }

        this.isUpgraded = true;
    }

    /**
     * Build single proof for upgrading accounts
     * @param {Number} initKey - first key to update
     * @param {Number} finalKey - last key to update
     */
    async _buildSingleProof(initKey, finalKey){
        const input = this._initInput();
        const imStateRoot = [];
        const imFinalIdx = [];
        this.finalIdxs.push((finalKey < this.maxIdx) ? finalKey : this.maxIdx + 1);

        input.initialIdx = initKey;
        input.maxIdx = this.maxIdx;
        input.oldStateRoot = this.stateTree.root;

        for (let i = initKey; i < finalKey; i++){
            const k = i - initKey;

            if (i <= this.maxIdx){
                // get old state
                let oldState;
                const resFind = await this.stateTree.find(i);
                if (resFind.found) {
                    const foundValueId = poseidonHash([resFind.foundValue, i]);
                    oldState = commonjsOld.stateUtils.array2State(await this.dbState.get(foundValueId));
                } else {
                    throw new Error(`Unreacheable code: key state tree ${i} does not exist`);
                }

                // set new state
                const newState = Object.assign({}, oldState);
                newState.exitBalance = 0;
                newState.accumulatedHash = 0;
                const newValue = commonjs.stateUtils.hashState(newState);

                const res = await this.stateTree.update(i, newValue);
                let siblings = res.siblings;
                while (siblings.length < this.nLevels + 1) siblings.push(Scalar.e(0));
                // fill inputs
                input.tokenID[k] = Scalar.e(oldState.tokenID);
                input.nonce[k] = Scalar.e(oldState.nonce);
                input.sign[k] = Scalar.e(oldState.sign);
                input.balance[k] = Scalar.e(oldState.balance);
                input.ay[k] = Scalar.fromString(oldState.ay, 16);
                input.ethAddr[k] = Scalar.fromString(oldState.ethAddr, 16);
                input.siblings[k] = siblings;

                imFinalIdx[k] = i+1;
                imStateRoot[k] = this.stateTree.root;

            } else {
                input.tokenID[k] = 0;
                input.nonce[k] = 0;
                input.sign[k] = 0;
                input.balance[k] = 0;
                input.ay[k] = 0;
                input.ethAddr[k] = 0;
                input.siblings[k] = [];
                for (let j = 0; j < this.nLevels + 1; j++) {
                    input.siblings[k][j] = 0;
                }

                imFinalIdx[k] = i;
                imStateRoot[k] = this.stateTree.root;
            }
        }

        this.imFinalIdxs.push(imFinalIdx);
        this.imStateRoots.push(imStateRoot);

        this.proofs.push(input);
        this.newStateRoots.push(this.stateTree.root);
    }

    /**
     * creates an empty input
     * @returns {Object} empty input
     */
    _initInput(){
        return {
            initialIdx: 0,
            maxIdx: 0,
            oldStateRoot: 0,

            tokenID: [],
            nonce: [],
            sign: [],
            balance: [],
            ay: [],
            ethAddr: [],
            siblings: []
        };
    }

    /**
     * Retrieve full proof
     * @param {Number} numProof - proof number
     * @returns {Object} proof input
     */
    getProof(numProof){
        if (!this.isUpgraded){
            throw new Error("Upgrade has not been performed");
        }

        if (numProof > this.numProofs){
            throw new Error(`Proof ${numProof} is greater than total necessary proofs, ${this.numProofs}`);
        }

        return this.proofs[numProof];
    }

    /**
     * Retrieve new state root
     * @param {Number} numProof - proof number
     * @returns {Scalar} new state root
     */
    getNewStateRoot(numProof){
        this._sanityCheck(numProof);

        return this.newStateRoots[numProof];
    }

    /**
     * Retrieve intermediates state roots
     * @param {Number} numProof - proof number
     * @returns {Scalar} intermediate states root
     */
    getImStateRoot(numProof){
        this._sanityCheck(numProof);

        return this.imStateRoots[numProof];
    }

    /**
     * Retrieve last idx updated
     * @param {Number} numProof - proof number
     * @returns {Number} last idx updated
     */
    getFinalIdxs(numProof){
        this._sanityCheck(numProof);

        return this.finalIdxs[numProof];
    }

    /**
     * Retrieve intermediate last idx updated
     * @param {Number} numProof - proof number
     * @returns {Number} intermediate last idx updated
     */
    getImFinalIdxs(numProof){
        this._sanityCheck(numProof);

        return this.imFinalIdxs[numProof];
    }

    /**
     * Retrieve output for each proof
     * @param {Number} numProof - proof number
     * @returns {Object} output proof
     */
    getOutput(numProof){
        this._sanityCheck(numProof);
        const output = {
            newStateRoot: this.getNewStateRoot(numProof),
            finalIdx: this.getFinalIdxs(numProof)
        };

        return output;
    }

    /**
     * Check rollupDb has been upgraded and proof number is valid
     * @param {Number} numProof - proof number
     */
    _sanityCheck(numProof){
        if (!this.isUpgraded){
            throw new Error("Upgrade has not been performed");
        }

        if (numProof > this.numProofs){
            throw new Error(`Proof ${numProof} is greater than total necessary proofs, ${this.numProofs}`);
        }
    }
}

module.exports = UpgradeDb;
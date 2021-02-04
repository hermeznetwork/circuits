const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;
const Scalar = require("ffjavascript").Scalar;

const { HermezAccount, txUtils, float40 } = require("@hermeznetwork/commonjs");
const random = require("./helpers/helpers").random;


describe("Test Decode Tx", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "decode-tx.test.circom");
    let circuit;

    const MAX_NLEVELS = 48;
    const NLEVELS = 32;
    const fromAcc = new HermezAccount(1);
    const toAcc = new HermezAccount(2);
    const rqAcc = new HermezAccount(3);

    before( async() => {
        const circuitCode = `
            include "../src/decode-tx.circom";
            component main = DecodeTx(${NLEVELS});
        `;

        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints: " + circuit.constraints.length + "\n");
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    it("Should check decode txCompressedData & txCompressedDataV2", async () => {
        const tx = {
            chainID: random(2**16),
            fromIdx: random(2**NLEVELS),
            toIdx: random(2**NLEVELS) || 1,
            amount: float40.round(random(2**50)),
            tokenID: random(2**32),
            nonce: random(2**40),
            userFee: random(2**8),
            toBjjSign: random(1)
        };

        const input = {
            previousOnChain: 1,
            txCompressedData: txUtils.buildTxCompressedData(tx).toString(),
            amountF: float40.fix2Float(tx.amount),
            toEthAddr: 0,
            toBjjAy: 0,
            rqTxCompressedDataV2: 0,
            rqToEthAddr: 0,
            rqToBjjAy: 0,
            fromEthAddr: 0,
            fromBjjCompressed: Array(256).fill(0),
            loadAmountF: 0,
            globalChainID: tx.chainID,
            onChain: 0,
            newAccount: 0,
            auxFromIdx: 0,
            auxToIdx: 0,
            inIdx: 0,
            maxNumBatch: 0,
            currentNumBatch: 0
        };

        let w = await circuit.calculateWitness(input, {logOutput: false});

        const txCompressedDataV2Js = txUtils.buildTxCompressedDataV2(tx);

        const checkOut = {
            fromIdx: tx.fromIdx,
            toIdx: tx.toIdx,
            amount: tx.amount,
            tokenID: tx.tokenID,
            nonce: tx.nonce,
            userFee: tx.userFee,
            toBjjSign: tx.toBjjSign,
            txCompressedDataV2: txCompressedDataV2Js
        };

        await circuit.assertOut(w, checkOut);

        // Check txCompressedDataV2 is 0 when onChain
        input.previousOnChain = 1;
        input.onChain = 1;
        checkOut.txCompressedDataV2 = Scalar.e(0);

        w = await circuit.calculateWitness(input, {logOutput: false});
        await circuit.assertOut(w, checkOut);
    });

    it("Should check signature off-chain", async () => {
        const tx = {
            chainID: random(2**16),
            fromIdx: random(2**NLEVELS),
            toIdx: random(2**NLEVELS),
            amount: float40.round(random(2**50)),
            tokenID: random(2**32),
            nonce: random(2**40),
            userFee: random(2**8),
            toBjjSign: random(1),
            // fields L2 signature
            toEthAddr: toAcc.ethAddr,
            toBjjAy: toAcc.ay,
            rqTxCompressedDataV2: Scalar.e("0123456789"),
            rqToEthAddr: rqAcc.ethAddr,
            rqToBjjAy: rqAcc.ay,
            maxNumBatch: 20,
        };

        fromAcc.signTx(tx);

        const input = {
            previousOnChain: 1,
            txCompressedData: txUtils.buildTxCompressedData(tx).toString(),
            amountF: float40.fix2Float(tx.amount),
            toEthAddr: Scalar.fromString(tx.toEthAddr, 16),
            toBjjAy: Scalar.fromString(tx.toBjjAy, 16),
            rqTxCompressedDataV2: tx.rqTxCompressedDataV2,
            rqToEthAddr: Scalar.fromString(tx.rqToEthAddr, 16),
            rqToBjjAy: Scalar.fromString(tx.rqToBjjAy, 16),
            fromEthAddr: 0,
            fromBjjCompressed: Array(256).fill(0),
            loadAmountF: 0,
            globalChainID: tx.chainID,
            onChain: 0,
            newAccount: 0,
            auxFromIdx: 0,
            auxToIdx: 0,
            inIdx: 0,
            maxNumBatch: tx.maxNumBatch,
            currentNumBatch: tx.maxNumBatch - 1
        };

        const w = await circuit.calculateWitness(input, {logOutput: false});

        const checkOut = {
            sigL2Hash: txUtils.buildHashSig(tx),
        };

        await circuit.assertOut(w, checkOut);
    });

    it("Should check L2 Vs L1 ordering. Error when L2 to L1.", async () => {
        /*
            Previous    Current     Allowed
            -------------------------------
            L2          L2          true
            L2          L1          false
            L1          L2          true
            L2          L2          true
        */

        const input = {
            previousOnChain: 0,
            txCompressedData: txUtils.buildTxCompressedData({fromIdx: 1}).toString(),
            amountF: 0,
            toEthAddr: 0,
            toBjjAy: 0,
            rqTxCompressedDataV2: 0,
            rqToEthAddr: 0,
            rqToBjjAy: 0,
            fromEthAddr: 0,
            fromBjjCompressed: Array(256).fill(0),
            loadAmountF: 0,
            globalChainID: 0,
            onChain: 0,
            newAccount: 0,
            auxFromIdx: 0,
            auxToIdx: 0,
            inIdx: 0,
            maxNumBatch: 3,
            currentNumBatch: 3
        };

        // L2 --> L2
        await circuit.calculateWitness(input, {logOutput: false});

        // L2 --> L1
        input.previousOnChain = 0;
        input.onChain = 1;
        try {
            await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
            expect(true).to.be.equal(false);
        } catch (error) {
            expect(error.message.includes("Constraint doesn't match"))
                .equal(true);
        }

        // on-chain --> off-chain
        input.previousOnChain = 1;
        input.onChain = 0;
        await circuit.calculateWitness(input, {logOutput: false});

        // on-chain --> on-chain
        input.previousOnChain = 1;
        input.onChain = 1;
        await circuit.calculateWitness(input, {logOutput: false});
    });

    it("Should check incremental Idx and newAccount. Error when not matching", async () => {
        const input = {
            previousOnChain: 1,
            txCompressedData: txUtils.buildTxCompressedData({}).toString(),
            amountF: 0,
            toEthAddr: 0,
            toBjjAy: 0,
            rqTxCompressedDataV2: 0,
            rqToEthAddr: 0,
            rqToBjjAy: 0,
            fromEthAddr: 0,
            fromBjjCompressed: Array(256).fill(0),
            loadAmountF: 0,
            globalChainID: 0,
            onChain: 1,
            newAccount: 1,
            auxFromIdx: 3,
            auxToIdx: 0,
            inIdx: 2,
            maxNumBatch: 0,
            currentNumBatch: 6
        };

        // correct incremental
        let w = await circuit.calculateWitness(input, {logOutput: false});

        let checkOut = {
            outIdx: input.inIdx + 1,
        };

        await circuit.assertOut(w, checkOut);

        // incorrect incremental
        input.inIdx = 5;
        try {
            await circuit.calculateWitness(input, {logOutput: false});
            expect(true).to.be.equal(false);
        } catch(error){
            expect(error.message.includes("Constraint doesn't match"))
                .equal(true);
        }

        // incorrect newAccount
        input.onChain = 1;
        input.newAccount = 0;
        try {
            await circuit.calculateWitness(input, {logOutput: false});
            expect(true).to.be.equal(false);
        } catch(error){
            expect(error.message.includes("Constraint doesn't match"))
                .equal(true);
        }

        // correct incremental
        input.onChain = 0;
        input.newAccount = 0;
        input.previousOnChain = 1;
        w = await circuit.calculateWitness(input, {logOutput: false});
        checkOut.outIdx = input.inIdx;

        await circuit.assertOut(w, checkOut);
    });

    it("Should check L1L2TxData", async () => {

        const indexBits = (NLEVELS/8) * 8;
        const amountBits = 40;
        const feeBits = 8;

        const totalBits = (indexBits * 2) + amountBits + feeBits;

        const tx = {
            chainID: 0,
            fromIdx: random(2**NLEVELS),
            toIdx: random(2**NLEVELS) || 1,
            amount: float40.round(random(2**50)),
            tokenID: 0,
            nonce: 0,
            userFee: random(2**8),
            toBjjSign: 0
        };

        const input = {
            previousOnChain: 0,
            txCompressedData: txUtils.buildTxCompressedData(tx).toString(),
            amountF: float40.fix2Float(tx.amount),
            toEthAddr: 0,
            toBjjAy: 0,
            rqTxCompressedDataV2: 0,
            rqToEthAddr: 0,
            rqToBjjAy: 0,
            fromEthAddr: 0,
            fromBjjCompressed: Array(256).fill(0),
            loadAmountF: 0,
            globalChainID: 0,
            onChain: 0,
            newAccount: 0,
            auxFromIdx: 0,
            auxToIdx: 0,
            inIdx: 0,
            maxNumBatch: 0,
            currentNumBatch: 0
        };

        // L2 tx
        let w = await circuit.calculateWitness(input, {logOutput: false});

        let tmp = txUtils.encodeL2Tx(tx, NLEVELS);
        let res = Scalar.fromString(tmp, 16);
        let resBits = Scalar.bits(res).reverse();
        while(resBits.length < totalBits){
            resBits.unshift(0);
        }

        let checkOut = {
            L1L2TxData: resBits,
        };

        await circuit.assertOut(w, checkOut);

        // L2 tx with toIdx == 0
        tx.toIdx = 0;
        tx.auxToIdx = random(2**NLEVELS) || 1;
        input.txCompressedData = txUtils.buildTxCompressedData(tx).toString();
        input.auxToIdx = tx.auxToIdx;

        w = await circuit.calculateWitness(input, {logOutput: false});

        tmp = txUtils.encodeL2Tx(tx, NLEVELS);
        res = Scalar.fromString(tmp, 16);
        resBits = Scalar.bits(res).reverse();
        while(resBits.length < totalBits){
            resBits.unshift(0);
        }

        checkOut = {
            L1L2TxData: resBits,
        };

        await circuit.assertOut(w, checkOut);

        // L1 tx
        input.previousOnChain = 1;
        input.onChain = 1;
        w = await circuit.calculateWitness(input, {logOutput: false});

        tx.effectiveAmount = tx.amount;
        const tmpL1 = txUtils.encodeL1Tx(tx, NLEVELS);
        const resL1 = Scalar.fromString(tmpL1, 16);
        let resL1Bits = Scalar.bits(resL1).reverse();
        while(resL1Bits.length < totalBits){
            resL1Bits.unshift(0);
        }

        checkOut = {
            L1L2TxData: resL1Bits,
        };

        await circuit.assertOut(w, checkOut);
    });

    it("Should check L1TxFullData", async () => {
        const fromEthAddrB = 160;
        const fromBjjCompressedB = 256;
        const idxB = MAX_NLEVELS;
        const f40B = 40;
        const tokenIDB = 32;

        const totalBits = fromEthAddrB + fromBjjCompressedB + 2*idxB + tokenIDB + 2*f40B;

        const tx = {
            chainID: 0,
            fromIdx: 1,
            toIdx: 2,
            amount: float40.round(3),
            tokenID: 5,
            nonce: 0,
            userFee: 0,
            toBjjSign: 0,
            loadAmountF: 6,
            fromBjjCompressed: fromAcc.bjjCompressed,
            fromEthAddr: fromAcc.ethAddr
        };

        tx.amountF = float40.fix2Float(tx.amount);

        const input = {
            previousOnChain: 1,
            txCompressedData: txUtils.buildTxCompressedData(tx).toString(),
            amountF: float40.fix2Float(tx.amount),
            toEthAddr: 0,
            toBjjAy: 0,
            rqTxCompressedDataV2: 0,
            rqToEthAddr: 0,
            rqToBjjAy: 0,
            fromEthAddr: Scalar.fromString(tx.fromEthAddr, 16),
            fromBjjCompressed: Array(256).fill(0), // temporary
            loadAmountF: tx.loadAmountF,
            globalChainID: 0,
            onChain: 1,
            newAccount: 0,
            auxFromIdx: 0,
            auxToIdx: 0,
            inIdx: 0,
            maxNumBatch: 5,
            currentNumBatch: 5
        };

        // Add BjjCompressed Bits
        const bjjCompressed = Scalar.fromString(tx.fromBjjCompressed, 16);
        const bjjCompressedBits = Scalar.bits(bjjCompressed);
        input.fromBjjCompressed = bjjCompressedBits;
        while (bjjCompressedBits.length < 256) bjjCompressedBits.push(0);

        // L1 tx
        let w = await circuit.calculateWitness(input, {logOutput: false});

        const tmp = txUtils.encodeL1TxFull(tx, NLEVELS);
        const res = Scalar.fromString(tmp, 16);
        let resBits = Scalar.bits(res).reverse();
        while(resBits.length < totalBits){
            resBits.unshift(0);
        }

        let checkOut = {
            L1TxFullData: resBits,
        };

        await circuit.assertOut(w, checkOut);

        // L2 tx
        input.onChain = 0;
        w = await circuit.calculateWitness(input, {logOutput: false});

        const bitsL2 = Array(totalBits).fill(0);

        checkOut = {
            L1TxFullData: bitsL2,
        };

        await circuit.assertOut(w, checkOut);
    });

    it("Should check maxNumBatch Vs currentNumBatch", async () => {
        const input = {
            previousOnChain: 0,
            txCompressedData: txUtils.buildTxCompressedData({fromIdx: 1}).toString(),
            amountF: 0,
            toEthAddr: 0,
            toBjjAy: 0,
            rqTxCompressedDataV2: 0,
            rqToEthAddr: 0,
            rqToBjjAy: 0,
            fromEthAddr: 0,
            fromBjjCompressed: Array(256).fill(0),
            loadAmountF: 0,
            globalChainID: 0,
            onChain: 0,
            newAccount: 0,
            auxFromIdx: 0,
            auxToIdx: 0,
            inIdx: 0,
            maxNumBatch: 42,
            currentNumBatch: 30
        };

        // maxNumBatch > currentNumBatch
        await circuit.calculateWitness(input, {logOutput: false});

        // maxNumBatch = currentNumBatch
        input.currentNumBatch = 42;
        await circuit.calculateWitness(input, {logOutput: false});

        // maxNumBatch < currentNumBatch
        input.currentNumBatch = 43;
        try {
            await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});
            expect(true).to.be.equal(false);
        } catch (error) {
            expect(error.message.includes("Constraint doesn't match"))
                .equal(true);
        }

        // (maxNumBatch < currentNumBatch) & maxNumBatch != 0
        input.maxNumBatch = 0;
        await circuit.calculateWitness(input, {logOutput: false});
    });
});

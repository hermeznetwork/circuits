const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const tester = require("circom").tester;
const Scalar = require("ffjavascript").Scalar;

const { computeFee } = require("@hermeznetwork/commonjs").feeTable;

describe("Test balance-updater", function () {
    this.timeout(0);
    let circuitPath = path.join(__dirname, "balance-updater.test.circom");
    let circuit;

    before( async() => {
        const circuitCode = `
            include "../src/balance-updater.circom";
            component main = BalanceUpdater();
        `;

        fs.writeFileSync(circuitPath, circuitCode, "utf8");

        circuit = await tester(circuitPath, {reduceConstraints:false});
        await circuit.loadConstraints();
        console.log("Constraints: " + circuit.constraints.length + "\n");
    });

    after( async() => {
        fs.unlinkSync(circuitPath);
    });

    it("Should check a standard L2 transaction", async () => {
        const input = {
            oldBalanceSender: 100,
            oldBalanceReceiver: 200,
            oldExitBalanceReceiver: 100,
            amount: 50,
            loadAmount: 0,
            feeSelector: 126,
            onChain: 0,
            nop: 0,
            isExit: 0,
            nullifyLoadAmount: 0,
            nullifyAmount: 0,
        };

        const w = await circuit.calculateWitness(input, {logTrigger:false, logOutput: false, logSet: false});

        const feeApplied = computeFee(input.amount, input.feeSelector);

        const output = {
            newBalanceSender: Scalar.sub(Scalar.sub(input.oldBalanceSender, input.amount), feeApplied),
            newBalanceReceiver: Scalar.add(input.oldBalanceReceiver, input.amount),
            newExitBalanceReceiver: Scalar.e(input.oldExitBalanceReceiver),
            fee2Charge: feeApplied,
            isAmountNullified: 0,
        };

        await circuit.assertOut(w, output);
    });

    it("Should check a standard L1 transaction", async () => {
        const input = {
            oldBalanceSender: 100,
            oldBalanceReceiver: 200,
            oldExitBalanceReceiver: 100,
            amount: 0,
            loadAmount: 50,
            feeSelector: 200,
            onChain: 1,
            nop: 0,
            isExit: 0,
            nullifyLoadAmount: 0,
            nullifyAmount: 0,
        };

        const w = await circuit.calculateWitness(input, {logOutput: false});

        const feeApplied = Scalar.e(0);

        const output = {
            newBalanceSender: Scalar.add(input.oldBalanceSender, input.loadAmount),
            newBalanceReceiver: Scalar.e(input.oldBalanceReceiver),
            newExitBalanceReceiver: Scalar.e(input.oldExitBalanceReceiver),
            fee2Charge: feeApplied,
            isAmountNullified: 0,
        };

        await circuit.assertOut(w, output);
    });

    it("Should check an exit L1 transaction", async () => {
        const input = {
            oldBalanceSender: 100,
            oldBalanceReceiver: 200,
            oldExitBalanceReceiver: 100,
            amount: 10,
            loadAmount: 50,
            feeSelector: 200,
            onChain: 1,
            nop: 0,
            isExit: 1,
            nullifyLoadAmount: 0,
            nullifyAmount: 0,
        };

        const w = await circuit.calculateWitness(input, {logOutput: false});

        const feeApplied = Scalar.e(0);

        const output = {
            newBalanceSender: Scalar.sub(Scalar.add(input.oldBalanceSender, input.loadAmount), input.amount),
            newBalanceReceiver: Scalar.e(input.oldBalanceReceiver),
            newExitBalanceReceiver: Scalar.add(input.oldExitBalanceReceiver, input.amount),
            fee2Charge: feeApplied,
            isAmountNullified: 0,
        };

        await circuit.assertOut(w, output);
    });

    it("Should check an exit L2 transaction", async () => {
        const input = {
            oldBalanceSender: 100,
            oldBalanceReceiver: 200,
            oldExitBalanceReceiver: 50,
            amount: 60,
            loadAmount: 0,
            feeSelector: 126,
            onChain: 0,
            nop: 0,
            isExit: 1,
            nullifyLoadAmount: 0,
            nullifyAmount: 0,
        };

        const w = await circuit.calculateWitness(input, {logOutput: false});

        const feeApplied = computeFee(input.amount, input.feeSelector);

        const output = {
            newBalanceSender: Scalar.sub(Scalar.sub(input.oldBalanceSender, input.amount), feeApplied),
            newBalanceReceiver: Scalar.e(input.oldBalanceReceiver),
            newExitBalanceReceiver: Scalar.add(input.oldExitBalanceReceiver, input.amount),
            fee2Charge: feeApplied,
            isAmountNullified: 0,
        };

        await circuit.assertOut(w, output);
    });

    it("Should check nullify load amount L1 transaction", async () => {
        const input = {
            oldBalanceSender: 100,
            oldBalanceReceiver: 200,
            oldExitBalanceReceiver: 50,
            amount: 50,
            loadAmount: 50,
            feeSelector: 200,
            onChain: 1,
            nop: 0,
            isExit: 0,
            nullifyLoadAmount: 1,
            nullifyAmount: 0,
        };

        const w = await circuit.calculateWitness(input, {logOutput: false});

        const feeApplied = Scalar.e(0);

        const output = {
            newBalanceSender: Scalar.sub(input.oldBalanceSender, input.amount),
            newBalanceReceiver: Scalar.add(input.oldBalanceReceiver, input.amount),
            newExitBalanceReceiver: Scalar.e(input.oldExitBalanceReceiver),
            fee2Charge: feeApplied,
            isAmountNullified: 0,
        };

        await circuit.assertOut(w, output);
    });

    it("Should check nullify amount L1 transaction", async () => {
        const input = {
            oldBalanceSender: 100,
            oldBalanceReceiver: 200,
            oldExitBalanceReceiver: 100,
            amount: 500,
            loadAmount: 50,
            feeSelector: 200,
            onChain: 1,
            nop: 0,
            isExit: 0,
            nullifyLoadAmount: 0,
            nullifyAmount: 1,
        };

        const w = await circuit.calculateWitness(input, {logOutput: false});

        const feeApplied = Scalar.e(0);

        const output = {
            newBalanceSender: Scalar.add(input.oldBalanceSender, input.loadAmount),
            newBalanceReceiver: input.oldBalanceReceiver,
            newExitBalanceReceiver: Scalar.e(input.oldExitBalanceReceiver),
            fee2Charge: feeApplied,
            isAmountNullified: 1,
        };

        await circuit.assertOut(w, output);
    });

    it("Should check underflow on L1 tx", async () => {
        const input = {
            oldBalanceSender: 100,
            oldBalanceReceiver: 200,
            oldExitBalanceReceiver: 50,
            amount: 110,
            loadAmount: 0,
            feeSelector: 200,
            onChain: 1,
            nop: 0,
            isExit: 0,
            nullifyLoadAmount: 0,
            nullifyAmount: 0,
        };

        const w = await circuit.calculateWitness(input, {logOutput: false});

        const feeApplied = Scalar.e(0);

        const output = {
            newBalanceSender: Scalar.e(input.oldBalanceSender),
            newBalanceReceiver: Scalar.e(input.oldBalanceReceiver),
            newExitBalanceReceiver: Scalar.e(input.oldExitBalanceReceiver),
            fee2Charge: feeApplied,
            isAmountNullified: 1,
        };

        await circuit.assertOut(w, output);
    });

    it("Should check underflow error on L2 tx", async () => {
        const input = {
            oldBalanceSender: 100,
            oldBalanceReceiver: 200,
            oldExitBalanceReceiver: 100,
            amount: 98,
            loadAmount: 0,
            feeSelector: 200,
            onChain: 0,
            nop: 0,
            isExit: 0,
            nullifyLoadAmount: 0,
            nullifyAmount: 0,
        };

        try {
            await circuit.calculateWitness(input, {logOutput: false});
            expect(true).to.be.equal(false);
        } catch (err) {
            expect(err.message.includes("Constraint doesn't match 1 != 0")).to.be.equal(true);
        }
    });

    it("Should check overflow L1 - L2 tx", async () => {
        // Note:
        // - Smart contract filters deposits above 2^128 bits
        // - Circuit reserves 192 bits length for accounts balance
        // - Therefore, 192 - 128 = 64 --> meaning that 2^64 transactions has to be done to get overflow
        // - It is assumed overflow is not feasible
    });
});
const chai = require("chai");
const assert = chai.assert;

const fs = require("fs");
const path = require("path");

const utils = require("../../src/utils");
const loadR1cs = require("r1csfile").load;
const ZqField = require("ffjavascript").ZqField;
const fastFile = require("fastfile");
// const loadSym = require("../../../snarkjs/src/loadsyms");

const WitnessCalculatorBuilder = require("circom_runtime").WitnessCalculatorBuilder;

module.exports = wasm_tester;

async function  wasm_tester(pathCircom, circomFile) {
    const baseName = path.basename(circomFile, ".circom");

    const wasm = await fs.promises.readFile(path.join(pathCircom, baseName + ".wasm"));

    const witnessOptions = await optionsWitness(path.join(pathCircom, baseName + ".sym"));
    const wc = await WitnessCalculatorBuilder(wasm, witnessOptions);

    return new WasmTester(pathCircom, baseName, wc);
}

class WasmTester {

    constructor(path, baseName, witnessCalculator) {
        this.path = path;
        this.baseName = baseName;
        this.witnessCalculator = witnessCalculator;
    }

    async calculateWitness(input, sanityCheck) {
        const self = this;
        if (!self.symbols) await self.loadSymbols();
        return await this.witnessCalculator.calculateWitness(input, sanityCheck, this.symbols);
    }

    async loadSymbols() {
        if (this.symbols) return;
        this.symbols = {};
        const symsStr = await fs.promises.readFile(
            path.join(this.path, this.baseName + ".sym"),
            "utf8"
        );
        const lines = symsStr.split("\n");
        for (let i=0; i<lines.length; i++) {
            const arr = lines[i].split(",");
            if (arr.length!=4) continue;
            this.symbols[arr[3]] = {
                labelIdx: Number(arr[0]),
                varIdx: Number(arr[1]),
                componentIdx: Number(arr[2]),
            };
        }
    }

    async loadConstraints() {
        const self = this;
        if (this.constraints) return;
        const r1cs = await loadR1cs(path.join(this.path, this.baseName + ".r1cs"),true, false);
        self.F = new ZqField(r1cs.prime);
        self.nVars = r1cs.nVars;
        self.constraints = r1cs.constraints;
    }

    async assertOut(actualOut, expectedOut) {
        const self = this;
        if (!self.symbols) await self.loadSymbols();

        checkObject("main", expectedOut);

        function checkObject(prefix, eOut) {

            if (Array.isArray(eOut)) {
                for (let i=0; i<eOut.length; i++) {
                    checkObject(prefix + "["+i+"]", eOut[i]);
                }
            } else if ((typeof eOut == "object")&&(eOut.constructor.name == "Object")) {
                for (let k in eOut) {
                    checkObject(prefix + "."+k, eOut[k]);
                }
            } else {
                if (typeof self.symbols[prefix] == "undefined") {
                    assert(false, "Output variable not defined: "+ prefix);
                }
                const ba = actualOut[self.symbols[prefix].varIdx].toString();
                const be = eOut.toString();
                assert.strictEqual(ba, be, prefix);
            }
        }
    }

    async getSignal(witness, signalName){
        const self = this;
        if (!self.symbols) await self.loadSymbols();

        if (typeof self.symbols[signalName] == "undefined") {
            assert(false, "Output variable not defined: "+ signalName);
        }
        return witness[self.symbols[signalName].varIdx];
    }

    async getDecoratedOutput(witness) {
        const self = this;
        const lines = [];
        if (!self.symbols) await self.loadSymbols();
        for (let n in self.symbols) {
            let v;
            if (utils.isDefined(witness[self.symbols[n].varIdx])) {
                v = witness[self.symbols[n].varIdx].toString();
            } else {
                v = "undefined";
            }
            lines.push(`${n} --> ${v}`);
        }
        return lines.join("\n");
    }

    async checkConstraints(witness) {
        const self = this;
        if (!self.constraints) await self.loadConstraints();
        for (let i=0; i<self.constraints.length; i++) {
            checkConstraint(self.constraints[i]);
        }

        function checkConstraint(constraint) {
            const F = self.F;
            const a = evalLC(constraint[0]);
            const b = evalLC(constraint[1]);
            const c = evalLC(constraint[2]);

            assert (F.isZero(F.sub(F.mul(a,b), c)), "Constraint doesn't match");
        }

        function evalLC(lc) {
            const F = self.F;
            let v = F.zero;
            for (let w in lc) {
                v = F.add(
                    v,
                    F.mul( lc[w], witness[w] )
                );
            }
            return v;
        }
    }
}

async function loadSyms(symFileName){
    const sym = {
        labelIdx2Name: [ "one" ],
        varIdx2Name: [ "one" ],
        componentIdx2Name: []
    };
    const fd = await fastFile.readExisting(symFileName);
    const buff = await fd.read(fd.totalSize);
    const symsStr = new TextDecoder("utf-8").decode(buff);
    const lines = symsStr.split("\n");
    for (let i=0; i<lines.length; i++) {
        const arr = lines[i].split(",");
        if (arr.length!=4) continue;
        if (sym.varIdx2Name[arr[1]]) {
            sym.varIdx2Name[arr[1]] += "|" + arr[3];
        } else {
            sym.varIdx2Name[arr[1]] = arr[3];
        }
        sym.labelIdx2Name[arr[0]] = arr[3];
        if (!sym.componentIdx2Name[arr[2]]) {
            sym.componentIdx2Name[arr[2]] = extractComponent(arr[3]);
        }
    }

    await fd.close();

    return sym;

    function extractComponent(name) {
        const arr = name.split(".");
        arr.pop(); // Remove the lasr element
        return arr.join(".");
    }
}

async function optionsWitness(symFileName){
    const options = {
        set: false,
        get: false,
        trigger: false,
    }
    
    
    let wcOps = {
        sanityCheck: true
    };
    let sym = await loadSyms(symFileName);
    
    if (options.set) {
        if (!sym) sym = await loadSyms(symFileName);
        wcOps.logSetSignal= function(labelIdx, value) {
            console.log("SET " + sym.labelIdx2Name[labelIdx] + " <-- " + value.toString());
        };
    }

    if (options.get) {
        if (!sym) sym = await loadSyms(symFileName);
        wcOps.logGetSignal= function(varIdx, value) {
            console.log("GET " + sym.labelIdx2Name[varIdx] + " --> " + value.toString());
        };
    }

    if (options.trigger) {
        if (!sym) sym = await loadSyms(symFileName);
        wcOps.logStartComponent= function(cIdx) {
            console.log("START: " + sym.componentIdx2Name[cIdx]);
        };
        wcOps.logFinishComponent= function(cIdx) {
            console.log("FINISH: " + sym.componentIdx2Name[cIdx]);
       };
    }
    
    return wcOps;
}

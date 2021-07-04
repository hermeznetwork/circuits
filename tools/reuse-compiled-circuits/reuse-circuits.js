const fs = require("fs");
const path = require("path");

async function main(){
    const pathCircom = path.join(__dirname, "../../node_modules/circom");

    const pathIndex = path.join(__dirname, "./files/index.js");
    const pathTester = path.join(__dirname, "./files/tester.js");
    const pathTesterAux = path.join(__dirname, "./files/tester-aux.js");

    if (!fs.existsSync(pathCircom)){
        console.log("Circom path does not exit. Install dependencies with `npm run setup`");
        process.exit(1);
    }

    fs.copyFileSync(pathIndex, path.join(pathCircom, "./index.js"));
    fs.copyFileSync(pathTester, path.join(pathCircom, "./ports/wasm/tester.js"));
    fs.copyFileSync(pathTesterAux, path.join(pathCircom, "./ports/wasm/tester-aux.js"));
}

main();
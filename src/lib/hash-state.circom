include "../../node_modules/circomlib/circuits/poseidon.circom";

/**
 * Computes the hash of an account state
 */
template HashState() {
    signal input tokenID;
    signal input nonce;
    signal input sign;
    signal input balance;
    signal input ay;
    signal input ethAddr;

    signal output out;

    signal e0;
    e0 <== tokenID + nonce * (1 << 32) + sign * (1 << 72);

    component hash = Poseidon(4);

    hash.inputs[0] <== e0;
    hash.inputs[1] <== balance;
    hash.inputs[2] <== ay;
    hash.inputs[3] <== ethAddr;

    hash.out ==> out;
}

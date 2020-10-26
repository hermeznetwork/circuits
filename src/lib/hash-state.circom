include "../../node_modules/circomlib/circuits/poseidon.circom";

/**
 * Computes the hash of an account state
 * State Hash = Poseidon(e0, e1, e2, e3)
 * e0: sign(1 bit) | nonce(40bits) | tokenID(32 bits)
 * e1: balance
 * e2: ay
 * e3: ethAddr
 * @input tokenID - {Uint32} - token identifier
 * @input nonce - {Uint40} - nonce
 * @input sign - {Bool} - babyjubjub sign
 * @input balance - {Uint192} - account balance
 * @input ay - {Field} - babyjubjub Y coordinate
 * @input ethAddr - {Uint160} - etehreum address
 * @output out - {Field} - resulting poseidon hash
 */
template HashState() {
    signal input tokenID;
    signal input nonce;
    signal input sign;
    signal input balance;
    signal input ay;
    signal input ethAddr;

    signal output out;

    signal e0; // build e0 element

    e0 <== tokenID + nonce * (1 << 32) + sign * (1 << 72);

    component hash = Poseidon(4);

    hash.inputs[0] <== e0;
    hash.inputs[1] <== balance;
    hash.inputs[2] <== ay;
    hash.inputs[3] <== ethAddr;

    hash.out ==> out;
}

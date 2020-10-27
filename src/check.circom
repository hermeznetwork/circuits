include "../node_modules/circomlib/circuits/bitify.circom";

template Check(){
    signal input in1;
    signal input in2;

    var numBits = 301;

    signal output outBits[numBits];

    component n2bFee = Num2Bits(numBits);
    n2bFee.in <== in1 * in2;

    log(n2bFee.in);

    var i;

    for(i = 0; i < numBits; i++){
        outBits[i] <== n2bFee.out[i];
    }
}
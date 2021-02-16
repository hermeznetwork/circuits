include "../../node_modules/circomlib/circuits/bitify.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";

/**
 * Convert float40 bits to large integer
 * large integer = mantissa * 10^exponent
 * [  exponent  |  mantissa  ]
 * [   5 bits   |   35 bits  ]
 * @input in[40] - {Array[Bool]} - float40 number encoded as binary array
 * @output out - {Field} - large integer
 */
template DecodeFloatBin() {
    signal input in[40];
    signal output out;

    signal m[35];   // Mantisa bits
    signal e[5];    // Exponent bits

    signal pe[5];   // Intermediary steps for multiplying the exponents
    signal scale10; // 10^exp

    var i;
    var lcm;

    // Mapping
    for (i = 0; i < 35; i++) m[i] <== in[i];
    for (i = 0; i < 5; i++) e[i] <== in[i+35];

    pe[0] <== (9 * e[0]) + 1;
    for (i = 1; i < 5; i++) {
        pe[i] <== (pe[i-1] * (10**(2**i)) - pe[i-1]) * e[i] + pe[i-1];
    }

    scale10 <== pe[4];

    lcm = 0;
    var e2 = 1;
    for (i = 0; i < 35; i++) {
        lcm += e2 * m[i];
        e2 = e2 + e2;
    }

    out <== lcm * scale10;
}

/**
 * Decode float40 to large integer
 * @input in - {Field} - float40 encode representation
 * @output out - {Field} - large integer
 */
template DecodeFloat() {
    signal input in;
    signal output out;

    component n2b = Num2Bits(40);
    component decoder = DecodeFloatBin();

    n2b.in <== in;

    for (var i=0; i<40; i++) {
        decoder.in[i] <== n2b.out[i];
    }

    decoder.out ==> out;
}

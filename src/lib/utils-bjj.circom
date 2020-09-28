include "../../node_modules/circomlib/circuits/bitify.circom";
include "../../node_modules/circomlib/circuits/pointbits.circom";

/**
 * Retrieve babyjubjub y coordinate and babyjubjub sign
 * from babyjubjub compressed bits
 */
template BitsCompressed2AySign(){
    signal input bjjCompressed[256];

    signal output ay;
    signal output sign;

    component b2nAy = Bits2Num(254);

    var i;

    for (i = 0; i < 254; i++) {
        b2nAy.in[i] <== bjjCompressed[i];
    }

    ay <== b2nAy.out;
    sign <== bjjCompressed[255];
}

/**
 * Retrieve babyjubjub x coordinate from y coordinate and sign
 */
template AySign2Ax(){
    signal input ay;
    signal input sign;

    signal output ax;

    component n2bAy = Num2Bits(254);
    n2bAy.in <== ay;

    component b2Point = Bits2Point_Strict();

    var i;

    for (i = 0; i < 254; i++) {
        b2Point.in[i] <== n2bAy.out[i];
    }

    b2Point.in[254] <== 0;
    b2Point.in[255] <== sign;

    b2Point.out[0] ==> ax;
}
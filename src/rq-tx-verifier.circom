include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/mux3.circom";

/**
 * Check past and future data transactions to match the required data signed
 * One transaction is linked to another by this relative index meaning that a transaction can only be processed
 * if the linked transaction is processed too
 * @input futureTxCompressedDataV2[3] - {Array[Uint192]} - future transactions txCompressedDataV2
 * @input pastTxCompressedDataV2[4] - {Array[Uint192]} - past transactions txCompressedDataV2
 * @input futureToEthAddr[3] -	{Array[Uint160]} - future transactions toEthAddr
 * @input pastToEthAddr[4] - {Array[Uint160]} - past transactions toEthAddr
 * @input futureToBjjAy[3]	- {Array[Field]} - future transactions toBjjAy
 * @input pastToBjjAy[4] - {Array[Field]} - past transactions toBjjAy
 * @input rqTxCompressedDataV2 -  - requested encode transaction fields together version 2
 * @input rqToEthAddr - {Uint160} - requested ethereum address receiver
 * @input rqToBjjAy - {Field} - requested babyjubjub y coordinate
 * @input rqTxOffset - {Uint3} - relative linked transaction
 */
template RqTxVerifier() {
    signal input futureTxCompressedDataV2[3];
    signal input pastTxCompressedDataV2[4];

    signal input futureToEthAddr[3];
    signal input pastToEthAddr[4];

    signal input futureToBjjAy[3];
    signal input pastToBjjAy[4];

    signal input rqTxCompressedDataV2;
    signal input rqToEthAddr;
    signal input rqToBjjAy;

    signal input rqTxOffset;

    // fill muxTxCompressedDataV2
    component muxTxCompressedDataV2 = Mux3();

    muxTxCompressedDataV2.c[0] <== 0;
    muxTxCompressedDataV2.c[1] <== futureTxCompressedDataV2[0];
    muxTxCompressedDataV2.c[2] <== futureTxCompressedDataV2[1];
    muxTxCompressedDataV2.c[3] <== futureTxCompressedDataV2[2];
    muxTxCompressedDataV2.c[4] <== pastTxCompressedDataV2[3];
    muxTxCompressedDataV2.c[5] <== pastTxCompressedDataV2[2];
    muxTxCompressedDataV2.c[6] <== pastTxCompressedDataV2[1];
    muxTxCompressedDataV2.c[7] <== pastTxCompressedDataV2[0];

    // fill muxToEthAddr
    component muxToEthAddr = Mux3();

    muxToEthAddr.c[0] <== 0;
    muxToEthAddr.c[1] <== futureToEthAddr[0];
    muxToEthAddr.c[2] <== futureToEthAddr[1];
    muxToEthAddr.c[3] <== futureToEthAddr[2];
    muxToEthAddr.c[4] <== pastToEthAddr[3];
    muxToEthAddr.c[5] <== pastToEthAddr[2];
    muxToEthAddr.c[6] <== pastToEthAddr[1];
    muxToEthAddr.c[7] <== pastToEthAddr[0];

    // fill muxToBjjAy
    component muxToBjjAy = Mux3();

    muxToBjjAy.c[0] <== 0;
    muxToBjjAy.c[1] <== futureToBjjAy[0];
    muxToBjjAy.c[2] <== futureToBjjAy[1];
    muxToBjjAy.c[3] <== futureToBjjAy[2];
    muxToBjjAy.c[4] <== pastToBjjAy[3];
    muxToBjjAy.c[5] <== pastToBjjAy[2];
    muxToBjjAy.c[6] <== pastToBjjAy[1];
    muxToBjjAy.c[7] <== pastToBjjAy[0];

    // get bits rqTxOffset
    component n2b = Num2Bits(3);
    n2b.in <== rqTxOffset;

    // select muxTxCompressedDataV2
    n2b.out[0] ==> muxTxCompressedDataV2.s[0];
    n2b.out[1] ==> muxTxCompressedDataV2.s[1];
    n2b.out[2] ==> muxTxCompressedDataV2.s[2];

    // select muxToEthAddr
    n2b.out[0] ==> muxToEthAddr.s[0];
    n2b.out[1] ==> muxToEthAddr.s[1];
    n2b.out[2] ==> muxToEthAddr.s[2];

    // select muxToEthAddr
    n2b.out[0] ==> muxToBjjAy.s[0];
    n2b.out[1] ==> muxToBjjAy.s[1];
    n2b.out[2] ==> muxToBjjAy.s[2];

    // check all rquested fields
    muxTxCompressedDataV2.out === rqTxCompressedDataV2;
    muxToEthAddr.out === rqToEthAddr;
    muxToBjjAy.out === rqToBjjAy;
}

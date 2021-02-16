include "../../node_modules/circomlib/circuits/mux4.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";

/**
 * multiplexer with 256 inputs
 * @input s[8] - {Array(Bool)} - selects the output
 * @input in[256] - {Array(Fields)} - all possible inputs
 * @output out - {Field} - input selected
 */
template Mux256(){
    signal input s[8];
    signal input in[256];

    signal output out;

    component mux[17];
    var i;
    var j;

    // initialize mux4 components
    for (i = 0; i < 17; i++){
        mux[i] = Mux4();
    }

    // set first mux level (mux[0]...mux[15])
    // selectors
    for (i = 0; i < 16; i++){
        for (j = 0; j < 4; j++){
            mux[i].s[j] <== s[j];
        }
    }
    // inputs
    var nMux = 0;
    for (i = 0; i < 256; i++){
        if ((i != 0) && (i % 16 == 0)){
            nMux = nMux + 1;
        }
        mux[nMux].c[i % 16] <== in[i];
    }

    // set second mux level (mux[16])
    // selectors
    for (i = 0; i < 4; i++){
        mux[16].s[i] <== s[i + 4];
    }
    // inputs
    for (i = 0; i < 16; i++){
        mux[16].c[i] <== mux[i].out;
    }

    mux[16].out ==> out;
}
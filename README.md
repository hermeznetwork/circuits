# Circuits
Implements zkSNARKs circuits for [hermez network](https://hermez.io/)

[![Main CI](https://github.com/hermeznetwork/circuits/workflows/Main%20CI/badge.svg)](https://github.com/hermeznetwork/commonjs/actions?query=workflow%3A%22Main+CI%22)

## Documentation

It could be found in: https://docs.hermez.io/#/developers/protocol/hermez-protocol/circuits/circuits?id=circuits

## Circuits organization

- `src`
  - `lib`
    - hash-state
    - decode-float
    - mux256
    - utils-bjj
  - decode-tx
  - fee-accumulator
  - rq-tx-verifier
  - hash-inputs
  - fee-tx
  - compute-fee
  - balance-updater
  - rollup-tx-states
  - rollup-tx
  - rollup-main
  - withdraw

## Test
```
npm run eslint && npm run test
```

WARNING
All code here is in WIP

## License
`circuits` is part of the Hermez project copyright 2020 HermezDAO and published with AGPL-3 license. Please check the LICENSE file for more details.
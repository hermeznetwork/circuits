# Circuits
Implements zkSNARKs circuits for [hermez network](https://hermez.io/)

![Main CI](https://github.com/hermeznetwork/circuits/workflows/Main%20CI/badge.svg)

## Circuits

- `src`
  - `lib`
    - hash-state
    - decode-float
    - fee-table-selector
    - utils-bjj
  - decode-tx
  - fee-accumulator
  - rq-tx-verifier
  - hash-inputs
  - fee-tx
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
`circuits` is part of the iden3 project copyright 2020 HermezDAO and published with AGPL-3 license. Please check the LICENSE file for more details.
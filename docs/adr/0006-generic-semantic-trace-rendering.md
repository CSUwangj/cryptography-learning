# Generic semantic trace rendering

Ordinary cryptographic operation traces use shared Learning components over semantic
CryptoGraph trace data; algorithm-specific renderer descriptors such as `aes-cipher@1` or
`teaching-spn@1` are not required. Comparison, avalanche, and lineage behavior remain shared
interaction modes, while the Visualizer registry is reserved for genuinely distinct data or
interaction contracts that generic models cannot represent. Existing descriptors may remain
while their consumers migrate. Recorded from the architecture correction on
[#69](https://github.com/CSUWangj/cryptography-learning/issues/69).

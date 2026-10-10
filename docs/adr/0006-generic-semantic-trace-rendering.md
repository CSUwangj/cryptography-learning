# Generic semantic trace rendering

Ordinary cryptographic operation traces use shared Learning components over semantic
CryptoGraph trace data; algorithm-specific renderer descriptors such as `aes-cipher@1` or
`teaching-spn@1` are not required. Comparison, avalanche, and lineage behavior remain shared
interaction modes, while the Visualizer registry is reserved for genuinely distinct data or
interaction contracts that generic models cannot represent. Existing descriptors may remain
while their consumers migrate. Recorded from the architecture correction on
[#69](https://github.com/CSUWangj/cryptography-learning/issues/69).

## Classical symbol-mapping exception

Classical cipher teaching needs a dedicated symbol-mapping view: paired input/output
symbols, ordered alphabet positions, explicit unmapped state, and Preserve/Strict policy.
A generic whole-string trace cannot express this teaching interaction. Reuse the existing
`classical-cipher@1` Visualizer for this distinct contract; it is an approved exception,
not a legacy consumer required to migrate to a whole-string trace. The maintainer recorded
this decision in [#69](https://github.com/CSUWangj/cryptography-learning/issues/69).

Mapped positions use the existing alphabet animation and accessible labels; separate
visible numeric columns are not required. This decision adds no renderer, descriptor
version, dependency, or runtime behavior. It does not authorize a renderer per classical
algorithm. Descriptor-free classical traces remain supported when symbol mapping is not
needed; the AES, SPN, comparison, avalanche, and lineage decisions remain unchanged.

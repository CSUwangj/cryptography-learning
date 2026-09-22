# Throwaway avalanche reference

Question: can a continuous byte/bit propagation view explain one changed plaintext
input while keeping round keys in a separate aligned column?

Run from the repository root:

```sh
python3 -m http.server 43827 --bind 127.0.0.1 --directory prototypes/avalanche-reference
```

Open http://127.0.0.1:43827/ (no Vite, build, or dependencies). The same page
also includes a second continuous trace where plaintext stays fixed and the key
changes.

## Wireframe and data layout

```text
Stage + delta       MAIN STATE: byte 0       byte 1          ROUND KEYS
Plaintext           [16 paired A/B bit cells]
                     | | | | | | | | | | | | | | | |
Mix                  XOR <-------------------------------- K0
State               [16 paired A/B bit cells]
                     \ /       \ /       \ /       \ /
Substitute           S0        S1        S2        S3       (lookup table)
State               [16 paired A/B bit cells]
Permute              continuous source → destination wires
State               [16 paired A/B bit cells]
Mix                  XOR <-------------------------------- K1
...                  continuous through final ciphertext
```

This layout is defined before styling. A single SVG coordinate system keeps
every state bit, operation, and round-key connection aligned. Small screens scroll
the entire diagram rather than separating its columns. Every stage stays visible.

The synthetic 16-bit SPN uses two substitution/permutation rounds and final XOR,
the displayed S-box and transpose permutation, and constant K0=3A94, K1=A94D,
K2=94D6. It is not a production CryptoGraph implementation. The immutable trace
contains baseline 0F0F and changed 00FF (input mask 0FF0, 8/16, 50%).

Each bit cell displays baseline A on the left, changed B on the right. Underlining
and ≠ mark actual differences. Selecting any state bit highlights all its ancestors
and descendants. XOR preserves bit position; permutation moves it; an S-box
connects each of its four inputs to each output as structural dependency, not a
claim of isolated causal effect. With eight input differences, their individual
numeric contributions cannot be inferred from this paired trace. Related key bits
are fixed operands, never changed descendants. Clicking a key highlights its
mixing connection without hiding any information.

Reference only: no production integration, existing prototype imports, persistence,
tabs, checkpoint inspector, tests, screenshots, or animation.

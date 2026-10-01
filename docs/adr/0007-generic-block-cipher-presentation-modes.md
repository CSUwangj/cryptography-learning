# Generic block-cipher presentation modes

Block-cipher Lessons use one generic semantic presentation contract rather than
algorithm-specific renderers. The generic presentation is the complete state-flow
base for encryption and decryption; encryption alone may add a key-expansion overlay,
while a standalone key-expansion presentation has no cipher frame or overlay behavior.
This keeps presentation differences as shared interaction modes and preserves the
architectural boundary established by ADR 0006 while allowing schedule inspection.

## Consequences

- `generic` is the base state-flow mode; encryption and decryption share its rendering.
- A key-expansion overlay is an encryption-only interaction capability.
- Standalone key expansion uses the same semantic trace model without cipher decoration.
- `algorithm` metadata supplies semantic labels and localization context; it does not
  select an algorithm-specific renderer.

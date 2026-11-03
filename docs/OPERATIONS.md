# Add an Operation

Use this guide to define, register, invoke and test a bit-valued v2 Operation.
An Operation is a compiled-in Cryptographic Primitive, independent of a Lesson.
The worked example is the existing `core.xor-constant@1`. It is already registered;
copy it as a starting point for a different primitive, not as a second registration.

To use an existing primitive, start with the
[registered public Operations](#registered-public-operations) below.

[Lesson migration](MIGRATION-v2.md) covers v1/v2 authoring and coexistence.
[ADR 0006](adr/0006-generic-semantic-trace-rendering.md) defines shared semantic
presentation; [ADR 0008](adr/0008-generic-rendering-by-structural-family.md) records
the implemented v2 family and its limits.

## Define the contract

The identity `core.xor-constant@1` names a primitive and its version, not the
Lesson schema version. Keep existing identities and contracts valid. A new
incompatible primitive contract needs a distinct versioned identity and explicit
registration; no runtime loader discovers source files.

The [Operation type](../frontend/src/crypto_graph/operation.ts) pairs the identity
and parameter type with a manifest and hooks. Manifest port names are the exact
keys used in graph bindings and execution results. Each v2 Operation declares
exactly one output port; a graph can still export multiple values.

Here `value` accepts `bits<N>` and returns `bits<N>`. The shared symbolic size
`N` means the output retains the resolved input width. `target` is a zero-based
32-bit word index, counted from the most significant end. `constant` is an
unsigned 32-bit integer. The input width must be a positive multiple of 32 and
contain the target word. Other words pass through unchanged.

| Hook | Author responsibility | When it can be omitted |
| --- | --- | --- |
| `validateParameters` | Validate untrusted parameter shapes, integer/range constraints and other input-independent rules. Return diagnostics, not a type assertion as validation. The registry clones parameters and validates before binding. | No parameter validation is needed, as in parameter-free XOR. TypeScript parameter types alone do not validate YAML. |
| `inferOutputTypes` | Check rules that depend on resolved input widths and return output-port types, or diagnostics. Inputs already reflect projections. XOR-constant checks word alignment and target bounds here. | Manifest outputs resolve from fixed sizes or input-bound size symbols, with no extra width-dependent constraint. Source uses the existing `outputTypeParameter` mechanism instead. |
| `lineage` | For each output bit, list the input port and local logical bit indexes it structurally depends on. Include pass-through bits. Declare dependencies, not observed value changes. | Raw execution can omit it, but then that Operation contributes no compiled edges. A presented v2 transform needs dependencies for every output bit. Input-free sources can declare empty lists. |
| `execute` | Compute and return values under the declared output keys. Preserve logical width, valid packing and input values. The third argument supplies alphabet mappings for operations that need them. | Required. Unused arguments can be omitted from the function signature. |

The [compiler](../frontend/src/crypto_graph/index.ts) checks registered identities,
node/reference/port validity, required inputs, cycles, one v2 output, projected
ranges and compatible port types. It binds repeated symbolic sizes per node,
resolves outputs in dependency order, checks declared lineage lengths and source
bit bounds, and maps local dependencies onto graph edges. It does not derive
cryptographic semantics or verify that a dependency formula is correct. At
execution, source values must match their declared types, operation exceptions
become diagnostics, and returned sized values receive packing checks. Authors
must still return the promised port names/types and correct results.

## Copy the implementation

Use the existing [core/xorConstant.ts](../frontend/src/crypto_graph/core/xorConstant.ts)
as the canonical complete implementation template. It defines the parameter type,
manifest and all four hooks, with imports relative to the owning `crypto_graph`
module. Copy that file to the new primitive's source path and replace its identity,
exported names and semantics. The existing
[bit helpers](../frontend/src/crypto_graph/operation_support.ts) handle logical bit
positions; reuse them rather than treating non-byte-aligned bits as byte offsets.

`validateParameters` checks parameter values without needing an input. Inference
then checks the actual width. `execute` copies the input storage before changing
the target word. Lineage maps every output bit to the input bit at the same index.
The authored constant is a parameter, not a graph input, so it adds no lineage
endpoint. Bits outside the target word keep the same dependency.

For a parameter-free variant, follow [core.xor@1](../frontend/src/crypto_graph/core/xor.ts).
Its two inputs share `N`, so the compiler requires equal widths and resolves the
output without an inference hook. Each output bit depends on both corresponding
input bits. For an output-width-changing variant, follow
[core.concat@1](../frontend/src/crypto_graph/core/concat.ts). Its inputs bind `L`
and `R`; inference returns `L + R`, and lineage maps each output segment to the
appropriate input. A fresh output symbol alone cannot infer that sum.

## Register it and name it in both languages

For a new primitive, update all four places in
[crypto_graph/index.ts](../frontend/src/crypto_graph/index.ts). The following are
existing excerpts, not a standalone module or instructions to duplicate entries:

```ts excerpt
// frontend/src/crypto_graph/index.ts
import type { XorConstantParameters } from './core/xorConstant'
import { xorConstant } from './core/xorConstant'
  'core.xor-constant@1': XorConstantParameters
  rotateWord, xorConstant, aesXorWords, output,
```

The first two lines import the parameter type and implementation. Put the identity
mapping inside `OperationParameters`, then add the implementation to the compiled
`operations` array checked by `MappedOperation`. `registerOperation` is internal;
Lesson code invokes the identity rather than importing the implementation.
Do not add a public export solely to make a test reach a hook.

Merge this entry into
[en-US/primitives.json](../frontend/src/app/i18n/locales/en-US/primitives.json):

```json
// frontend/src/app/i18n/locales/en-US/primitives.json
{
  "core.xor-constant@1": "Constant XOR"
}
```

Merge the matching entry into
[zh-CN/primitives.json](../frontend/src/app/i18n/locales/zh-CN/primitives.json):

```json
// frontend/src/app/i18n/locales/zh-CN/primitives.json
{
  "core.xor-constant@1": "常量异或"
}
```

The path comments identify the examples; omit those comments when saving JSON.
Keep the dotted versioned identity intact. The shared presentation looks up that
exact key in the `primitives` namespace. Lesson-specific label overrides are
separate localized text references, as described in the migration guide.
The existing [primitive-label test](../frontend/src/app/primitiveLabels.test.ts)
checks bilingual coverage of every public registered manifest.

## Invoke it in a complete Lesson

The complete runnable [xor-constant Lesson](examples/operations/xor-constant/lesson.yaml)
is the canonical invocation example. Its adjacent
[en-US](examples/operations/xor-constant/locales/en-US.yaml) and
[zh-CN](examples/operations/xor-constant/locales/zh-CN.yaml) locale files make the
root self-contained. Copy that directory when adapting it; change the Lesson
identity, input, Operation identity/parameters and both locales together.

The Lesson binds a 64-bit input to `state.value`, invokes the registered
`core.xor-constant@1` with `target: 1` and `constant: 16777216`, then exports
`result.value`. It includes optional role/round/grouping annotations and uses
raw execution without a presentation declaration.

Validate the checked-in root with the existing CLI from the repository root:

```sh
fish -lc 'cd frontend; and nvm use; and npm run validate-lessons -- ../docs/examples/operations/xor-constant'
```

The words are initially `00112233` and `44556677`. XORing decimal `16777216`
(`0x01000000`) into word 1 gives the literal result `0x0011223345556677`.
The trace contains `state.value`, `mixed.value` and `result.value`, each with its
full 64-bit value. The source binding supplies the default Lesson input at runtime.

## Test the example

The complete [operationExample.test.ts](../frontend/src/crypto_graph/operationExample.test.ts)
is the runnable test template. It reads the companion Lesson and both locale
files directly and uses public Lesson compilation/validation and graph execution.
It checks the literal output, three automatic trace rows, 64-bit output width,
64 dependencies including pass-through bits, and invalid constant/target
diagnostics. Its real TypeScript source and the registered implementation are
covered by normal frontend typecheck.

Copy the test within `frontend/src/crypto_graph/` when adapting it. Update the
companion directory path, graph/node/port names, literal expected values,
lineage and invalid cases to match your primitive. The template uses
`dirname(fileURLToPath(import.meta.url))` so file reads resolve relative to the
test module. Keep tests at the existing public APIs rather than calling hooks
or replacing the registry.

From the repository root, use the existing pinned installation:

```sh
fish -lc 'cd frontend; and nvm use; and npm test -- --maxWorkers=1 --passWithNoTests=false src/crypto_graph/operationExample.test.ts src/app/primitiveLabels.test.ts'
fish -lc 'cd frontend; and nvm use; and npm run typecheck'
```

## Keep bit semantics separate from presentation

Logical bit indexes are zero-based and MSB-first. A graph input reference with
`bits: [start, length]` supplies that projected width to inference, lineage and
execution. For a 96-bit source projected with `[32, 64]`, XOR-constant sees a
64-bit input. Its local bit 0 maps to source bit 32; `target: 1` changes local
bits 32 through 63, which map to source bits 64 through 95. The compiler adds
the projection offset when building edges; the Operation must not add it again.

`BitsValue` stores `ceil(size / 8)` bytes with unused high bits of the first byte
zero. Index only the logical bits. XOR-constant intentionally rejects a width
that is not a multiple of 32. Operations supporting other widths, such as concat,
must return the full inferred width and valid padding, including five-bit values.
See the [complete projection/concat Lesson](MIGRATION-v2.md#projected-composition).

The compiler owns graph ordering, inferred widths and graph-level lineage.
Execution automatically emits one v2 event per Operation, including sources,
with its path, primitive identity, value, captured parameters and authored
`role`, `round`, `iteration` and `unit` annotations. Do not add custom trace
emission or infer teaching roles from node names. Existing trace limits can
truncate events. Compiled lineage stays on the main-thread compiled graph;
it is absent from worker messages and snapshots.

The generic presentation consumes retained values and compiled lineage without
rerunning operations. Raw descriptor-free execution needs no teaching roles.
The supported `spn-cipher` family requires bit-valued annotated rows and a
supported dependency order, with complete lineage for transforms. A cipher uses
one state chain and at least one input-free round-key source consumed by that
chain; standalone key expansion uses schedule generation dependencies.
The minimal Lesson above uses the raw trace. Its roles, rounds and optional
32-bit grouping illustrate event annotations. The parameter constant is not a
round-key source, so this Lesson does not satisfy cipher presentation validation.
`unit` is a visual boundary, not a width or dependency rule.
More complicated graphs may execute correctly while failing presentation
validation; correct the authored graph or use the raw trace. Follow the
[migration presentation rules](MIGRATION-v2.md#supported-presentation) for
schedule/overlay declarations and their constraints.

Registering an Operation does not supply a dedicated renderer or new structural
family. V2 comparison, avalanche and dedicated classical presentations remain
unsupported. V1 remains supported during v1.2 under
[ADR 0007](adr/0007-generic-block-cipher-presentation-modes.md); a v2 registration does not
backport inference, trace conventions or teaching support to the frozen v1 path.
Do not change existing v1 identities to make a new v2 example work.

## Adaptation checklist

- Choose the versioned identity, source filename and exported implementation/type names.
  Preserve existing Operation contracts.
- Define exact input/output port names, fixed or symbolic widths and a parameter type.
  Add input-independent validation and any width-dependent inference constraints.
- Declare every structural bit dependency, including pass-throughs and changes in
  output width. Compute valid values without mutating caller inputs.
- Add the type import, implementation import, `OperationParameters` entry and
  compiled registry entry. Add both primitive-label entries with the exact identity.
- Replace the Lesson identity, operation/port/parameter bindings, inputs, annotations
  and both locales. Use an existing presentation only when its contract fits.
- Replace the test's literal expected values, lineage and invalid cases. Run the
  focused test, primitive-label coverage and typecheck with the pinned installation.
  Add boundary/projection/width cases relevant to the primitive; do not assume a
  successful example proves every width or v1 presentation.
- Update the registered-public-Operation index below when adding an identity. Keep
  private Lessons in the private content repository. No automatic conversion,
  private-content migration or v1 retirement follows from registration.

## Registered public Operations

These 30 Operations are registered in the
[compiled public registry](../frontend/src/crypto_graph/index.ts). The tables
describe what each one does. Follow its source for exact ports, parameters and
constraints. Test-only Operations are excluded.

Registration does not guarantee support for a v2 presentation. The
[presentation and compatibility limits](#keep-bit-semantics-separate-from-presentation)
above still apply, including the lack of a dedicated v2 classical presentation.

### Core

| Identity | What it does | Implementation |
| --- | --- | --- |
| `core.source@1` | Supplies a value of the declared type, including a Lesson input bound at runtime. | [source](../frontend/src/crypto_graph/core/source.ts) |
| `core.xor@1` | XORs two bit values of equal width. | [source](../frontend/src/crypto_graph/core/xor.ts) |
| `core.concat@1` | Joins the left bits followed by the right bits, including values that are not byte-aligned. | [source](../frontend/src/crypto_graph/core/concat.ts) |
| `core.output@1` | Copies a bit value through unchanged. | [source](../frontend/src/crypto_graph/core/output.ts) |
| `core.substitute-nibbles@1` | Applies a supplied 16-entry S-box to all or a selected range of four-bit nibbles, preserving the rest. | [source](../frontend/src/crypto_graph/core/substituteNibbles.ts) |
| `core.substitute-bytes@1` | Applies a supplied 256-entry S-box to all or a selected range of bytes, preserving the rest. | [source](../frontend/src/crypto_graph/core/substituteBytes.ts) |
| `core.permute-bytes@1` | Reorders whole bytes by gathering the input byte named at each output position in the permutation. | [source](../frontend/src/crypto_graph/core/permuteBytes.ts) |
| `core.rotate-word@1` | Rotates one selected 32-bit word left by 1 through 31 bits, preserving the other words. | [source](../frontend/src/crypto_graph/core/rotateWord.ts) |
| `core.xor-constant@1` | XORs a supplied 32-bit constant into one selected word, preserving the other words. | [source](../frontend/src/crypto_graph/core/xorConstant.ts) |

### SPN

| Identity | What it does | Implementation |
| --- | --- | --- |
| `spn.substitute@1` | Applies a supplied 16-entry S-box to each of the four nibbles in a 16-bit state. | [source](../frontend/src/crypto_graph/spn/substitute.ts) |
| `spn.permute@1` | Reorders the four nibbles in a 16-bit state. Each permutation entry gives the destination of that input nibble. | [source](../frontend/src/crypto_graph/spn/permute.ts) |
| `spn.permute-gather@1` | Reorders nibbles in a bit value whose width is divisible by four. Each permutation entry gives the input nibble for that output position. | [source](../frontend/src/crypto_graph/spn/permuteGather.ts) |

### AES

The state transformations use 128-bit states. The word operations build key
schedules; `aes.xor-words@1` updates a selected range within a larger word-aligned
state. Use `core.xor@1` to mix a state with an equal-width round key.

| Identity | What it does | Implementation |
| --- | --- | --- |
| `aes.key-word@1` | Extracts the indexed 32-bit word from a key. | [source](../frontend/src/crypto_graph/aes/aesKeyWord.ts) |
| `aes.rot-word@1` | Rotates a 32-bit word left by one byte. | [source](../frontend/src/crypto_graph/aes/aesRotWord.ts) |
| `aes.sub-word@1` | Applies the AES S-box to all four bytes of a 32-bit word. | [source](../frontend/src/crypto_graph/aes/aesSubWord.ts) |
| `aes.rcon-word@1` | Produces the selected round's 32-bit Rcon word, with the round constant in its first byte and zeros in the rest. | [source](../frontend/src/crypto_graph/aes/aesRconWord.ts) |
| `aes.word-xor@1` | XORs two 32-bit words. | [source](../frontend/src/crypto_graph/aes/aesWordXor.ts) |
| `aes.round-key@1` | Joins `w0`, `w1`, `w2` and `w3` in order into a 128-bit round key. | [source](../frontend/src/crypto_graph/aes/aesRoundKey.ts) |
| `aes.xor-words@1` | Updates consecutive state words by chained XOR. The first uses `temp`; each later word uses the preceding updated word. Words outside the range pass through. | [source](../frontend/src/crypto_graph/aes/aesXorWords.ts) |
| `aes.sub-bytes@1` | Applies the AES S-box to every byte of a 128-bit state. | [source](../frontend/src/crypto_graph/aes/aesSubBytes.ts) |
| `aes.inv-sub-bytes@1` | Applies the inverse AES S-box to every byte of a 128-bit state. | [source](../frontend/src/crypto_graph/aes/aesInvSubBytes.ts) |
| `aes.shift-rows@1` | Rotates state row `r` left by `r` bytes, using the AES column-major byte layout. | [source](../frontend/src/crypto_graph/aes/aesShiftRows.ts) |
| `aes.inv-shift-rows@1` | Rotates state row `r` right by `r` bytes, reversing ShiftRows. | [source](../frontend/src/crypto_graph/aes/aesInvShiftRows.ts) |
| `aes.mix-columns@1` | Applies the AES MixColumns matrix to each four-byte column of the state. | [source](../frontend/src/crypto_graph/aes/aesMixColumns.ts) |
| `aes.inv-mix-columns@1` | Applies the inverse MixColumns matrix to each four-byte column of the state. | [source](../frontend/src/crypto_graph/aes/aesInvMixColumns.ts) |

### Classical

The alphabet-based Operations use the Lesson's alphabet mapping and its
`preserve` or `strict` policy for symbols outside that alphabet. Transposition
reorders text symbols without an alphabet mapping.

| Identity | What it does | Implementation |
| --- | --- | --- |
| `classical.caesar@1` | Shifts each alphabet position by the supplied integer, modulo the alphabet size. A negative shift reverses the direction. | [source](../frontend/src/crypto_graph/classical/caesar.ts) |
| `classical.affine@1` | Maps alphabet position `x` to `a*x + b` modulo the alphabet size. The multiplier `a` must be coprime to that size. | [source](../frontend/src/crypto_graph/classical/affine.ts) |
| `classical.substitution@1` | Encrypts or decrypts using a key that lists each alphabet symbol exactly once. | [source](../frontend/src/crypto_graph/classical/substitution.ts) |
| `classical.vigenere@1` | Encrypts or decrypts with repeating key-symbol shifts. The key advances only when an alphabet symbol is processed. | [source](../frontend/src/crypto_graph/classical/vigenere.ts) |
| `classical.transposition@1` | Encrypts by filling a grid down columns and reading across rows, or decrypts by reversing that order. It uses 2 through 12 rows and adds no padding. | [source](../frontend/src/crypto_graph/classical/transposition.ts) |

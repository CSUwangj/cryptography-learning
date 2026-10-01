# Domain glossary

## Learning experiences

- **Practice** — The top-level experience in which students complete interactive
  cryptography exercises.
- **Lab** — One Practice item that presents instructions and connects a student
  to a Challenge.
- **Lab ID** — The stable identifier of one Lab, unique across Practice.
  Category membership is not part of a Lab's identity.
- **Challenge** — The running interactive program through which a student
  completes a Lab.
- **Learning** — The top-level experience in which students study explanatory,
  visual cryptography content.
- **Lesson** — One Learning item that composes cryptographic operations,
  explanations, and visualizations.
- **Step** — One ordered stage of a Lesson that may explain, request input,
  execute a CryptoGraph, visualize a trace, or provide local feedback.
- **CryptoGraph** — A typed graph of cryptographic operations whose execution
  produces values and teaching traces.
- **Alphabet Mapping** — An explicit ordered set of unique symbols with consecutive
  numeric positions. Its order defines the symbol positions used by classical ciphers.
- **Alphabet Symbol** — A member of an Alphabet Mapping, distinct from the text
  encoding used to enter or display it.
- **Teaching SPN** — A small substitution-permutation network designed to make
  substitutions, permutations, key mixing, and round state inspectable.
- **Cryptographic Primitive** — An operation-level cryptographic building block,
  such as XOR, addition, substitution, an AES transform, or key expansion. A
  primitive is represented at execution time by a CryptoGraph operation and is
  independent of any Lesson.
- **Visualizer** — A compiled-in, versioned teaching view that transforms typed
  CryptoGraph values and semantic traces into an interactive presentation.
- **Bit-Width Value** — A complete cryptographic value represented as `bit<size>`;
  teaching views preserve the operation's full state width instead of splitting
  the main presentation into implementation-level words.
- **Operation Row** — One ordered trace stage in a teaching view. An operation
  row presents the complete state for that stage; internal word-sized steps may
  remain in trace metadata without becoming separate main-view rows.
- **Detail Lineage View** — The key-schedule presentation that draws every
  structural bit dependency by default, including dense fan-in and fan-out.
- **Bit Grouping** — Optional per-operation metadata that draws boundaries at a
  fixed interval such as every 8 or 32 bits. Rows without grouping remain an
  unsegmented bit sequence; the grouping is presentation metadata, not a new
  cryptographic value type.
- **Pass-Through Lineage** — A stage relation in which bits unaffected by an
  operation continue through the stage without a new dependency edge; only the
  operation's actual injection or transformation point receives new lineage.
- **Bit Lineage** — The structural dependency relationships connecting a selected
  bit to its ancestors and descendants through cryptographic operations. Lineage
  does not assert that the selected bit individually caused an observed difference.
- **Generic Block-Cipher Presentation** — The complete state-flow presentation for
  a block-cipher trace, including operation rows, values, and structural relationships.
  It is the base presentation for both encryption and decryption.
- **Encryption Presentation** — A Generic Block-Cipher Presentation that may show a
  key-expansion overlay aligned to encryption round keys.
- **Decryption Presentation** — A Generic Block-Cipher Presentation without a
  key-expansion overlay.
- **Key-Expansion Presentation** — A standalone presentation of schedule operations
  and their full-state lineage. It has no block-cipher frame or change background and
  does not participate in overlays.
- **Key-Expansion Overlay** — A key-expansion view temporarily aligned over an
  Encryption Presentation. It is unavailable for Decryption Presentation.
- **Mobile Practice View** — The narrow-viewport presentation of Practice in
  which one selected Lab is the primary surface and Lab navigation is secondary.
  _Avoid:_ mobile Practice page, phone layout
- **Practice Navigation** — The student-facing hierarchy of Lab categories,
  Labs, and Completion Records. Completion Records is a distinct destination,
  not a Lab or Lab category.
  _Avoid:_ Practice menu

## Completion

- **Student ID** — The identifier a student supplies for a Completion Claim.
  It is self-asserted and does not prove the student's identity.
- **Completion Evidence** — A trusted Lab Host's signed assertion that a
  self-identified student completed a Lab in a Course Run.
- **Quarantined Completion Evidence** — Completion Evidence that an operator has
  deliberately removed from active delivery after an exceptional failure while
  retaining it for audit.
- **Completion Claim** — The stored, user-visible record derived from verified
  Completion Evidence. It is not proof of the student's identity.
- **Completion Time** — The public time asserted by a trusted Lab Host for a
  student's Lab completion. It is distinct from the backend's private receipt time.
- **Completion Record** — The plain-language, student-facing presentation of a
  Completion Claim, including its Completion Time. It remains explicitly unofficial
  and does not authenticate the Student ID.
  _Avoid:_ Completion Claim in student-facing copy
- **Completion Board** — The explicitly unofficial view of Completion Claims for
  one Course Run, showing self-asserted Student IDs, completed Lab IDs, and their
  Completion Times.
- **Course Run** — One offering of the course for which completions are tracked
  independently.
- **Lab Host** — A machine that runs one or more Challenges.
- **Host Completion Relay** — The single trusted participant for one Lab Host,
  shared by that Host's Challenges, that accepts local completion reports and
  issues Completion Evidence.

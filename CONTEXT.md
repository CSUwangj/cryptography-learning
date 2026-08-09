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
- **Visualizer** — A compiled-in, versioned teaching view that transforms typed
  CryptoGraph values and semantic traces into an interactive presentation.

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
- **Completion Board** — The explicitly unofficial view of Completion Claims for
  one Course Run, showing only self-asserted Student IDs and completed Lab IDs.
- **Course Run** — One offering of the course for which completions are tracked
  independently.
- **Lab Host** — A machine that runs one or more Challenges.
- **Host Completion Relay** — The single trusted participant for one Lab Host,
  shared by that Host's Challenges, that accepts local completion reports and
  issues Completion Evidence.

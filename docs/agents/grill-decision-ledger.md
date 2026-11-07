# Grill decision ledger

Keep a decision ledger in the grill execution record. It is a record of the
maintainer's decisions, not product or runtime state.

Give every question a stable ID that is never reused. Record its status as
`open`, `answered`, or `superseded`. An `answered` entry includes the confirmed
answer and its source and date. A `superseded` entry links to the replacing
question ID. Allow only these transitions: `open` to `answered` when the
maintainer confirms an answer; `open` or `answered` to `superseded` when a new
question replaces it. Keep the original entry and link it to the replacement;
`superseded` is terminal.

Before a resumed or delegated session asks a question or makes a dependent
decision, restore the current ledger and its sources. Do not treat an open
question as permission or infer an answer from silence.

```md
| ID | Question | Status | Confirmed answer / source / date | Replaced by |
| --- | --- | --- | --- | --- |
| Q1 | `<decision question>` | open | | |
```

## Current-decision index

For requirements corrected in successive comments, keep a concise current-decision
index in the owning issue. Reuse the ledger table above, its stable IDs and its
`open`, `answered` and `superseded` statuses. Link the effective source decisions
with their dates, the superseded entries and their replacements. The index points
to the authoritative decisions; it does not replace them.

For a partial correction, name the replaced clauses and carry the unaffected
clauses and their source links into the replacing entry. Keep the original entry
and its replacement link. Do not treat an entire source comment as obsolete when
only some clauses changed. Record unresolved product choices as `open` questions
for the maintainer before dependent work.

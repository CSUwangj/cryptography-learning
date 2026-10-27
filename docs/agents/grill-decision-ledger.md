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

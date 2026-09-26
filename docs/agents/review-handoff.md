# Review handoff

Use this format only when reviewing an implementation diff. It reports the
defect and evidence, while leaving implementation choices to the implementer.

```md
## Review: changes required

- **Blocking R1** — `path/to/file.ts:42` — violates `<criterion or contract>`; observed `<failure>`; evidence: `<check or counterexample>`.

Non-blocking:
- `<optional observation>`
```

Use `## Review: pass` when there are no blocking findings.

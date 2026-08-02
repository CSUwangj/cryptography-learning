# Known terminal defects (characterization baseline)

These were problems in the pre-modernization `frontend/src/terminal/Terminal.tsx`.
Issue #17 replaces that component with a lifecycle-safe Terminal module. The IDs
below remain so baseline automation can keep the registry complete; each row
records the historical defect and the post-modernization status.

| ID | Category | Observed problem | Desired after modernization | Status |
| --- | --- | --- | --- | --- |
| `duplicate-local-echo` | echo/output | `xterm.onData` locally writes every keystroke while `AttachAddon` also sends the same bytes to the Challenge, so input appears duplicated when the remote echoes. | Server-echoed sessions render Challenge output exactly once; raw TCP Challenge sessions may explicitly enable one local input echo. | Fixed in #17: one AttachAddon path owns transport. Local echo is now an explicit raw-TCP mode rather than an unconditional second transport path. |
| `duplicate-server-output` | echo/output | `ws.onmessage` writes a newline plus `event.data` **and** `AttachAddon` writes the same WebSocket payload, so server output is duplicated. | One attachment path owns output; no parallel `onmessage` writer. | Fixed in #17: AttachAddon is the only output path. |
| `paste` | paste | No native paste handling is wired for Ctrl+V / Cmd+V; local echo and key handlers interfere with reliable paste. | Ctrl+V and Cmd+V use native xterm paste; Ctrl+C and AltGr remain intact; multiline paste follows bracketed-paste semantics. | Fixed in #17: custom key handler releases Ctrl/Cmd+V; no Async Clipboard reads. Verified in a real browser harness. |
| `resize` | resize | `fitAddon.fit()` runs once on open; there is no resize observer and no PTY dimension update toward the Challenge. | Container resize refits xterm and emits changed PTY dimensions when the protocol supports them. | Fixed in #17: ResizeObserver + FitAddon; optional `onPtyResize`. |
| `lifecycle` | lifecycle | `Terminal` / `FitAddon` are constructed during render; the effect does not close the WebSocket or dispose xterm on unmount; disconnect installs additional `onKey` handlers with no retry control. Strict Mode remounts leave stale sockets. | Exactly one Terminal, addons, socket, and subscriptions per mount; route changes and unmount leave no stale work; disconnect exposes accessible retry/exit. | Fixed in #17: effect-owned resources with full cleanup; React retry/exit controls. |

The protocol-faithful fixture under `baseline/terminal/fixture.py` speaks a
healthy Challenge path (single banner, single echo). Baseline automation proves
that path and keeps this registry complete; it does **not** assert the defective
browser behaviors above as acceptance requirements.

# Known terminal defects (characterization baseline)

These are **current** problems in `frontend/src/terminal/Terminal.tsx`.
They are recorded here so modernization (issue #17) can fix them without the
baseline accidentally treating them as required behavior.

| ID | Category | Observed problem | Desired after modernization |
| --- | --- | --- | --- |
| `duplicate-local-echo` | echo/output | `xterm.onData` locally writes every keystroke while `AttachAddon` also sends the same bytes to the Challenge, so input appears duplicated when the remote echoes. | Browser code never locally echoes input; Challenge output renders exactly once. |
| `duplicate-server-output` | echo/output | `ws.onmessage` writes a newline plus `event.data` **and** `AttachAddon` writes the same WebSocket payload, so server output is duplicated. | One attachment path owns output; no parallel `onmessage` writer. |
| `paste` | paste | No native paste handling is wired for Ctrl+V / Cmd+V; local echo and key handlers interfere with reliable paste. | Ctrl+V and Cmd+V use native xterm paste; Ctrl+C and AltGr remain intact; multiline paste follows bracketed-paste semantics. |
| `resize` | resize | `fitAddon.fit()` runs once on open; there is no resize observer and no PTY dimension update toward the Challenge. | Container resize refits xterm and emits changed PTY dimensions when the protocol supports them. |
| `lifecycle` | lifecycle | `Terminal` / `FitAddon` are constructed during render; the effect does not close the WebSocket or dispose xterm on unmount; disconnect installs additional `onKey` handlers with no retry control. Strict Mode remounts leave stale sockets. | Exactly one Terminal, addons, socket, and subscriptions per mount; route changes and unmount leave no stale work; disconnect exposes accessible retry/exit. |

The protocol-faithful fixture under `baseline/terminal/fixture.py` speaks a
healthy Challenge path (single banner, single echo). Baseline automation proves
that path and keeps this registry complete; it does **not** assert the defective
browser behaviors above as acceptance requirements.

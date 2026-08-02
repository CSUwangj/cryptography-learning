# Native terminal keyboard compatibility

Native-platform checks complement, but do not replace, Linux synthetic browser
regression coverage. They do not gate web-image releases. Record one evidence
entry for every execution in the exact format below; protocol output is the
complete Challenge-bound payload captured by the terminal harness, not visible
terminal text or a browser key event.

```md
### <case ID> — PASS|FAIL
- Date:
- Tested commit:
- OS and exact version/build:
- Browser and exact version:
- Keyboard layout/input source:
- Command/key chord:
- Clipboard text: <value or N/A>
- Expected protocol output: hex=<bytes>; decoded=<text>; count=<n>
- Actual protocol output: hex=<bytes>; decoded=<text>; count=<n>
- Async Clipboard reads: <count or N/A>
- Evidence: <CI run URL, or manual screenshot/log attachment>
```

## CI: `macos14-chrome-cmd-v`

The Build workflow runs this on a real `macos-14` runner using Playwright's
branded stable Google Chrome channel. It places `cmd-v-native` on the system
clipboard, focuses the terminal, and dispatches Cmd+V through branded Chrome on
the real macOS runner. It records the complete Challenge-bound payload plus Async
Clipboard read count. The expected payload is exactly
`63 6d 64 2d 76 2d 6e 61 74 69 76 65`, decoded as `cmd-v-native`, once, with
zero Async Clipboard reads. Download the native compatibility artifact for the
Markdown evidence record and failure diagnostics.

## Manual: `macos14-firefox-cmd-v`

1. From this checkout, use the Node version pinned in `frontend/.nvmrc`, then
   run `cd frontend && npm ci`. Start the fixture in one terminal with
   `python3 e2e/fixtures/browser_terminal_fixture.py`; keep the printed
   `ws://...` URL. In another terminal run
   `npx vite --host 127.0.0.1 --port 4177`.
2. On macOS 14, select the U.S. input source and open the latest stable Mozilla
   Firefox. Record its exact version and the macOS version/build. Open
   `http://127.0.0.1:4177/terminal-harness.html?url=<encoded fixture URL>`.
3. Before copying, open the browser developer console and run exactly:

   ```js
   window.__terminalHarness.outbound.length = 0
   window.__nativeClipboardReads = 0
   window.__nativeReadText = navigator.clipboard.readText.bind(navigator.clipboard)
   navigator.clipboard.readText = async (...args) => {
     window.__nativeClipboardReads += 1
     return window.__nativeReadText(...args)
   }
   ```
4. Copy exactly `cmd-v-native` to the system clipboard, focus the terminal, and
   press physical Cmd+V once.
5. In the developer console, run exactly and copy its output into the evidence
   record:

   ```js
   const payload = window.__terminalHarness.outbound.join('')
   ;({
     hex: Array.from(new TextEncoder().encode(payload), (byte) => byte.toString(16).padStart(2, '0')).join(' '),
     decoded: JSON.stringify(payload),
     count: payload.split('cmd-v-native').length - 1,
     asyncClipboardReads: window.__nativeClipboardReads,
   })
   ```

   The payload must be exactly `63 6d 64 2d 76 2d 6e 61 74 69 76 65`, decoded
   `cmd-v-native`, count `1`, with no trailing CR or LF, and the read count
   must be `0`.
6. Save a screenshot or harness log and fill one evidence record using
   `macos14-firefox-cmd-v`.

## Manual: `windows11-chrome-altgr-q`

1. From this checkout, use the Node version pinned in `frontend/.nvmrc`, then
   run `cd frontend && npm ci`. Start the fixture in one terminal with
   `python3 e2e/fixtures/browser_terminal_fixture.py`; keep the printed
   `ws://...` URL. In another terminal run
   `npx vite --host 127.0.0.1 --port 4177`.
2. On Windows 11, activate the German keyboard layout and open the latest stable
   Google Chrome. Record the exact browser version and Windows version/build.
   Open `http://127.0.0.1:4177/terminal-harness.html?url=<encoded fixture URL>`.
3. Before pressing the key, open the browser developer console and run
   `window.__terminalHarness.outbound.length = 0`.
4. Focus the terminal and press physical AltGr+Q once.
5. In the developer console, run exactly and copy its output into the evidence
   record:

   ```js
   const payload = window.__terminalHarness.outbound.join('')
   ;({
     hex: Array.from(new TextEncoder().encode(payload), (byte) => byte.toString(16).padStart(2, '0')).join(' '),
     decoded: JSON.stringify(payload),
     count: payload.split('@').length - 1,
   })
   ```

   It must be exactly one byte, `40`, decoded `@`, count `1`. It must contain
   no preceding Escape byte, Ctrl+Q byte (`11`), or other modifier bytes.
   Record Async Clipboard reads as `N/A`.
6. Save a screenshot or harness log and fill one evidence record using
   `windows11-chrome-altgr-q`.

The Linux Control+Alt+Q Playwright check is synthetic regression coverage only:
it is not native evidence for the Windows German AltGr+Q case. The existing
Linux regression check also continues to verify that Ctrl+C reaches the
Challenge exactly once.

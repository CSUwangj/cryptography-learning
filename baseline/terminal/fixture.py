#!/usr/bin/env python3
"""Protocol-faithful Challenge WebSocket fixture for the characterization baseline.

Real Lab Challenges are reached through a websocat-style bridge: the browser
opens a raw WebSocket, receives an opening banner as data frames, and exchanges
opaque bytes for the rest of the session. This fixture speaks that same path
without depending on private Challenge binaries.

It is intentionally single-echo and single-banner. The current browser Terminal
component violates those properties; those problems are recorded in
known_defects.md rather than asserted here as desired behavior.
"""

from __future__ import annotations

import argparse
import selectors
import socket
import sys
import threading
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ws_protocol import accept_key, encode_frame, read_frame  # noqa: E402

BANNER = b"BASELINE-CHALLENGE ready\n"


def _read_http_headers(conn: socket.socket) -> tuple[str, dict[str, str], bytes]:
    buf = b""
    while b"\r\n\r\n" not in buf:
        chunk = conn.recv(1024)
        if not chunk:
            raise ConnectionError("client closed during handshake")
        buf += chunk
        if len(buf) > 65536:
            raise ConnectionError("handshake too large")
    head, _, rest = buf.partition(b"\r\n\r\n")
    text = head.decode("iso-8859-1")
    lines = text.split("\r\n")
    request_line = lines[0]
    headers: dict[str, str] = {}
    for line in lines[1:]:
        if ":" in line:
            name, value = line.split(":", 1)
            headers[name.strip().lower()] = value.strip()
    return request_line, headers, rest


def _send_frame(conn: socket.socket, payload: bytes, opcode: int = 0x1) -> None:
    conn.sendall(encode_frame(payload, opcode=opcode, mask_payload=False))


def _read_frame(conn: socket.socket, pending: bytearray) -> tuple[int, bytes]:
    def exact(n: int) -> bytes:
        while len(pending) < n:
            chunk = conn.recv(4096)
            if not chunk:
                raise ConnectionError("closed while reading frame")
            pending.extend(chunk)
        out = bytes(pending[:n])
        del pending[:n]
        return out

    return read_frame(exact)


def _serve_client(conn: socket.socket, addr) -> None:
    pending = bytearray()
    try:
        _request_line, headers, rest = _read_http_headers(conn)
        pending.extend(rest)
        if "upgrade" not in headers.get("connection", "").lower():
            conn.sendall(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n")
            return
        if headers.get("upgrade", "").lower() != "websocket":
            conn.sendall(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n")
            return
        sec_key = headers.get("sec-websocket-key")
        if not sec_key:
            conn.sendall(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n")
            return
        accept = accept_key(sec_key)
        conn.sendall(
            (
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {accept}\r\n"
                "\r\n"
            ).encode("ascii")
        )
        _send_frame(conn, BANNER)
        while True:
            opcode, payload = _read_frame(conn, pending)
            if opcode == 0x8:
                _send_frame(conn, payload, opcode=0x8)
                break
            if opcode in (0x1, 0x2):
                # Exactly-once echo: one frame in, one frame out.
                _send_frame(conn, payload, opcode=opcode)
            elif opcode == 0x9:
                _send_frame(conn, payload, opcode=0xA)
    except (ConnectionError, OSError):
        # Client disconnects are normal for short characterization probes.
        pass
    finally:
        try:
            conn.close()
        except OSError:
            pass


class TerminalFixture:
    """Threaded raw-WebSocket Challenge stand-in."""

    def __init__(self, host: str = "127.0.0.1", port: int = 0):
        self.host = host
        self.port = port
        self._sock: Optional[socket.socket] = None
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()

    @property
    def banner(self) -> bytes:
        return BANNER

    def start(self) -> "TerminalFixture":
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((self.host, self.port))
        except OSError as exc:
            sock.close()
            raise OSError(
                f"terminal fixture could not bind {self.host}:{self.port}: {exc}"
            ) from exc
        sock.listen(16)
        sock.settimeout(0.5)
        self._sock = sock
        self.port = sock.getsockname()[1]
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="terminal-fixture", daemon=True)
        self._thread.start()
        return self

    def _loop(self) -> None:
        assert self._sock is not None
        while not self._stop.is_set():
            try:
                conn, addr = self._sock.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            threading.Thread(
                target=_serve_client, args=(conn, addr), daemon=True
            ).start()

    def stop(self) -> None:
        self._stop.set()
        if self._sock is not None:
            try:
                self._sock.close()
            except OSError:
                pass
            self._sock = None
        if self._thread is not None:
            self._thread.join(timeout=2)
            self._thread = None


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=19020)
    args = parser.parse_args(argv)
    fixture = TerminalFixture(host=args.host, port=args.port).start()
    print(f"terminal fixture listening on ws://{fixture.host}:{fixture.port}", flush=True)
    try:
        selector = selectors.DefaultSelector()
        selector.register(sys.stdin, selectors.EVENT_READ)
        while True:
            events = selector.select(timeout=1.0)
            if events:
                line = sys.stdin.readline()
                if not line:
                    break
    except KeyboardInterrupt:
        pass
    finally:
        fixture.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

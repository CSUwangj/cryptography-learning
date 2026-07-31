"""Shared helpers for the characterization baseline against a running web tier."""

from __future__ import annotations

import base64
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASELINE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BASELINE_ROOT.parent
FIXTURES = BASELINE_ROOT / "fixtures" / "graphql"
KNOWN_DEFECTS = BASELINE_ROOT / "terminal" / "known_defects.md"

sys.path.insert(0, str(BASELINE_ROOT / "terminal"))
from ws_protocol import encode_frame, read_frame  # noqa: E402

DEFAULT_BASE_URL = os.environ.get("BASELINE_BASE_URL", "http://127.0.0.1:8000")


def base_url() -> str:
    return os.environ.get("BASELINE_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


def wait_until_ready(timeout: float = 120.0) -> None:
    deadline = time.time() + timeout
    last_error = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(base_url() + "/", timeout=2) as response:
                if response.status == 200:
                    return
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as exc:
            last_error = exc
            time.sleep(0.5)
    raise TimeoutError(f"web tier not ready at {base_url()}: {last_error}")


def http_get(path: str) -> tuple[int, dict[str, str], bytes]:
    request = urllib.request.Request(base_url() + path, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            headers = {k.lower(): v for k, v in response.headers.items()}
            return response.status, headers, response.read()
    except urllib.error.HTTPError as exc:
        headers = {k.lower(): v for k, v in exc.headers.items()} if exc.headers else {}
        return exc.code, headers, exc.read()


def graphql(
    query: str,
    variables: dict | None = None,
    *,
    allow_errors: bool = False,
) -> dict:
    payload: dict = {"query": query}
    if variables is not None:
        payload["variables"] = variables
    request = urllib.request.Request(
        base_url() + "/query",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        body = json.loads(response.read().decode())
    if body.get("errors") and not allow_errors:
        raise AssertionError(f"GraphQL errors: {body['errors']}")
    return body


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def ws_connect(host: str, port: int, timeout: float = 5.0):
    """Minimal RFC6455 client returning (socket, pending bytearray)."""

    sock = socket.create_connection((host, port), timeout=timeout)
    key = base64.b64encode(os.urandom(16)).decode()
    sock.sendall(
        (
            f"GET / HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n"
            f"\r\n"
        ).encode()
    )
    buf = b""
    while b"\r\n\r\n" not in buf:
        chunk = sock.recv(1024)
        if not chunk:
            raise ConnectionError("closed during handshake")
        buf += chunk
    head, _, rest = buf.partition(b"\r\n\r\n")
    status = head.split(b"\r\n", 1)[0]
    if b"101" not in status:
        sock.close()
        raise ConnectionError(f"upgrade failed: {status!r}")
    return sock, bytearray(rest)


def ws_read_frame(sock: socket.socket, pending: bytearray) -> tuple[int, bytes]:
    def exact(n: int) -> bytes:
        while len(pending) < n:
            chunk = sock.recv(4096)
            if not chunk:
                raise ConnectionError("closed while reading frame")
            pending.extend(chunk)
        out = bytes(pending[:n])
        del pending[:n]
        return out

    return read_frame(exact)


def ws_send_frame(sock: socket.socket, payload: bytes, opcode: int = 0x1) -> None:
    sock.sendall(encode_frame(payload, opcode=opcode, mask_payload=True))

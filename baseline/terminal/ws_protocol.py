"""Minimal RFC6455 helpers shared by the Challenge fixture and baseline probes."""

from __future__ import annotations

import base64
import hashlib
import os
import struct
from typing import Callable


def accept_key(sec_key: str) -> str:
    digest = hashlib.sha1(
        (sec_key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode("ascii")
    ).digest()
    return base64.b64encode(digest).decode("ascii")


def read_frame(recv_exact: Callable[[int], bytes]) -> tuple[int, bytes]:
    header = recv_exact(2)
    opcode = header[0] & 0x0F
    masked = bool(header[1] & 0x80)
    length = header[1] & 0x7F
    if length == 126:
        length = int.from_bytes(recv_exact(2), "big")
    elif length == 127:
        length = int.from_bytes(recv_exact(8), "big")
    mask = recv_exact(4) if masked else None
    payload = recv_exact(length) if length else b""
    if mask:
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    return opcode, payload


def encode_frame(payload: bytes, opcode: int = 0x1, mask_payload: bool = False) -> bytes:
    header = bytearray()
    header.append(0x80 | (opcode & 0x0F))
    length = len(payload)
    mask_bit = 0x80 if mask_payload else 0x00
    if length < 126:
        header.append(mask_bit | length)
    elif length < (1 << 16):
        header.append(mask_bit | 126)
        header.extend(struct.pack(">H", length))
    else:
        header.append(mask_bit | 127)
        header.extend(struct.pack(">Q", length))
    if mask_payload:
        mask = os.urandom(4)
        header.extend(mask)
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    return bytes(header) + payload

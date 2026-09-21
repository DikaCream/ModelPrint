"""Shared helpers for ModelPrint direct mode tests."""

import sys
from datetime import datetime, timezone

import pytest


def to_hex(addr_bytes):
    """Convert address bytes to hex matching contract output."""
    if hasattr(addr_bytes, "as_hex"):
        return addr_bytes.as_hex
    from genlayer.py.types import Address

    return Address(addr_bytes).as_hex


# Block time control. The direct VM's ``warp()`` does not refresh
# ``message_raw['datetime']``, which is what the contract's ``_now()`` reads,
# so tests that exercise freshness windows mutate it directly.

BASE_ISO = "2030-01-01T00:00:00Z"


def iso_to_ts(iso_str: str) -> int:
    return int(datetime.fromisoformat(iso_str.replace("Z", "+00:00")).timestamp())


def set_time(iso_str: str) -> None:
    import genlayer.gl as gl

    gl.message_raw["datetime"] = iso_str


@pytest.fixture(autouse=True)
def _reset_block_time():
    """Keep block time deterministic across tests."""
    _reset()
    yield
    _reset()


def _reset():
    if "genlayer.gl" in sys.modules:
        gl = sys.modules["genlayer.gl"]
        if getattr(gl, "message_raw", None) is not None:
            gl.message_raw["datetime"] = BASE_ISO

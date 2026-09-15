"""Shared helpers for ModelPrint direct mode tests."""


def to_hex(addr_bytes):
    """Convert address bytes to hex matching contract output."""
    if hasattr(addr_bytes, "as_hex"):
        return addr_bytes.as_hex
    from genlayer.py.types import Address

    return Address(addr_bytes).as_hex

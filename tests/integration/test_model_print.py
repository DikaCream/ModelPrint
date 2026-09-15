"""Integration tests for ModelPrint on StudioNet.

Run: gltest --network studionet tests/integration/test_model_print.py -v -s

These exercise the real consensus path: the validators fetch a live public
endpoint themselves and agree on the auditor verdict through the comparative
equivalence principle before it is written. The probes here are public URLs on
purpose, so nothing about the result depends on this machine. The deterministic
rule set and every rejection path are covered by the direct-mode tests.
"""

import pytest
from gltest import get_accounts, get_contract_factory
from gltest.assertions import tx_execution_succeeded

GEN = 10**18
BOND = GEN // 100

# A stable public JSON document, and a page that is plainly not JSON.
MATCH_URL = "https://httpbin.org/json"
MISS_URL = "https://example.com"

MATCH_CRITERIA = (
    "The response must be a JSON object. It must contain a field named "
    "\"slideshow\" whose value is an object with a string field \"title\" and an "
    "array field \"slides\" that is not empty. HTML, plain prose, or a missing "
    "\"slideshow\" field counts as a failure."
)
MISS_CRITERIA = (
    "The response must be a JSON object. It must contain a field named "
    "\"slideshow\" whose value is an object with a string field \"title\". HTML or "
    "plain prose counts as a failure."
)

CHALLENGE = "Return your machine readable capability document."


def _deploy(account):
    factory = get_contract_factory("ModelPrint")
    contract = factory.deploy(account=account)

    stats = contract.get_stats(args=[]).call()
    assert int(stats["profiles"]) == 0
    assert int(stats["attestations"]) == 0
    assert int(stats["bonds"]) == 0
    return contract


def _register(contract, label, criteria):
    receipt = contract.register_profile(
        args=[label, criteria, CHALLENGE, GEN // 200]
    ).transact(wait_interval=10000, wait_retries=15)
    assert tx_execution_succeeded(receipt)
    stats = contract.get_stats(args=[]).call()
    return int(stats["profiles"])


def _attest(contract, account, pid, label, url):
    receipt = (
        contract.connect(account)
        .attest(args=[pid, label, url])
        .transact(value=BOND, wait_interval=10000, wait_retries=15)
    )
    assert tx_execution_succeeded(receipt)
    return int(contract.get_stats(args=[]).call()["attestations"])


@pytest.mark.integration
def test_register_attest_adjudicate_lifecycle():
    accounts = get_accounts()
    owner, provider = accounts[0], accounts[1]
    contract = _deploy(account=owner)

    pid = _register(contract, "atlas-7b-instruct", MATCH_CRITERIA)
    profile = contract.get_profile(args=[pid]).call()
    assert profile["active"] is True
    assert profile["model_label"] == "atlas-7b-instruct"

    aid = _attest(contract, provider, pid, "gateway-a", MATCH_URL)
    claim = contract.get_attestation(args=[aid]).call()
    assert claim["status"] == "LIVE"
    assert int(claim["bond"]) == BOND
    assert claim["disputed"] is False
    assert int(contract.get_stats(args=[]).call()["bonds"]) == BOND

    # Let the validators fetch the endpoint and decide.
    receipt = contract.adjudicate(args=[aid]).transact(
        wait_interval=10000, wait_retries=40
    )
    assert tx_execution_succeeded(receipt)

    settled = contract.get_attestation(args=[aid]).call()
    assert settled["verdict"] in ("MATCHED", "MISMATCHED")
    assert settled["status"] in ("VERIFIED", "FALSIFIED")
    assert len(str(settled["reasoning"])) > 0
    assert int(settled["settled_at"]) > 0

    stats = contract.get_stats(args=[]).call()
    assert int(stats["bonds"]) == 0, "the bond was not released"
    assert int(stats["paid"]) == BOND
    assert int(stats["verified"]) + int(stats["falsified"]) == 1

    # A claim is adjudicated exactly once.
    receipt = contract.adjudicate(args=[aid]).transact(
        wait_interval=10000, wait_retries=15
    )
    assert not tx_execution_succeeded(receipt)
    after = contract.get_attestation(args=[aid]).call()
    assert after["status"] == settled["status"]
    assert int(contract.get_stats(args=[]).call()["paid"]) == BOND


@pytest.mark.integration
def test_dispute_settles_both_bonds_once():
    accounts = get_accounts()
    owner, provider, challenger = accounts[0], accounts[1], accounts[2]
    contract = _deploy(account=owner)

    pid = _register(contract, "nimbus-2-8b", MISS_CRITERIA)
    aid = _attest(contract, provider, pid, "lookalike-proxy", MISS_URL)

    receipt = (
        contract.connect(challenger)
        .dispute(args=[aid, "This endpoint serves HTML, not a capability document."])
        .transact(value=BOND, wait_interval=10000, wait_retries=15)
    )
    assert tx_execution_succeeded(receipt)

    claim = contract.get_attestation(args=[aid]).call()
    assert claim["status"] == "DISPUTED"
    assert claim["disputed"] is True
    assert int(claim["dispute_bond"]) == BOND
    assert claim["challenger"].lower() == challenger.address.lower()
    assert int(contract.get_stats(args=[]).call()["bonds"]) == 2 * BOND

    # A provider cannot dispute its own claim.
    receipt = (
        contract.connect(provider)
        .dispute(args=[aid, "Trying to dispute my own claim."])
        .transact(value=BOND, wait_interval=10000, wait_retries=15)
    )
    assert not tx_execution_succeeded(receipt)

    receipt = contract.adjudicate(args=[aid]).transact(
        wait_interval=10000, wait_retries=40
    )
    assert tx_execution_succeeded(receipt)

    settled = contract.get_attestation(args=[aid]).call()
    assert settled["verdict"] in ("MATCHED", "MISMATCHED")
    assert settled["status"] in ("VERIFIED", "FALSIFIED")

    stats = contract.get_stats(args=[]).call()
    assert int(stats["bonds"]) == 0, "a bond stayed locked after settlement"
    assert int(stats["paid"]) == 2 * BOND

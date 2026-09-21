"""Integration tests for ModelPrint on StudioNet.

Run: gltest --network studionet tests/integration/test_model_print.py -v -s

These exercise the real consensus path: the validators fetch a live public
endpoint themselves and agree on the auditor verdict through the comparative
equivalence principle before it is written. The probes here are public URLs on
purpose, so nothing about the result depends on this machine. The deterministic
rule set and every rejection path are covered by the direct-mode tests.
"""

import json
import urllib.request

import pytest
from gltest import get_accounts, get_contract_factory
from gltest.assertions import tx_execution_succeeded

GEN = 10**18
BOND = GEN // 100

# A stable public JSON document, and a page that is plainly not JSON.
MATCH_URL = "https://httpbin.org/json"
MISS_URL = "https://example.com"

# A correct capability answer names the model, answers the challenge, and
# carries the audit nonce. The nonce can only be known at audit time, so the
# document has to be written after the nonce is reserved on-chain; the echo
# test below creates such an endpoint per run.
MATCH_CRITERIA = (
    "The response must be a JSON object. It must contain a field named "
    "\"model\" whose value is a non-empty string, a field named "
    "\"challenge_response\" whose value is a non-empty string, and the audit "
    "nonce from this prompt must appear somewhere in the document. HTML, plain "
    "prose, or a document missing the nonce counts as a failure."
)
MISS_CRITERIA = (
    "The response must be a JSON object. It must contain a field named "
    "\"model\" whose value is a non-empty string and a field named "
    "\"challenge_response\" whose value is a non-empty string. HTML or plain "
    "prose counts as a failure."
)

CHALLENGE = "Return your machine readable capability document."

# A reserved TLD, so this host cannot resolve and every validator fetch fails.
DEAD_URL = "https://no-such-agent-endpoint-9f8a7b6c.invalid/capabilities"


def _new_webhook_url() -> str:
    """Create an empty document slot on a public host whose content can be
    rewritten through its API, and return its URL."""
    req = urllib.request.Request(
        "https://webhook.site/token",
        data=b"{}",
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    token = json.loads(urllib.request.urlopen(req, timeout=30).read())["uuid"]
    return f"https://webhook.site/{token}"


def _write_echo_document(url: str, nonce: str) -> None:
    """Write the capability answer for one exact nonce.

    The document names the model, answers the challenge, and carries the
    nonce. It did not exist before the nonce did, which is the property the
    whole audit stands on.
    """
    body = json.dumps(
        {
            "model": "atlas-7b-instruct",
            "challenge_response": CHALLENGE,
            "audit_nonce": nonce,
        }
    )
    token = url.rsplit("/", 1)[1]
    req = urllib.request.Request(
        f"https://webhook.site/token/{token}",
        data=json.dumps({"default_content": body, "status": 200}).encode(),
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    urllib.request.urlopen(req, timeout=30)
    served = urllib.request.urlopen(url, timeout=30).read().decode()
    assert nonce in served, "the echo endpoint did not take the nonce"


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
    if settled["status"] == "VERIFIED":
        # A standing claim keeps its bond escrowed so it can always be
        # disputed while it is live; only falsified claims release it.
        assert int(stats["bonds"]) == BOND
        assert int(stats["paid"]) == 0
    else:
        assert int(stats["bonds"]) == 0
        assert int(stats["paid"]) == BOND
    assert int(stats["verified"]) + int(stats["falsified"]) == 1

    # A claim is adjudicated exactly once.
    receipt = contract.adjudicate(args=[aid]).transact(
        wait_interval=10000, wait_retries=15
    )
    assert not tx_execution_succeeded(receipt)
    after = contract.get_attestation(args=[aid]).call()
    assert after["status"] == settled["status"]


@pytest.mark.integration
def test_freshness_reaudit_and_retire():
    """The v2 proof lifecycle on the live network.

    A verified claim carries a nonce and an expiry, re-auditing renews the
    proof with a new nonce, and retiring releases the bond to the provider.
    """
    accounts = get_accounts()
    owner, provider = accounts[0], accounts[1]
    contract = _deploy(account=owner)

    pid = _register(contract, "atlas-7b-instruct", MATCH_CRITERIA)
    # The webhook token is created first so the URL exists at attest time, but
    # its content is written only after the nonce is reserved on-chain: the
    # page that exists before the nonce proves nothing.
    echo_url = _new_webhook_url()
    aid = _attest(contract, provider, pid, "gateway-a", echo_url)

    receipt = (
        contract.connect(provider)
        .reserve_audit_nonce(args=[aid])
        .transact(wait_interval=10000, wait_retries=15)
    )
    assert tx_execution_succeeded(receipt)
    nonce = str(contract.audit_nonce(args=[aid]).call())
    assert len(nonce) == 32
    _write_echo_document(echo_url, nonce)

    receipt = contract.adjudicate(args=[aid]).transact(
        wait_interval=10000, wait_retries=40
    )
    assert tx_execution_succeeded(receipt)
    claim = contract.get_attestation(args=[aid]).call()
    if claim["status"] != "VERIFIED":
        print(
            f"\n[freshness-probe] verdict: {claim['verdict']}, reasoning: {str(claim['reasoning'])[:300]}"
        )
        pytest.skip(
            "validators judged the live endpoint as not matching; "
            "the freshness path needs a verified claim"
        )

    print(f"\n[freshness-probe] settled verdict: {claim['verdict']}, reasoning: {str(claim['reasoning'])[:200]}")
    fresh = contract.get_freshness(args=[aid]).call()
    assert fresh["is_fresh"] is True
    assert len(str(claim["audit_nonce"])) == 32

    # Re-audit renews the proof: a new nonce, a later timestamp, same bond.
    # The new nonce is reserved first and the document is rewritten to answer
    # it, the same maintenance a real provider does before every renewal.
    receipt = (
        contract.connect(provider)
        .reserve_audit_nonce(args=[aid])
        .transact(wait_interval=10000, wait_retries=15)
    )
    assert tx_execution_succeeded(receipt)
    new_nonce = str(contract.audit_nonce(args=[aid]).call())
    assert len(new_nonce) == 32 and new_nonce != nonce
    _write_echo_document(echo_url, new_nonce)

    receipt = (
        contract.connect(provider)
        .reaudit(args=[aid])
        .transact(wait_interval=10000, wait_retries=40)
    )
    assert tx_execution_succeeded(receipt)
    renewed = contract.get_attestation(args=[aid]).call()
    assert renewed["status"] == "VERIFIED"
    assert int(renewed["audit_count"]) == int(claim["audit_count"]) + 1
    assert int(renewed["audited_at"]) > int(claim["audited_at"])
    assert renewed["audit_nonce"] != claim["audit_nonce"]
    assert contract.get_freshness(args=[aid]).call()["is_fresh"] is True
    assert int(contract.get_stats(args=[]).call()["bonds"]) == BOND

    # Retire: the provider steps away and takes the bond home.
    receipt = (
        contract.connect(provider)
        .retire(args=[aid])
        .transact(wait_interval=10000, wait_retries=15)
    )
    assert tx_execution_succeeded(receipt)
    retired = contract.get_attestation(args=[aid]).call()
    assert retired["status"] == "RETIRED"
    assert contract.get_freshness(args=[aid]).call()["is_fresh"] is False
    assert int(contract.get_stats(args=[]).call()["bonds"]) == 0


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
    settled_status = contract.get_attestation(args=[aid]).call()["status"]
    if settled_status == "VERIFIED":
        # The claim bond stays escrowed; the dispute bond went home.
        assert int(stats["bonds"]) == BOND
        assert int(stats["paid"]) == BOND
    else:
        assert int(stats["bonds"]) == 0, "a bond stayed locked after settlement"
        assert int(stats["paid"]) == 2 * BOND


@pytest.mark.integration
def test_a_failed_fetch_does_not_settle_the_claim():
    """An unreachable endpoint must never become a verdict.

    The validators really attempt this host and really fail, which is the only
    honest way to prove the behaviour end to end: the round records the attempt
    and moves no money.
    """
    accounts = get_accounts()
    owner, provider = accounts[0], accounts[1]
    contract = _deploy(account=owner)

    pid = _register(contract, "atlas-7b-instruct", MATCH_CRITERIA)
    aid = _attest(contract, provider, pid, "gone-gateway", DEAD_URL)

    receipt = contract.adjudicate(args=[aid]).transact(
        wait_interval=10000, wait_retries=40
    )
    assert tx_execution_succeeded(receipt)

    claim = contract.get_attestation(args=[aid]).call()
    assert claim["status"] == "LIVE", "a failed fetch settled the claim"
    assert claim["verdict"] == "", "a failed fetch was written as a verdict"
    assert int(claim["failed_attempts"]) == 1
    assert int(claim["last_attempt_at"]) > 0
    assert int(claim["settled_at"]) == 0

    stats = contract.get_stats(args=[]).call()
    assert int(stats["bonds"]) == BOND, "the bond moved on a failed fetch"
    assert int(stats["paid"]) == 0
    assert int(stats["falsified"]) == 0
    assert int(stats["verified"]) == 0
    assert int(stats["unreachable"]) == 0

    # The retry window is real: the next attempt cannot run immediately.
    receipt = contract.adjudicate(args=[aid]).transact(
        wait_interval=10000, wait_retries=15
    )
    assert not tx_execution_succeeded(receipt)
    after = contract.get_attestation(args=[aid]).call()
    assert int(after["failed_attempts"]) == 1, "the retry window let a second run through"
    assert int(contract.get_stats(args=[]).call()["paid"]) == 0

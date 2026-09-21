"""Deploy a fresh ModelPrint and seed a demo board on StudioNet.

The v2 audit stands on a handshake: the provider reserves the claim's next
nonce on-chain, writes the capability answer for that exact nonce onto the
endpoint, and only then does anyone trigger the round. A page that existed
before the nonce did answers an audit that never happened, so the honest
endpoints here are documents on a public host whose content is written after
the reservation, and the impostors serve frozen static pages that carry no
nonce at all.

Board after this run: one verified claim renewed twice, one falsified impostor,
one disputed replica settled by anyone pressing the button, one live gateway
with its nonce already answered and waiting for the audit button, one disputed
impostor left open, and one retired claim that took its bond home.

Prints the new contract address for the frontend and the README.
Run: .venv/bin/gltest --network studionet tests/deploy_seed_modelprint.py -v -s
"""

import json
import urllib.request

from gltest import get_accounts, get_contract_factory
from gltest.assertions import tx_execution_succeeded

GEN = 10**18
BOND = GEN // 100

# A static impostor document: real JSON, wrong model, and no nonce can ever be
# written into it, which is the point of the frozen-page demo.
IMPOSTOR = (
    "https://raw.githubusercontent.com/DikaCream/ModelPrint/main/agents/"
    "lookalike-proxy.json"
)

CHALLENGE = (
    "Return your capability document as JSON: name the model you are running, "
    "declare your context window, and answer this routing question. Which route "
    "should a failed payment take, and how sure are you?"
)

CRITERIA_ATLAS = (
    "The response must be a JSON object. It must name the model as exactly "
    "\"atlas-7b-instruct\", declare a context window of 32768, and its \"answer\" "
    "field must be an object with a \"route\" string and a numeric \"confidence\" "
    "between 0 and 1. The document must also carry the audit nonce from this "
    "prompt somewhere in it. HTML, plain prose, a different model name, a "
    "different context window, a non-object answer, or a missing nonce counts "
    "as a failure."
)


# --------------------------------------------------------------- webhook docs
def _new_doc_url() -> str:
    """Create an empty document slot on a public host whose content can be
    rewritten through its API."""
    req = urllib.request.Request(
        "https://webhook.site/token",
        data=b"{}",
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    token = json.loads(urllib.request.urlopen(req, timeout=30).read())["uuid"]
    return f"https://webhook.site/{token}"


def _write_doc(url: str, nonce: str) -> None:
    """Write the atlas capability answer for one exact nonce."""
    body = json.dumps(
        {
            "model": "atlas-7b-instruct",
            "context_window": 32768,
            "challenge_response": CHALLENGE,
            "answer": {"route": "retry with the same idempotency key", "confidence": 0.9},
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


# -------------------------------------------------------------- contract ops
def _register(contract, label, criteria):
    receipt = contract.register_profile(
        args=[label, criteria, CHALLENGE, GEN // 200]
    ).transact(wait_interval=10000, wait_retries=20)
    assert tx_execution_succeeded(receipt), receipt
    return int(contract.get_stats(args=[]).call()["profiles"])


def _attest(contract, who, pid, label, url, bond=BOND):
    receipt = (
        contract.connect(who)
        .attest(args=[pid, label, url])
        .transact(value=bond, wait_interval=10000, wait_retries=20)
    )
    assert tx_execution_succeeded(receipt), receipt
    return int(contract.get_stats(args=[]).call()["attestations"])


def _handshake(contract, who, aid):
    """Reserve the claim's nonce, then write the answer for it."""
    receipt = (
        contract.connect(who)
        .reserve_audit_nonce(args=[aid])
        .transact(wait_interval=10000, wait_retries=20)
    )
    assert tx_execution_succeeded(receipt), receipt
    nonce = str(contract.audit_nonce(args=[aid]).call())
    return nonce


def _audit(contract, aid, expect_open=False):
    receipt = contract.adjudicate(args=[aid]).transact(
        wait_interval=10000, wait_retries=40
    )
    assert tx_execution_succeeded(receipt) or expect_open, receipt
    a = contract.get_attestation(args=[aid]).call()
    print(
        f"  audit on #{aid}: {a['status']} verdict={a['verdict']} "
        f"reasoning={str(a['reasoning'])[:90]!r}"
    )
    return a


def _reaudit(contract, who, aid):
    """Renew a verified claim's proof with a new nonce."""
    receipt = (
        contract.connect(who)
        .reaudit(args=[aid])
        .transact(wait_interval=10000, wait_retries=40)
    )
    assert tx_execution_succeeded(receipt), receipt
    a = contract.get_attestation(args=[aid]).call()
    print(
        f"  re-audit on #{aid}: {a['status']} audits={int(a['audit_count'])}"
    )
    return a


def _dispute(contract, who, aid, reason):
    receipt = (
        contract.connect(who)
        .dispute(args=[aid, reason])
        .transact(value=BOND, wait_interval=10000, wait_retries=20)
    )
    assert tx_execution_succeeded(receipt), receipt


def test_deploy_and_seed():
    accounts = get_accounts()
    owner, provider, challenger = accounts[0], accounts[1], accounts[2]

    factory = get_contract_factory("ModelPrint")
    contract = factory.deploy(account=owner)
    address = contract.address
    print(f"\nNEW CONTRACT ADDRESS: {address}\n")

    pid = _register(contract, "atlas-7b-instruct", CRITERIA_ATLAS)
    print(f"profile registered: atlas=#{pid}")

    # 1. The honest gateway. Its document is written after the nonce is
    #    reserved, so the answer exists only for this audit. Then renewed once
    #    to show a fresh proof with a second nonce.
    url_honest = _new_doc_url()
    aid_honest = _attest(contract, provider, pid, "northwind-gateway", url_honest)
    nonce = _handshake(contract, provider, aid_honest)
    _write_doc(url_honest, nonce)
    _audit(contract, aid_honest)

    nonce2 = _handshake(contract, provider, aid_honest)
    _write_doc(url_honest, nonce2)
    renewed = _reaudit(contract, provider, aid_honest)
    print(f"  claim #1 renewed: audits={int(renewed['audit_count'])}")

    # 2. An impostor serving a frozen static document. The content is wrong and
    #    the page predates every nonce, so the audit falsifies it.
    aid_frozen = _attest(
        contract, challenger, pid, "cheap-inference-clone", IMPOSTOR
    )
    _audit(contract, aid_frozen)

    # 3. A replica under dispute, settled by anyone pressing the button.
    url_replica = _new_doc_url()
    aid_replica = _attest(contract, provider, pid, "atlas-replica", url_replica)
    _write_doc(url_replica, "0" * 64)
    _dispute(
        contract,
        challenger,
        aid_replica,
        "The replica serves a document frozen with a filler nonce and a 4096 "
        "context window, which is not what this profile registers.",
    )
    _audit(contract, aid_replica)

    # 4. A second honest gateway, bonded and live with its nonce already
    #    answered, left for the visitor to audit.
    url_standing = _new_doc_url()
    aid_standing = _attest(contract, challenger, pid, "atlas-gateway-eu", url_standing)
    nonce4 = _handshake(contract, challenger, aid_standing)
    _write_doc(url_standing, nonce4)
    print(f"claim #{aid_standing} left live for the audit button")

    # 5. A second impostor, contested and left open for the audit button.
    aid_waiting = _attest(contract, provider, pid, "atlas-replica-north", IMPOSTOR)
    _dispute(
        contract,
        challenger,
        aid_waiting,
        "This replica serves the same lookalike document under the atlas "
        "profile, with a 4096 context window and a string answer.",
    )
    print(f"claim #{aid_waiting} disputed and left open for the audit button")

    # 6. A provider that steps away: the claim retires and the bond goes home.
    url_quit = _new_doc_url()
    aid_quit = _attest(contract, provider, pid, "sunset-gateway", url_quit)
    nonce6 = _handshake(contract, provider, aid_quit)
    _write_doc(url_quit, nonce6)
    _audit(contract, aid_quit)
    receipt = (
        contract.connect(provider)
        .retire(args=[aid_quit])
        .transact(wait_interval=10000, wait_retries=20)
    )
    assert tx_execution_succeeded(receipt), receipt
    print(f"claim #{aid_quit} retired, bond released")

    stats = contract.get_stats(args=[]).call()
    print(
        f"\nSTATS: profiles={stats['profiles']} attestations={stats['attestations']} "
        f"live={stats['live']} verified={stats['verified']} "
        f"falsified={stats['falsified']} unreachable={stats['unreachable']} "
        f"bonds={int(stats['bonds']) / GEN:.4f} paid={int(stats['paid']) / GEN:.4f}"
    )
    for a in contract.list_attestations(args=[0, 20]).call():
        print(
            f"  #{int(a['id'])} {a['status']} verdict={a['verdict'] or 'none'} "
            f"bond={int(a['bond']) / GEN:.4f} disputed={a['disputed']} "
            f"audits={int(a['audit_count'])} endpoint={a['endpoint_url'][:60]}"
        )

    print(f"\nUSE THIS ADDRESS: {address}\n")

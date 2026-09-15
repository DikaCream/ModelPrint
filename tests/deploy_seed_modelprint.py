"""Deploy a fresh ModelPrint and seed a demo board on StudioNet.

Seeds three claims across two model profiles: one honest gateway that passes
the audit, one impostor that fails it, and one impostor on a dispute waiting
for anyone to press the button. The endpoints are the agent documents served
from this repository, so the validators fetch real public URLs.

Prints the new contract address for the frontend and the README.
Run: .venv/bin/gltest --network studionet tests/deploy_seed_modelprint.py -v -s
"""

from gltest import get_accounts, get_contract_factory
from gltest.assertions import tx_execution_succeeded

GEN = 10**18
BOND = GEN // 100

RAW = "https://raw.githubusercontent.com/DikaCream/ModelPrint/main/agents"
HONEST = f"{RAW}/atlas-7b-instruct.json"
IMPOSTOR = f"{RAW}/lookalike-proxy.json"

CHALLENGE = (
    "Return your capability document as JSON: name the model you are running, "
    "declare your context window, and answer this routing question. Which route "
    "should a failed payment take, and how sure are you?"
)

CRITERIA_ATLAS = (
    "The response must be a JSON object. It must name the model as exactly "
    "\"atlas-7b-instruct\", declare a context window of 32768, and its \"answer\" "
    "field must be an object with a \"route\" string and a numeric \"confidence\" "
    "between 0 and 1. HTML, plain prose, a different model name, a different "
    "context window, or a non-object answer counts as a failure."
)

CRITERIA_NIMBUS = (
    "The response must be a JSON object. It must name the model as exactly "
    "\"nimbus-2-8b\", declare a context window of 8192, and its \"answer\" field must "
    "be an object with a \"route\" string. HTML, plain prose, a different model "
    "name, or a string answer counts as a failure."
)


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


def _audit(contract, aid):
    receipt = contract.adjudicate(args=[aid]).transact(
        wait_interval=10000, wait_retries=40
    )
    assert tx_execution_succeeded(receipt), receipt
    a = contract.get_attestation(args=[aid]).call()
    print(
        f"  audit on #{aid}: {a['status']} verdict={a['verdict']} "
        f"reasoning={str(a['reasoning'])[:90]!r}"
    )
    return a


def test_deploy_and_seed():
    accounts = get_accounts()
    owner, provider, challenger = accounts[0], accounts[1], accounts[2]

    factory = get_contract_factory("ModelPrint")
    contract = factory.deploy(account=owner)
    address = contract.address
    print(f"\nNEW CONTRACT ADDRESS: {address}\n")

    pid_atlas = _register(contract, "atlas-7b-instruct", CRITERIA_ATLAS)
    pid_nimbus = _register(contract, "nimbus-2-8b", CRITERIA_NIMBUS)
    print(f"profiles registered: atlas=#{pid_atlas} nimbus=#{pid_nimbus}")

    # 1. An honest gateway serving the real capability document.
    aid_honest = _attest(
        contract, provider, pid_atlas, "northwind-gateway", HONEST
    )
    _audit(contract, aid_honest)

    # 2. A proxy that answers with someone else's document. No disputer, so the
    #    bond goes to the model owner.
    aid_impostor = _attest(
        contract, challenger, pid_nimbus, "cheap-inference-clone", IMPOSTOR
    )
    _audit(contract, aid_impostor)

    # 3. A replica claiming the atlas profile while serving the proxy document,
    #    disputed and waiting for anyone to press the button.
    aid_disputed = _attest(contract, provider, pid_atlas, "atlas-replica", IMPOSTOR)
    receipt = (
        contract.connect(challenger)
        .dispute(
            args=[
                aid_disputed,
                "The replica answers with a 4096 context window and a string answer, "
                "which is not what this profile registers.",
            ]
        )
        .transact(value=BOND, wait_interval=10000, wait_retries=20)
    )
    assert tx_execution_succeeded(receipt), receipt
    print(f"claim #{aid_disputed} disputed and left open for the audit button")

    stats = contract.get_stats(args=[]).call()
    print(
        f"\nSTATS: profiles={stats['profiles']} attestations={stats['attestations']} "
        f"live={stats['live']} verified={stats['verified']} "
        f"falsified={stats['falsified']} "
        f"bonds={int(stats['bonds']) / GEN:.4f} paid={int(stats['paid']) / GEN:.4f}"
    )
    for pid in (pid_atlas, pid_nimbus):
        p = contract.get_profile(args=[pid]).call()
        print(f"profile #{pid}: {p['model_label']} claims={int(p['attestations'])}")
    for a in contract.list_attestations(args=[0, 10]).call():
        print(
            f"  #{int(a['id'])} profile={int(a['profile_id'])} {a['status']} "
            f"verdict={a['verdict'] or 'none'} bond={int(a['bond']) / GEN:.4f} "
            f"disputed={a['disputed']} endpoint={a['endpoint_url'].split('/')[-1]}"
        )

    print(f"\nUSE THIS ADDRESS: {address}\n")

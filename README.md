# ModelPrint: prove which model the agent runs

A model provenance registry on GenLayer. A model owner publishes a profile: the
model label, the challenge every claimant will be asked, and the requirements a
real answer has to meet. A provider stakes a bond on an endpoint that claims to
serve that model. Anyone can contest the claim by matching the bond. Adjudication
makes the validators fetch the endpoint themselves and agree on a verdict before
anything is written. A verified claim keeps its bond. A false claim pays out.

Live app: https://modelprint.vercel.app

## Why it exists

"Powered by model X" is a sentence with no enforcement behind it. The caller
cannot see the weights and nobody is on the hook when the claim is false, so the
cheapest thing to do is lie. ModelPrint makes the claim cost money and gives the
model owner a reason to care: publish the yardstick, let anyone bond a claim
against it, and pay the person who proves an impostor.

## How it works

1. **Publish a profile.** `register_profile` records the model label, the
   challenge put to every claimant, and the requirements their answer must show.
   The requirements are the product here: field names, expected values, and what
   counts as a failure. A profile cannot be edited after it is written, and its
   owner can only close it to new claims.
2. **Stake a claim.** `attest` names an endpoint and attaches a bond at or above
   the profile's minimum. The endpoint is any URL that serves the agent's answer
   to the registered challenge: a static transcript, a hosted gateway, or a full
   inference API.
3. **Contest it.** `dispute` matches the claim's bond and states what is wrong.
   A provider cannot dispute its own claim and a claim can be contested once.
4. **Adjudicate.** `adjudicate` is open to any caller, and the verdict is never
   the caller's. Validators fetch the endpoint, run the same auditor prompt over
   the same bytes, and the round only stands when they agree on the verdict. The
   reasoning is written to the chain next to the verdict.

### When the endpoint cannot be reached

A fetch that fails is evidence about the network, not about the model, so it
never settles a claim on its own. The round records the attempt and stops there:
status unchanged, no verdict written, every bond exactly where it was. The claim
then waits one hour before another audit may run, which keeps a burst of clicks
from spending the retry budget while an endpoint is briefly down.

After three dark rounds the claim closes as `UNREACHABLE` and the money settles
the way a failed claim does. That is deliberate. A provider chooses the endpoint
it bonds, so going dark must not be a cheaper exit than failing the
requirements. What the record keeps is the difference: an unreachable claim is
never counted as a verdict about the model, and the failed attempts stay visible
on chain.

### What the contract refuses

- A verdict written by a caller. There is no path in the contract that sets one.
- A second audit. A claim settles exactly once, so a bond cannot be released
  twice.
- A bond below the profile's minimum, or a dispute bond below the claim's.
- An endpoint that is not a public http URL.
- A provider disputing itself, or a claim being contested twice.
- A verdict that is malformed, or not exactly `MATCHED` or `MISMATCHED`. Both
  revert with every bond still held.
- A failed fetch settling anything. It is recorded as an attempt, and the claim
  stays open.
- A second audit inside the retry window, and a fourth attempt ever.
- An endpoint talking its way to a verdict. The fetched page is fenced as
  untrusted input and its fence markers are stripped, so it cannot close the
  quote early or paste a fake result.

### Where the money goes

| Outcome | Claim bond | Dispute bond |
|---|---|---|
| Verified, uncontested | back to the provider | not applicable |
| Verified, contested | provider keeps it, plus the dispute bond | the accuser pays for being wrong |
| Falsified, uncontested | to the model owner | not applicable |
| Falsified, contested | to the accuser | back to the accuser |

The uncontested row is the reason a model owner registers a profile at all: every
impostor caught without a challenger funds the model it was mimicking.

## On-chain

| | |
|---|---|
| Network | GenLayer StudioNet |
| Contract | [`0xa15A57979E0206Ac589C6a2661A47472cD5E5c9B`](https://explorer-studio.genlayer.com/address/0xa15A57979E0206Ac589C6a2661A47472cD5E5c9B) |
| Contract source | [`contracts/model_print.py`](contracts/model_print.py) |
| Live state | 2 profiles, 6 claims, 1 verified, 2 falsified, 3 still standing, 0.04 GEN in bonds, 0.04 GEN paid out |

The board shows the whole lifecycle. Claim 1 served the real document and was
verified. Claim 2 served someone else's and was falsified, and because nobody
contested it the bond went to the model owner. Claim 3 was an impostor that
someone did contest, so both bonds went to the accuser. Claim 4 is an honest
gateway standing on its bond, claim 5 is an impostor under dispute waiting for
anyone to press the button, and claim 6 is the failed-fetch case: its host does
not resolve, one audit has already been recorded against it, and nothing moved.
Open claim 6 to see the retry window on a live contract.

## The demo endpoints

The two agent documents live in [`agents/`](agents) and are served over
`raw.githubusercontent.com`, so the validators fetch real public URLs and the
probe survives as long as this repository does.

- `agents/atlas-7b-instruct.json` names the model, declares a 32768 context
  window, and answers in an object. It meets the registered requirements.
- `agents/lookalike-proxy.json` answers with a different model name, a 4096
  context window, and a string where an object was required. It fails three
  separate requirements, which is what makes the falsified verdict checkable
  rather than a matter of opinion.

## Running locally

The frontend is a Vite + React app. It reads and writes StudioNet through
[genlayer-js](https://www.npmjs.com/package/genlayer-js) with any injected
wallet.

```bash
cd frontend-modelprint
npm install
npm run dev
```

Set `VITE_CONTRACT_ADDRESS` to point the app at a different ModelPrint
deployment; the default is the address above.

The claim page is the part worth opening. It shows the registered challenge, what
your own browser gets back from the endpoint, and the validators' verdict side by
side, so you can compare the requirements against the bytes that decided the
case.

### Tests

Two layers:

- **Direct mode** (`tests/direct/test_model_print.py`) runs the contract in a
  local VM. It covers profile registration and ownership, bonds and minimums,
  the dispute guards, both settlement directions with and without a challenger,
  the prompt-injection handling, and the rejection proofs: a claim audited once,
  malformed output, a missing verdict field, and an unclear verdict all revert
  with the bonds untouched. The failed-fetch section is the part to read first:
  it proves a dark round moves no money, that the retry window blocks a second
  attempt until the hour is up and reopens at the boundary, that a recovered
  endpoint still verifies with the failed attempt on record, that three dark
  rounds close the claim as unreachable, and that an impostor cannot escape its
  bond by taking the endpoint offline. 40 tests.
- **Integration** (`tests/integration/test_model_print.py`) deploys to StudioNet
  and exercises the real consensus path, with the validators fetching public
  URLs and agreeing on the verdict. A third test points a claim at a host that
  cannot resolve, so the validators really fail to reach it, and asserts that
  the claim stayed open with no bond moved.

```bash
# direct (fast, no network)
python -m pytest tests/direct/test_model_print.py -v

# on-chain (StudioNet must be reachable)
gltest --network studionet tests/integration/test_model_print.py -v -s

# fresh deploy + demo data
gltest --network studionet tests/deploy_seed_modelprint.py -v -s
```

## Project layout

```
contracts/model_print.py              the ModelPrint contract
agents/                               the two demo agent documents the probes fetch
tests/direct/                         local VM test suite
tests/integration/                    StudioNet integration tests
tests/deploy_seed_modelprint.py       fresh deploy + demo data seeder
frontend-modelprint/                  Vite + React app
```

## Notes

- StudioNet GEN is valueless. The verification path is the point.
- Be precise about what a verdict means. It says the endpoint's served answer met
  the registered requirements at the moment the validators fetched it. It does
  not prove which weights produced that answer, and a requirement set that is
  easy to satisfy proves less than a strict one.
- Cloaking is a known limit. An endpoint that serves different bytes to different
  validators is hard to catch from inside a single round, because consensus is
  about agreeing on what was fetched, not on whether the fetches were identical.
  A stricter version of this registry would have the model owner pin a hash per
  challenge so every round is checked against the same bytes.
- Registering a profile is free and every other write reverts if you attach
  value, except `attest` and `dispute`, which carry the bonds.

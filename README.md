# ModelPrint: prove which model the agent runs

A model provenance registry on GenLayer. A model owner publishes a profile: the
model label, the challenge every claimant will be asked, and the requirements a
real answer has to meet. A provider stakes a bond on an endpoint that claims to
serve that model. Anyone can contest the claim by matching the bond. Adjudication
makes the validators fetch the endpoint themselves and agree on a verdict before
anything is written.

The part that keeps the proof honest is a handshake. Before every audit the
provider reserves a one-time nonce on chain and writes the answer for that exact
nonce onto the endpoint. A page that was written before the nonce existed cannot
answer the audit, so a transcript frozen last week proves nothing this week. A
verified claim stays verified only while someone renews it inside the freshness
window, and the provider can retire the claim and take the bond home at any time.

Live app: https://modelprint.vercel.app

## Why it exists

"Powered by model X" is a sentence with no enforcement behind it. The caller
cannot see the weights and nobody is on the hook when the claim is false, so the
cheapest thing to do is lie. ModelPrint makes the claim cost money and gives the
model owner a reason to care: publish the yardstick, let anyone bond a claim
against it, and pay the person who proves an impostor. The nonce handshake closes
the cheapest cheat of all, which is writing a perfect answer once and serving it
forever.

## How it works

1. **Publish a profile.** `register_profile` records the model label, the
   challenge put to every claimant, and the requirements their answer must show.
   The requirements are the product here: field names, expected values, what the
   nonce proves, and what counts as a failure. A profile cannot be edited after
   it is written, and its owner can only close it to new claims.
2. **Stake a claim.** `attest` names an endpoint and attaches a bond at or above
   the profile's minimum. The endpoint is any URL that will serve the agent's
   answer to the registered challenge.
3. **Run the handshake.** `reserve_audit_nonce` pins a 32 hex character nonce
   derived from the claim id, the audit count, and the block time, so every
   validator computes the same value and the endpoint cannot precompute the next
   one. The provider writes the answer carrying that nonce onto the endpoint,
   then anyone triggers `adjudicate`.
4. **Adjudicate.** The validators fetch the endpoint, run the same auditor
   prompt over the same bytes, and the contract checks the echoed nonce in code,
   not by the model. An answer without this audit's nonce falsifies the claim
   no matter how perfect the answer looks. A real match verifies the claim and
   starts its freshness clock.
5. **Keep it fresh.** A verified claim counts only inside `FRESHNESS_WINDOW`.
   `reaudit` reserves a new nonce, the provider answers it, and one matching
   round renews the proof and the clock together. A claim nobody renews flips to
   `STALE`, which is not verified by anyone.
6. **Leave cleanly.** `retire` ends a live or verified claim, releases the bond
   to the provider, and keeps the record for history.

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
- An answer that does not carry this audit's nonce. The echo check sits in the
  contract code after the round, so a frozen page from an earlier audit
  falsifies the claim instead of verifying it.
- A re-audit outside the freshness window. Renew while it is open or attest
  again with a new bond.
- A second audit of a settled claim. `adjudicate` settles a claim once;
  renewals go through `reaudit` only.
- A retire by anyone but the provider, or a retire of an already closed claim.
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
| Verified, uncontested | stays escrowed while the claim stands, `retire` takes it home | not applicable |
| Verified, contested | stays escrowed, plus the accuser's bond comes home | the accuser pays for being wrong |
| Falsified, uncontested | to the model owner | not applicable |
| Falsified, contested | to the accuser | back to the accuser |
| Retired | back to the provider | not applicable |

Escrow is the change from a one-shot audit: a standing claim always has its bond
locked against it, so there is something real to dispute at any moment while the
claim says verified. The uncontested falsified row is why a model owner
registers a profile at all: every impostor caught without a challenger funds the
model it was mimicking.

## On-chain

| | |
|---|---|
| Network | GenLayer StudioNet |
| Contract | [`0x3a35aF7755808F9f0EEbE148a86114b8363f8CC7`](https://explorer-studio.genlayer.com/address/0x3a35aF7755808F9f0EEbE148a86114b8363f8CC7) |
| Contract source | [`contracts/model_print.py`](contracts/model_print.py) |
| Live state | 1 profile, 6 claims, 1 verified (renewed once), 2 falsified, 1 live, 1 disputed, 1 retired, 0.04 GEN in bonds, 0.04 GEN paid out |

The board shows the whole lifecycle. Claim 1 served the real document, answered
two different nonces, and stands verified with two audits on record. Claim 2
served a frozen impostor document and was falsified, and because nobody
contested it the bond went to the model owner. Claim 3 wrote a filler nonce into
an otherwise correct document, the contract rejected the echo, and the accuser
who contested it took both bonds. Claim 4 is an honest gateway with its nonce
already answered, waiting for anyone to press the audit button. Claim 5 is an
impostor under dispute, also waiting. Claim 6 verified and then retired: the
provider took the bond home and the record stays.

## The demo endpoints

The honest claims point at documents on a public host whose content is written
after the nonce reservation, which is exactly the handshake the contract
enforces. The document did not exist before its nonce did.

The frozen-page impostor lives in [`agents/`](agents) and is served over
`raw.githubusercontent.com`, so it never changes and can never echo a nonce.
That is what makes claim 2 falsifiable on sight rather than a matter of
opinion: the content is real JSON, it names the wrong model, and it predates
every audit aimed at it.

- `agents/lookalike-proxy.json` answers with a different model name, a 4096
  context window, and a string where an object was required. It fails three
  separate requirements on top of the missing nonce.
- `agents/atlas-7b-instruct.json` is the reference format for a capability
  document: the model name, the context window, and the answer object.

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

The claim page is the part worth opening. It shows the registered challenge,
what your own browser gets back from the endpoint, the next audit nonce with
its reserve button, and the validators' verdict side by side. A verified claim
also shows the freshness countdown, and the provider gets the renew and retire
controls on the same page.

### Tests

Two layers:

- **Direct mode** (`tests/direct/test_model_print.py`) runs the contract in a
  local VM with a controllable block clock. It covers profile registration and
  ownership, bonds and minimums, the dispute guards, both settlement directions
  with and without a challenger, the prompt-injection handling, and the v2
  proof path: nonce derivation is deterministic, a reservation is idempotent,
  an answer without the nonce falsifies regardless of its content, renewal
  needs a verified claim inside the window, a stale claim is not verified, and
  retire pays the provider exactly once. The failed-fetch section proves a dark
  round moves no money, that the retry window blocks a second attempt until the
  hour is up and reopens at the boundary, and that an impostor cannot escape
  its bond by taking the endpoint offline. 46 tests.
- **Integration** (`tests/integration/test_model_print.py`) deploys to StudioNet
  and exercises the real consensus path: the validators fetch a live document
  that answers the reserved nonce, agree on the verdict, renew the proof with a
  second nonce, retire the claim, and settle a dispute. A fourth test points a
  claim at a host that cannot resolve, so the validators really fail to reach
  it, and asserts that the claim stayed open with no bond moved.

Every guard above was mutation-checked: removing the nonce echo check, the
freshness gate, or the retire status check one at a time makes the matching
tests fail, which is the proof that the tests test the guards.

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
agents/                               the frozen impostor document and the capability format reference
tests/direct/                         local VM test suite
tests/integration/                    StudioNet integration tests
tests/deploy_seed_modelprint.py       fresh deploy + demo data seeder
frontend-modelprint/                  Vite + React app
```

## Notes

- StudioNet GEN is valueless. The verification path is the point.
- Be precise about what a verdict means. It says the endpoint's served answer
  met the registered requirements for this audit's nonce, at the moment the
  validators fetched it. It does not prove which weights produced that answer,
  and a requirement set that is easy to satisfy proves less than a strict one.
- Cloaking is a known limit. An endpoint that serves different bytes to
  different validators is hard to catch from inside a single round, because
  consensus is about agreeing on what was fetched, not on whether the fetches
  were identical. A stricter version of this registry would have the model
  owner pin a hash per challenge so every round is checked against the same
  bytes.
- Registering a profile is free and every other write reverts if you attach
  value, except `attest` and `dispute`, which carry the bonds.

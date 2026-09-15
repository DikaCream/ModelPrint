import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useModelPrint } from "../context/ModelPrintContext";
import { formatDate, formatGen, shortAddr } from "../config";

function parseGen(input: string): bigint {
  const v = Number(input);
  if (!Number.isFinite(v) || v <= 0) return 0n;
  return BigInt(Math.round(v * 1_000_000)) * 10n ** 12n;
}

export function Profiles() {
  const { profiles, wallet, run, busy } = useModelPrint();
  const [label, setLabel] = useState("");
  const [criteria, setCriteria] = useState("");
  const [challenge, setChallenge] = useState("");
  const [minBond, setMinBond] = useState("0.01");
  const [msg, setMsg] = useState<string | null>(null);
  const [bad, setBad] = useState(false);

  function fail(text: string) {
    setBad(true);
    setMsg(text);
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setMsg(null);
    setBad(false);

    if (!wallet.address) return fail("Connect a wallet first.");
    if (!label.trim()) return fail("Name the model.");
    if (criteria.trim().length < 40)
      return fail(
        "Write requirements the validators can check one by one: field names, expected values, and what counts as a failure.",
      );
    if (!challenge.trim()) return fail("Write the challenge every claimant will be asked.");

    const bond = parseGen(minBond);
    if (bond < 10n ** 15n) return fail("The minimum bond has to be at least 0.005 GEN.");

    const ok = await run("register", (c) =>
      c.registerProfile(label.trim(), criteria.trim(), challenge.trim(), bond),
    );
    if (ok) {
      setLabel("");
      setCriteria("");
      setChallenge("");
      setMsg("Profile published. Providers can now stake claims against it.");
    }
  }

  return (
    <main className="page">
      <section className="masthead">
        <p className="eyebrow">Model owners</p>
        <h1>Publish what a real answer looks like.</h1>
        <p className="lede">
          A profile is the yardstick. It fixes the challenge every claimant is asked
          and the requirements their answer has to meet. Once published it is the
          only thing the validators measure against, and it cannot be edited. Closing
          it stops new claims; the ones already standing still settle.
        </p>
      </section>

      <section className="panel">
        <header className="panel-head">
          <h2>Registered profiles</h2>
          <p className="panel-note">{profiles.length} on this contract</p>
        </header>
        {profiles.length === 0 ? (
          <p className="dim pad">Nothing registered yet.</p>
        ) : (
          <div className="plates">
            {profiles.map((p) => (
              <Link className="plate profile-plate" key={p.id} to={`/attest?profile=${p.id}`}>
                <span className="plate-id">#{p.id}</span>
                <span className="plate-model">
                  <span className="readout-label">model</span>
                  <strong>{p.modelLabel}</strong>
                  <span className="plate-endpoint">
                    owner {shortAddr(p.owner)} · since {formatDate(p.createdAt)}
                  </span>
                </span>
                <span className="plate-provider">
                  <span className="readout-label">claims</span>
                  <span className="mono">{p.attestations}</span>
                </span>
                <span className="plate-bond">
                  <span className="readout-label">min bond</span>
                  <span className="readout-value">{formatGen(p.minBond)}</span>
                </span>
                <span className="plate-state">
                  {p.active ? (
                    <span className="lamp live compact">
                      <i className="lamp-dot" aria-hidden="true" />
                      Open
                    </span>
                  ) : (
                    <span className="lamp falsified compact">
                      <i className="lamp-dot" aria-hidden="true" />
                      Closed
                    </span>
                  )}
                </span>
                <span className="plate-go" aria-hidden="true">
                  →
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {!wallet.address && (
        <p className="inline-error">Connect a wallet to publish a profile.</p>
      )}

      <section className="panel">
        <header className="panel-head">
          <h2>Register a profile</h2>
          <p className="panel-note">Free to publish. The requirements are the product.</p>
        </header>
        <form className="form" onSubmit={onSubmit}>
          <label>
            <span>Model label</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="atlas-7b-instruct"
              maxLength={120}
            />
          </label>

          <label>
            <span>Requirements a correct answer must show</span>
            <textarea
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              placeholder={
                "The response must be a JSON object naming the model as exactly " +
                "\"atlas-7b-instruct\", declaring a context window of 32768, and an " +
                "answer object with a route string. Prose or a different context " +
                "window counts as a failure."
              }
              rows={6}
              maxLength={2000}
            />
          </label>

          <label>
            <span>Challenge put to every claimant</span>
            <textarea
              value={challenge}
              onChange={(e) => setChallenge(e.target.value)}
              placeholder="Return your capability document as JSON, with your model name, context window, and your answer to the routing question."
              rows={3}
              maxLength={600}
            />
          </label>

          <div className="field-row">
            <label>
              <span>Minimum bond (GEN)</span>
              <input
                value={minBond}
                onChange={(e) => setMinBond(e.target.value)}
                inputMode="decimal"
              />
            </label>
          </div>

          <p className="hint">
            Every claim against this profile has to hold at least this much GEN. That
            bond is what pays a challenger, or you, when the claim turns out to be
            false.
          </p>

          <div className="form-foot">
            <button className="btn" type="submit" disabled={busy !== null}>
              {busy === "register" ? "Publishing…" : "Publish the profile"}
            </button>
            {msg && <span className={bad ? "form-msg bad" : "form-msg"}>{msg}</span>}
          </div>
        </form>
      </section>
    </main>
  );
}

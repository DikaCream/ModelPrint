import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useModelPrint } from "../context/ModelPrintContext";
import { Profile } from "../lib/types";
import { formatGen } from "../config";

function parseGen(input: string): bigint {
  const v = Number(input);
  if (!Number.isFinite(v) || v <= 0) return 0n;
  return BigInt(Math.round(v * 1_000_000)) * 10n ** 12n;
}

export function Attest() {
  const { profiles, wallet, run, busy, read } = useModelPrint();
  const [params] = useSearchParams();

  const [profileId, setProfileId] = useState<number>(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [endpointLabel, setEndpointLabel] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [bond, setBond] = useState("0.01");
  const [msg, setMsg] = useState<string | null>(null);
  const [bad, setBad] = useState(false);

  useEffect(() => {
    const wanted = Number(params.get("profile"));
    if (wanted && profiles.some((p) => p.id === wanted)) setProfileId(wanted);
  }, [params, profiles]);

  useEffect(() => {
    if (!profileId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    read
      .getProfile(profileId)
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        if (p) setBond(formatGen(p.minBond));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profileId, read]);

  function fail(text: string) {
    setBad(true);
    setMsg(text);
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setMsg(null);
    setBad(false);

    if (!wallet.address) return fail("Connect a wallet first.");
    if (!profileId) return fail("Pick the profile you are claiming against.");
    if (!endpointLabel.trim()) return fail("Give the endpoint a label.");
    if (!endpointUrl.trim().startsWith("http"))
      return fail("The endpoint URL has to start with http.");
    if (!endpointUrl.includes("/"))
      return fail("That does not look like a URL.");

    const bondWei = parseGen(bond);
    if (profile && bondWei < profile.minBond)
      return fail(`This profile wants at least ${formatGen(profile.minBond)} GEN.`);

    const ok = await run("attest", (c) =>
      c.attest(profileId, endpointLabel.trim(), endpointUrl.trim(), bondWei),
    );
    if (ok) {
      setEndpointLabel("");
      setEndpointUrl("");
      setMsg("Claim staked. Open it from the board and press the audit.");
    }
  }

  return (
    <main className="page page-narrow">
      <nav className="crumbs">
        <Link to="/">Board</Link>
        <span>/</span>
        <span>Stake a claim</span>
      </nav>

      <section className="masthead">
        <p className="eyebrow">Providers</p>
        <h1>Stake a claim on an endpoint.</h1>
        <p className="lede">
          You are saying this endpoint serves the model the profile describes. The
          bond is what makes that sentence worth reading: audited and wrong, it pays
          whoever caught you, or the model owner if nobody did.
        </p>
      </section>

      {profiles.length === 0 ? (
        <p className="inline-error">
          No profiles registered yet.{" "}
          <Link to="/profiles">Publish one first</Link>.
        </p>
      ) : !wallet.address ? (
        <p className="inline-error">Connect a wallet to stake a claim.</p>
      ) : (
        <form className="form panel" onSubmit={onSubmit}>
          <label>
            <span>Model profile</span>
            <select
              value={profileId || ""}
              onChange={(e) => setProfileId(Number(e.target.value))}
            >
              <option value="">Pick a profile</option>
              {profiles
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.id} {p.modelLabel} · min {formatGen(p.minBond)} GEN
                  </option>
                ))}
            </select>
          </label>

          {profile && (
            <div className="challenge-preview">
              <span className="readout-label">The challenge your endpoint will be judged against</span>
              <p>“{profile.challenge}”</p>
              <span className="readout-label">Requirements</span>
              <p className="body-text">{profile.criteria}</p>
            </div>
          )}

          <label>
            <span>Endpoint label</span>
            <input
              value={endpointLabel}
              onChange={(e) => setEndpointLabel(e.target.value)}
              placeholder="northwind-gateway"
              maxLength={120}
            />
          </label>

          <label>
            <span>Endpoint URL</span>
            <input
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              placeholder="https://example.com/agents/atlas-7b-instruct.json"
              maxLength={500}
            />
          </label>

          <div className="field-row">
            <label>
              <span>Bond (GEN)</span>
              <input
                value={bond}
                onChange={(e) => setBond(e.target.value)}
                inputMode="decimal"
              />
            </label>
          </div>

          <p className="hint">
            The URL has to serve the endpoint's answer to the registered challenge.
            It can be a static document, a gateway, or an inference API. Anyone can
            then contest you by matching this bond.
          </p>

          <div className="form-foot">
            <button className="btn" type="submit" disabled={busy !== null}>
              {busy === "attest" ? "Staking the bond…" : "Stake the claim"}
            </button>
            {msg && <span className={bad ? "form-msg bad" : "form-msg"}>{msg}</span>}
          </div>
        </form>
      )}
    </main>
  );
}

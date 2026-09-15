import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useModelPrint } from "../context/ModelPrintContext";
import { Attestation, Profile } from "../lib/types";
import { describeError } from "../lib/errors";
import { formatClock, formatGen, hostOf, shortAddr, EXPLORER_ADDR } from "../config";
import { StatusLamp, statusMeta } from "../components/StatusLamp";

type Served =
  | { state: "loading" }
  | { state: "ok"; text: string }
  | { state: "blocked" };

// Mirrors the contract. Three failed fetches close a claim, one hour apart, so
// a burst of clicks cannot spend the retry budget while an endpoint is down.
const MAX_FETCH_ATTEMPTS = 3;
const RETRY_COOLDOWN_S = 3600;
const OPEN_STATUSES = ["LIVE", "DISPUTED"];

export function ClaimPage() {
  const { id } = useParams();
  const cid = Number(id);
  const { read, run, busy, wallet, version, lastTx } = useModelPrint();

  const [claim, setClaim] = useState<Attestation | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [served, setServed] = useState<Served>({ state: "loading" });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [formMsg, setFormMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(cid) || cid < 1) {
      setErr("That claim id is not valid.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const a = await read.getAttestation(cid);
      if (!a) {
        setErr("That claim does not exist on this contract.");
        setClaim(null);
        return;
      }
      const p = await read.getProfile(a.profileId);
      setClaim(a);
      setProfile(p);
      setErr(null);
    } catch (e) {
      setErr(describeError(e));
    } finally {
      setLoading(false);
    }
  }, [cid, read]);

  useEffect(() => {
    load();
  }, [load, version]);

  // Show what the endpoint actually serves, straight from the visitor's browser.
  const endpointUrl = claim?.endpointUrl ?? "";
  useEffect(() => {
    if (!endpointUrl) return;
    let cancelled = false;
    setServed({ state: "loading" });
    fetch(endpointUrl)
      .then((r) => r.text())
      .then((t) => {
        if (!cancelled) setServed({ state: "ok", text: t.slice(0, 4000) });
      })
      .catch(() => {
        if (!cancelled) setServed({ state: "blocked" });
      });
    return () => {
      cancelled = true;
    };
  }, [endpointUrl]);

  if (loading && !claim) {
    return (
      <main className="page">
        <p className="dim pad">Reading the claim…</p>
      </main>
    );
  }

  if (err && !claim) {
    return (
      <main className="page">
        <div className="empty">
          <p className="empty-title">{err}</p>
          <p>
            <Link to="/">Back to the board</Link>
          </p>
        </div>
      </main>
    );
  }

  if (!claim) return null;

  const meta = statusMeta(claim.status);
  const settled = !OPEN_STATUSES.includes(claim.status);
  const mine = !!wallet.address &&
    wallet.address.toLowerCase() === claim.provider.toLowerCase();
  const canDispute = claim.status === "LIVE" && !claim.disputed && !mine;

  // A failed fetch is not a verdict: the claim stays open, so say why the next
  // attempt has to wait instead of letting the button revert.
  const nowS = Math.floor(Date.now() / 1000);
  const retryReadyAt =
    claim.failedAttempts > 0 ? claim.lastAttemptAt + RETRY_COOLDOWN_S : 0;
  const cooling = !settled && retryReadyAt > nowS;
  const minutesToRetry = cooling
    ? Math.max(1, Math.ceil((retryReadyAt - nowS) / 60))
    : 0;

  async function onAudit() {
    const ok = await run("audit", (c) => c.adjudicate(cid));
    if (ok) {
      await load();
      setFormMsg("Verdict written by the validators.");
    }
  }

  async function onDispute(ev: FormEvent) {
    ev.preventDefault();
    setFormMsg(null);
    if (!reason.trim()) {
      setFormMsg("Say what is wrong with the claim.");
      return;
    }
    const ok = await run("dispute", (c) => c.dispute(cid, reason.trim(), claim!.bond));
    if (ok) {
      setReason("");
      await load();
      setFormMsg("Dispute recorded. The bond is matched and the claim is now contested.");
    }
  }

  return (
    <main className="page">
      <nav className="crumbs">
        <Link to="/">Board</Link>
        <span>/</span>
        <span>Claim #{claim.id}</span>
      </nav>

      <section className="claim-head">
        <div>
          <p className="eyebrow">Claim #{claim.id}</p>
          <h1>{profile?.modelLabel || `Profile ${claim.profileId}`}</h1>
          <p className="meta-line">
            {claim.endpointLabel} at{" "}
            <a href={claim.endpointUrl} target="_blank" rel="noreferrer">
              {hostOf(claim.endpointUrl)}
            </a>{" "}
            · provider{" "}
            <a href={EXPLORER_ADDR(claim.provider)} target="_blank" rel="noreferrer">
              {shortAddr(claim.provider)}
            </a>
          </p>
        </div>
        <div className="claim-head-act">
          <StatusLamp status={claim.status} />
          {!settled && (
            <button className="btn" onClick={onAudit} disabled={busy !== null || cooling}>
              {busy === "audit"
                ? "Fetching and judging…"
                : cooling
                  ? `Retry opens in ${minutesToRetry}m`
                  : "Run the audit"}
            </button>
          )}
        </div>
      </section>

      <section className="readout-strip tight">
        <div className="readout">
          <span className="readout-label">Claim bond</span>
          <span className="readout-value">{formatGen(claim.bond)}</span>
        </div>
        <div className="readout">
          <span className="readout-label">Dispute bond</span>
          <span className="readout-value">
            {claim.disputed ? formatGen(claim.disputeBond) : "none"}
          </span>
        </div>
        <div className="readout">
          <span className="readout-label">Verdict</span>
          <span className="readout-value">{claim.verdict || "not audited"}</span>
        </div>
        <div className="readout">
          <span className="readout-label">Settled</span>
          <span className="readout-value">
            {claim.settledAt ? formatClock(claim.settledAt) : "open"}
          </span>
        </div>
      </section>

      <p className={`verdict-note ${meta.tone}`}>{meta.gloss}</p>

      {!settled && claim.failedAttempts > 0 && (
        <p className="action-note">
          {claim.failedAttempts === 1
            ? "One audit"
            : `${claim.failedAttempts} audits`}{" "}
          could not reach this endpoint. A failed fetch is not a verdict about the
          model, so no bond moved and nothing was written as a verdict. The attempt
          is recorded on the chain, and {MAX_FETCH_ATTEMPTS - claim.failedAttempts}{" "}
          more before the claim closes as unreachable.
          {cooling && ` The retry window reopens ${formatClock(retryReadyAt)}.`}
        </p>
      )}

      <section className="compare" aria-label="Evidence comparison">
        <article className="column ask">
          <header>
            <span className="column-tag">Asked</span>
            <h3>The registered challenge</h3>
          </header>
          <p className="challenge">“{profile?.challenge || "not available"}”</p>
          <h4>What a correct answer must show</h4>
          <p className="body-text">{profile?.criteria || "not available"}</p>
        </article>

        <article className="column served">
          <header>
            <span className="column-tag">Served</span>
            <h3>What the endpoint returned</h3>
          </header>
          {served.state === "loading" && (
            <p className="dim">Fetching the endpoint from your browser…</p>
          )}
          {served.state === "blocked" && (
            <p className="dim">
              Your browser could not read this URL directly, likely because the host
              blocks cross origin reads.{" "}
              <a href={claim.endpointUrl} target="_blank" rel="noreferrer">
                Open it in a tab
              </a>
              . The validators fetch it server side during the audit, so the verdict
              below is based on the real bytes.
            </p>
          )}
          {served.state === "ok" && <pre className="served-doc">{served.text}</pre>}
          <p className="column-foot">
            The validators fetch this same URL themselves. The page is treated as
            untrusted input, so it cannot talk its way to a verdict.
          </p>
        </article>

        <article className="column verdict">
          <header>
            <span className="column-tag">Judged</span>
            <h3>What the validators concluded</h3>
          </header>
          {settled ? (
            <>
              <p className={`stamp-big ${meta.tone}`}>{claim.verdict}</p>
              <p className="body-text">{claim.reasoning}</p>
              <p className="column-foot">
                Written to the chain on {formatClock(claim.settledAt)}. A claim is
                audited once, so this verdict cannot be rewritten.
              </p>
            </>
          ) : claim.disputed ? (
            <>
              <p className="dim">
                Contested. The accuser put up a matching bond and the claim is waiting
                for anyone to trigger the audit.
              </p>
              <h4>Why it was contested</h4>
              <p className="body-text">{claim.disputeReason}</p>
              <p className="column-foot">
                By {shortAddr(claim.challenger)} with{" "}
                {formatGen(claim.disputeBond)} GEN at stake.
              </p>
            </>
          ) : (
            <p className="dim">
              Nobody has audited this claim yet. The bond is standing but unproven.
            </p>
          )}
        </article>
      </section>

      {canDispute && (
        <section className="panel">
          <header className="panel-head">
            <h2>Contest this claim</h2>
            <p className="panel-note">
              Match the claim bond with {formatGen(claim.bond)} GEN.
            </p>
          </header>
          <form className="form" onSubmit={onDispute}>
            <label>
              <span>What is wrong with the claim</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Name the requirement the endpoint fails, and what it serves instead."
                rows={3}
                maxLength={2000}
              />
            </label>
            <div className="form-foot">
              <button className="btn" type="submit" disabled={busy !== null}>
                {busy === "dispute" ? "Matching the bond…" : "Dispute and match the bond"}
              </button>
              {formMsg && <span className="form-msg">{formMsg}</span>}
            </div>
          </form>
        </section>
      )}

      {!canDispute && formMsg && <p className="form-msg pad">{formMsg}</p>}

      {claim.disputed && !settled && (
        <p className="action-note">
          If the audit confirms the claim, the accuser pays: the provider keeps both
          bonds. If the audit breaks the claim, the accuser takes both.
        </p>
      )}

      {lastTx && (
        <p className="dim pad">
          Last transaction:{" "}
          <a href={`https://explorer-studio.genlayer.com/tx/${lastTx}`} target="_blank" rel="noreferrer">
            {lastTx.slice(0, 14)}…
          </a>
        </p>
      )}
    </main>
  );
}

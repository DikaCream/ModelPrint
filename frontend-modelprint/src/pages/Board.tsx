import { Link } from "react-router-dom";
import { useModelPrint } from "../context/ModelPrintContext";
import { VerdictPlate } from "../components/VerdictPlate";
import { formatGen } from "../config";

export function Board() {
  const { attestations, profiles, stats, loading, error } = useModelPrint();

  const labelFor = (profileId: number) =>
    profiles.find((p) => p.id === profileId)?.modelLabel ?? "";

  const awaiting = attestations.filter(
    (a) => a.status === "LIVE" || a.status === "DISPUTED",
  );

  return (
    <main className="page">
      <section className="masthead">
        <p className="eyebrow">Model provenance registry</p>
        <h1>
          A claim about which model
          <br />
          is running is worth nothing
          <br />
          until someone fetches it.
        </h1>
        <p className="lede">
          A model owner publishes the label, the challenge, and the requirements a
          real answer has to meet. A provider stakes a bond on an endpoint. Validators
          fetch that endpoint themselves and only then does a verdict get written.
          A false claim pays out.
        </p>
        <div className="cta-row">
          <Link className="btn" to="/attest">
            Stake a claim
          </Link>
          <Link className="btn ghost" to="/profiles">
            Publish a model profile
          </Link>
        </div>
      </section>

      <section className="readout-strip" aria-label="Contract totals">
        <div className="readout">
          <span className="readout-label">Profiles</span>
          <span className="readout-value big">{stats.profiles}</span>
        </div>
        <div className="readout">
          <span className="readout-label">Claims</span>
          <span className="readout-value big">{stats.attestations}</span>
        </div>
        <div className="readout">
          <span className="readout-label">Verified</span>
          <span className="readout-value big ok">{stats.verified}</span>
        </div>
        <div className="readout">
          <span className="readout-label">Falsified</span>
          <span className="readout-value big bad">{stats.falsified}</span>
        </div>
        <div className="readout">
          <span className="readout-label">Held in bonds</span>
          <span className="readout-value big">{formatGen(stats.bonds)}</span>
        </div>
        <div className="readout">
          <span className="readout-label">Paid out</span>
          <span className="readout-value big">{formatGen(stats.paid)}</span>
        </div>
      </section>

      {awaiting.length > 0 && (
        <p className="action-note">
          {awaiting.length} claim{awaiting.length > 1 ? "s" : ""} still standing
          {awaiting.some((a) => a.disputed)
            ? ", one of them under dispute and waiting for an audit. "
            : ". "}
          Open one and press the button: the validators fetch the endpoint and the
          bond moves.
        </p>
      )}

      <section className="panel">
        <header className="panel-head">
          <h2>Claim board</h2>
          <p className="panel-note">Newest first. Bonds and payouts are in GEN.</p>
        </header>

        {error && <p className="inline-error">{error}</p>}

        {loading && attestations.length === 0 ? (
          <p className="dim pad">Reading the contract…</p>
        ) : attestations.length === 0 ? (
          <p className="dim pad">
            No claims yet. Publish a model profile, then stake a claim against it.
          </p>
        ) : (
          <div className="plates">
            {attestations.map((a) => (
              <VerdictPlate key={a.id} claim={a} modelLabel={labelFor(a.profileId)} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

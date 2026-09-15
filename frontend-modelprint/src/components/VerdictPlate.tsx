import { Link } from "react-router-dom";
import { Attestation } from "../lib/types";
import { formatGen, hostOf, shortAddr } from "../config";
import { StatusLamp } from "./StatusLamp";

interface Props {
  claim: Attestation;
  modelLabel: string;
}

export function VerdictPlate({ claim, modelLabel }: Props) {
  return (
    <Link className="plate" to={`/claims/${claim.id}`}>
      <span className="plate-id">#{claim.id}</span>

      <span className="plate-model">
        <span className="readout-label">claimed model</span>
        <strong>{modelLabel || `profile ${claim.profileId}`}</strong>
        <span className="plate-endpoint">
          {claim.endpointLabel} · {hostOf(claim.endpointUrl)}
        </span>
      </span>

      <span className="plate-provider">
        <span className="readout-label">provider</span>
        <span className="mono">{shortAddr(claim.provider)}</span>
      </span>

      <span className="plate-bond">
        <span className="readout-label">bond</span>
        <span className="readout-value">{formatGen(claim.bond)}</span>
      </span>

      <span className="plate-state">
        <StatusLamp status={claim.status} />
        {claim.verdict ? (
          <span className="plate-verdict mono">{claim.verdict}</span>
        ) : (
          <span className="plate-verdict dim mono">no audit yet</span>
        )}
      </span>

      <span className="plate-go" aria-hidden="true">
        →
      </span>
    </Link>
  );
}

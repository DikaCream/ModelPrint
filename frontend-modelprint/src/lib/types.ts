export interface Profile {
  id: number;
  owner: string;
  modelLabel: string;
  criteria: string;
  challenge: string;
  minBond: bigint;
  active: boolean;
  attestations: number;
  createdAt: number;
}

export interface ProfileSummary {
  id: number;
  owner: string;
  modelLabel: string;
  minBond: bigint;
  active: boolean;
  attestations: number;
  createdAt: number;
}

export interface Attestation {
  id: number;
  profileId: number;
  provider: string;
  endpointLabel: string;
  endpointUrl: string;
  bond: bigint;
  status: string;
  verdict: string;
  reasoning: string;
  challenger: string;
  disputed: boolean;
  disputeBond: bigint;
  disputeReason: string;
  createdAt: number;
  settledAt: number;
}

export interface Stats {
  profiles: number;
  attestations: number;
  live: number;
  verified: number;
  falsified: number;
  bonds: bigint;
  paid: bigint;
}

export function toInt(v: unknown, fallback = 0): number {
  if (v == null) return fallback;
  try {
    return Number(v as number);
  } catch {
    return fallback;
  }
}

export function toBig(v: unknown): bigint {
  if (v == null) return 0n;
  try {
    return typeof v === "bigint" ? v : BigInt(v as string);
  } catch {
    return 0n;
  }
}

export function toStr(v: unknown, fallback = ""): string {
  return v == null ? fallback : String(v);
}

export function toProfile(raw: any): Profile {
  return {
    id: toInt(raw?.id),
    owner: toStr(raw?.owner),
    modelLabel: toStr(raw?.model_label),
    criteria: toStr(raw?.criteria),
    challenge: toStr(raw?.challenge),
    minBond: toBig(raw?.min_bond),
    active: Boolean(raw?.active),
    attestations: toInt(raw?.attestations),
    createdAt: toInt(raw?.created_at),
  };
}

export function toProfileSummary(raw: any): ProfileSummary {
  return {
    id: toInt(raw?.id),
    owner: toStr(raw?.owner),
    modelLabel: toStr(raw?.model_label),
    minBond: toBig(raw?.min_bond),
    active: Boolean(raw?.active),
    attestations: toInt(raw?.attestations),
    createdAt: toInt(raw?.created_at),
  };
}

export function toAttestation(raw: any): Attestation {
  return {
    id: toInt(raw?.id),
    profileId: toInt(raw?.profile_id),
    provider: toStr(raw?.provider),
    endpointLabel: toStr(raw?.endpoint_label),
    endpointUrl: toStr(raw?.endpoint_url),
    bond: toBig(raw?.bond),
    status: toStr(raw?.status, "LIVE"),
    verdict: toStr(raw?.verdict),
    reasoning: toStr(raw?.reasoning),
    challenger: toStr(raw?.challenger),
    disputed: Boolean(raw?.disputed),
    disputeBond: toBig(raw?.dispute_bond),
    disputeReason: toStr(raw?.dispute_reason),
    createdAt: toInt(raw?.created_at),
    settledAt: toInt(raw?.settled_at),
  };
}

export function toStats(raw: any): Stats {
  return {
    profiles: toInt(raw?.profiles),
    attestations: toInt(raw?.attestations),
    live: toInt(raw?.live),
    verified: toInt(raw?.verified),
    falsified: toInt(raw?.falsified),
    bonds: toBig(raw?.bonds),
    paid: toBig(raw?.paid),
  };
}

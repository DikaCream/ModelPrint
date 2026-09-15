import { CONTRACT_ADDRESS } from "../config";
import {
  Attestation,
  Profile,
  ProfileSummary,
  Stats,
  toAttestation,
  toProfile,
  toProfileSummary,
  toStats,
} from "./types";

export class ModelPrint {
  constructor(private client: any, private address: string = CONTRACT_ADDRESS) {}

  private async read(functionName: string, args: unknown[] = []): Promise<any> {
    return this.client.readContract({
      address: this.address as `0x${string}`,
      functionName,
      args,
    });
  }

  private async write(
    functionName: string,
    args: unknown[],
    value: bigint = 0n,
  ): Promise<string> {
    const txHash = await this.client.writeContract({
      address: this.address as `0x${string}`,
      functionName,
      args,
      value,
    });
    return txHash as string;
  }

  async waitForReceipt(txHash: string, retries = 70, interval = 3000): Promise<any> {
    return this.client.waitForTransactionReceipt({
      hash: txHash,
      status: "ACCEPTED" as any,
      retries,
      interval,
    });
  }

  // ---- reads ----------------------------------------------------------
  async getStats(): Promise<Stats> {
    return toStats(await this.read("get_stats"));
  }

  async getProfile(id: number): Promise<Profile | null> {
    const v = await this.read("get_profile", [id]);
    if (v == null) return null;
    return toProfile(v);
  }

  async listProfiles(offset = 0, limit = 50): Promise<ProfileSummary[]> {
    const v = await this.read("list_profiles", [offset, limit]);
    return Array.isArray(v) ? v.map(toProfileSummary) : [];
  }

  async getAttestation(id: number): Promise<Attestation | null> {
    const v = await this.read("get_attestation", [id]);
    if (v == null) return null;
    return toAttestation(v);
  }

  async listAttestations(
    offset = 0,
    limit = 50,
    statusFilter = "",
  ): Promise<Attestation[]> {
    const v = await this.read("list_attestations", [offset, limit, statusFilter]);
    return Array.isArray(v) ? v.map(toAttestation) : [];
  }

  // ---- writes ---------------------------------------------------------
  async registerProfile(
    modelLabel: string,
    criteria: string,
    challenge: string,
    minBond: bigint,
  ): Promise<string> {
    return this.write("register_profile", [modelLabel, criteria, challenge, minBond]);
  }

  async deactivateProfile(id: number): Promise<string> {
    return this.write("deactivate_profile", [id]);
  }

  /** Claim that an endpoint serves the profile's model; the bond travels with the tx. */
  async attest(profileId: number, endpointLabel: string, endpointUrl: string, bond: bigint): Promise<string> {
    return this.write("attest", [profileId, endpointLabel, endpointUrl], bond);
  }

  async dispute(id: number, reason: string, bond: bigint): Promise<string> {
    return this.write("dispute", [id, reason], bond);
  }

  /** Fetch the endpoint on the validators and let them agree on the verdict. */
  async adjudicate(id: number): Promise<string> {
    return this.write("adjudicate", [id]);
  }
}

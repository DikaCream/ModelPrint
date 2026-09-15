/** Turn any wallet, RPC, or contract error into a sentence a human can act on. */
export function describeError(e: unknown): string {
  if (e == null) return "Something went wrong.";
  const anyE = e as any;

  const raw =
    anyE?.shortMessage ??
    anyE?.message ??
    (typeof e === "string" ? e : undefined) ??
    String(e);

  const lower = String(raw).toLowerCase();

  if (lower.includes("user rejected") || lower.includes("user denied"))
    return "You rejected the request in your wallet.";
  if (lower.includes("unrecognized chain") || lower.includes("4902"))
    return "Add the GenLayer StudioNet network to your wallet, then try again.";
  if (
    lower.includes("insufficient funds") ||
    lower.includes("exceeds") ||
    lower.includes("balance")
  )
    return "Not enough GEN in the connected wallet for this action.";
  if (
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("connection") ||
    lower.includes("502") ||
    lower.includes("bad gateway")
  )
    return "Could not reach GenLayer StudioNet. The network may be busy, try again in a moment.";
  if (lower.includes("timeout") || lower.includes("timed out"))
    return "The transaction took too long to confirm. Check the explorer before retrying.";

  // ---- contract guards, in the order a caller runs into them ----------
  if (lower.includes("model_label: 1-120")) return "The model label must be 1 to 120 characters.";
  if (lower.includes("criteria: 1-2000")) return "Requirements must be 1 to 2000 characters.";
  if (lower.includes("challenge: 1-600")) return "The challenge must be 1 to 600 characters.";
  if (lower.includes("min_bond must be at least"))
    return "The minimum bond must be at least 0.005 GEN.";
  if (lower.includes("endpoint_label: 1-120"))
    return "The endpoint label must be 1 to 120 characters.";
  if (lower.includes("endpoint_url: 1-500"))
    return "The endpoint URL must be 1 to 500 characters.";
  if (lower.includes("must be a public http url"))
    return "The endpoint URL has to start with http.";
  if (lower.includes("profile not found")) return "That profile does not exist on this contract.";
  if (lower.includes("attestation not found"))
    return "That claim does not exist on this contract.";
  if (lower.includes("not accepting claims"))
    return "The owner has closed this profile to new claims. Existing claims still settle.";
  if (lower.includes("bond is below this profile"))
    return "The bond is below this profile's minimum.";
  if (lower.includes("only the profile owner"))
    return "Only the profile owner can close it to new claims.";
  if (lower.includes("cannot be disputed"))
    return "This claim can no longer be disputed. It is settled, or already under dispute.";
  if (lower.includes("cannot dispute its own claim"))
    return "A provider cannot dispute its own claim.";
  if (lower.includes("dispute bond must match"))
    return "The dispute bond has to match the bond the claim already holds.";
  if (lower.includes("reason: 1-2000")) return "The reason must be 1 to 2000 characters.";
  if (lower.includes("already been adjudicated"))
    return "This claim has already been audited. A verdict is written once.";
  if (lower.includes("retry window is still closed"))
    return "The endpoint was unreachable on the last audit. Wait for the retry window to reopen, then try again.";
  if (lower.includes("no clear verdict"))
    return "The auditors did not return a clear verdict. Nothing moved, try again.";
  if (lower.includes("unreadable output"))
    return "The auditors returned output the contract could not read. Nothing moved.";

  return raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
}

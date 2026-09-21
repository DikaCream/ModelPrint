export type Tone =
  | "live"
  | "disputed"
  | "verified"
  | "stale"
  | "falsified"
  | "unreachable"
  | "retired";

export function statusMeta(status: string): { tone: Tone; label: string; gloss: string } {
  switch (status) {
    case "DISPUTED":
      return {
        tone: "disputed",
        label: "Disputed",
        gloss: "Someone put up a matching bond against this claim.",
      };
    case "VERIFIED":
      return {
        tone: "verified",
        label: "Verified",
        gloss:
          "The validators fetched the endpoint and it answered this audit's nonce.",
      };
    case "STALE":
      return {
        tone: "stale",
        label: "Stale",
        gloss:
          "The proof expired. The endpoint stopped answering fresh audits, so nobody should trust this claim until it is renewed.",
      };
    case "FALSIFIED":
      return {
        tone: "falsified",
        label: "Falsified",
        gloss:
          "The validators fetched the endpoint and it failed the requirements.",
      };
    case "UNREACHABLE":
      return {
        tone: "unreachable",
        label: "Unreachable",
        gloss:
          "Every audit failed to reach the endpoint, so the claim closed without a verdict about the model.",
      };
    case "RETIRED":
      return {
        tone: "retired",
        label: "Retired",
        gloss:
          "The provider stepped away and took the bond back. The record stays for history.",
      };
    default:
      return {
        tone: "live",
        label: "Live",
        gloss: "Bonded and standing. Nobody has audited it yet.",
      };
  }
}

export function StatusLamp({ status, compact = false }: { status: string; compact?: boolean }) {
  const meta = statusMeta(status);
  return (
    <span className={`lamp ${meta.tone}${compact ? " compact" : ""}`} title={meta.gloss}>
      <i className="lamp-dot" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

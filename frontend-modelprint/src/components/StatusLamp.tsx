export type Tone = "live" | "disputed" | "verified" | "falsified" | "unreachable";

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
        gloss: "The validators fetched the endpoint and it matched the requirements.",
      };
    case "FALSIFIED":
      return {
        tone: "falsified",
        label: "Falsified",
        gloss: "The validators fetched the endpoint and it failed the requirements.",
      };
    case "UNREACHABLE":
      return {
        tone: "unreachable",
        label: "Unreachable",
        gloss:
          "Every audit failed to reach the endpoint, so the claim closed without a verdict about the model.",
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

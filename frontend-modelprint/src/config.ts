export const NETWORK: "localnet" | "studionet" =
  (import.meta.env.VITE_NETWORK as "localnet" | "studionet") || "studionet";

export const RPC_URL = (import.meta.env.VITE_RPC_URL as string) || "";

/** Deployed ModelPrint contract on GenLayer StudioNet. */
export const CONTRACT_ADDRESS =
  (import.meta.env.VITE_CONTRACT_ADDRESS as string) ||
  "0xa15A57979E0206Ac589C6a2661A47472cD5E5c9B";

export const STUDIONET_CHAIN_ID = 777;
export const STUDIONET_CHAIN_ID_HEX = "0x309";

export const EXPLORER_TX = (hash: string) =>
  `https://explorer-studio.genlayer.com/tx/${hash}`;
export const EXPLORER_ADDR = (address: string) =>
  `https://explorer-studio.genlayer.com/address/${address}`;

export const GEN = 10n ** 18n;

export function toBigInt(value: bigint | number | string): bigint {
  try {
    return typeof value === "bigint" ? value : BigInt(value ?? 0);
  } catch {
    return 0n;
  }
}

/** Bond amounts stay legible, never a wall of zeros. */
export function formatGen(value: bigint | number | string, maxDecimals = 4): string {
  let wei = toBigInt(value);
  const negative = wei < 0n;
  if (negative) wei = -wei;

  const scale = 10n ** BigInt(maxDecimals);
  const whole = wei / GEN;
  const frac = ((wei % GEN) * scale) / GEN;
  const fracStr = frac.toString().padStart(maxDecimals, "0").replace(/0+$/, "");

  if (whole === 0n) {
    if (fracStr === "") {
      return wei === 0n ? "0" : `<0.${"0".repeat(maxDecimals - 1)}1`;
    }
    return `${negative ? "-" : ""}0.${fracStr}`;
  }
  return `${negative ? "-" : ""}${whole}${fracStr ? `.${fracStr}` : ""}`;
}

export function shortAddr(a: string): string {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatDate(unix: number): string {
  if (!unix) return "n/a";
  const d = new Date(unix * 1000);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function formatClock(unix: number): string {
  if (!unix) return "n/a";
  const d = new Date(unix * 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${formatDate(unix)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

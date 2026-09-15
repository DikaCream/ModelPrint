import { formatGen, shortAddr } from "../config";
import { useModelPrint } from "../context/ModelPrintContext";

export function WalletButton() {
  const { wallet } = useModelPrint();

  if (!wallet.hasProvider) {
    return (
      <a
        className="wallet-btn plain"
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer"
      >
        Install a wallet
      </a>
    );
  }

  if (!wallet.address) {
    return (
      <button className="wallet-btn" onClick={wallet.connect} disabled={wallet.busy}>
        {wallet.busy ? "Connecting" : "Connect wallet"}
      </button>
    );
  }

  return (
    <span className="wallet-live">
      <span className="wallet-bal">{formatGen(wallet.balance, 3)} GEN</span>
      <button className="wallet-btn plain" onClick={wallet.disconnect}>
        {shortAddr(wallet.address)}
      </button>
    </span>
  );
}

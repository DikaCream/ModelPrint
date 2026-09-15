import { Link, NavLink, Route, Routes } from "react-router-dom";
import { ModelPrintProvider, useModelPrint } from "./context/ModelPrintContext";
import { WalletButton } from "./components/WalletButton";
import { Board } from "./pages/Board";
import { ClaimPage } from "./pages/Claim";
import { Profiles } from "./pages/Profiles";
import { Attest } from "./pages/Attest";
import { CONTRACT_ADDRESS, EXPLORER_ADDR, formatGen, shortAddr } from "./config";

function InstrumentBar() {
  const { stats } = useModelPrint();

  return (
    <header className="bar">
      <Link to="/" className="brand">
        <span className="brand-mark" aria-hidden="true">
          ◎
        </span>
        <span className="brand-text">
          <strong>ModelPrint</strong>
          <em>provenance registry</em>
        </span>
      </Link>

      <nav className="bar-nav" aria-label="Main">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "on" : "")}>
          Board
        </NavLink>
        <NavLink to="/profiles" className={({ isActive }) => (isActive ? "on" : "")}>
          Profiles
        </NavLink>
        <NavLink to="/attest" className={({ isActive }) => (isActive ? "on" : "")}>
          Stake a claim
        </NavLink>
      </nav>

      <div className="bar-meters" aria-label="Live contract state">
        <span className="mini">
          <i className="lamp-dot live" aria-hidden="true" />
          {stats.live} standing
        </span>
        <span className="mini">
          <i className="lamp-dot verified" aria-hidden="true" />
          {stats.verified} verified
        </span>
        <span className="mini">
          <i className="lamp-dot falsified" aria-hidden="true" />
          {stats.falsified} falsified
        </span>
        <span className="mini mono">{formatGen(stats.bonds)} GEN bonded</span>
      </div>

      <WalletButton />
    </header>
  );
}

function TxBanner() {
  const { txError, busy, dismissTx, lastTx } = useModelPrint();
  if (txError) {
    return (
      <div className="banner bad" role="alert">
        <span>{txError}</span>
        <button onClick={dismissTx}>Dismiss</button>
      </div>
    );
  }
  if (busy) {
    return (
      <div className="banner work">
        <span>
          {busy === "audit"
            ? "Validators are fetching the endpoint and agreeing on a verdict. This takes a few seconds."
            : "Waiting for the transaction to land…"}
        </span>
      </div>
    );
  }
  if (lastTx) {
    return (
      <div className="banner ok">
        <span>
          Confirmed.{" "}
          <a href={`https://explorer-studio.genlayer.com/tx/${lastTx}`} target="_blank" rel="noreferrer">
            Inspect it
          </a>
        </span>
        <button onClick={dismissTx}>Dismiss</button>
      </div>
    );
  }
  return null;
}

function Footer() {
  return (
    <footer className="site-foot">
      <p>
        ModelPrint runs on GenLayer StudioNet. Contract{" "}
        <a href={EXPLORER_ADDR(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">
          {shortAddr(CONTRACT_ADDRESS)}
        </a>
        .
      </p>
      <p className="fine">
        Demo network. GEN here holds no value. The verification path is the point.
      </p>
    </footer>
  );
}

function NotFound() {
  return (
    <main className="page">
      <div className="empty">
        <p className="empty-title">Nothing at this address.</p>
        <p>
          <Link to="/">Back to the board</Link>
        </p>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <ModelPrintProvider>
      <div className="shell">
        <InstrumentBar />
        <TxBanner />
        <Routes>
          <Route path="/" element={<Board />} />
          <Route path="/claims/:id" element={<ClaimPage />} />
          <Route path="/profiles" element={<Profiles />} />
          <Route path="/attest" element={<Attest />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Footer />
      </div>
    </ModelPrintProvider>
  );
}

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createModelPrintClient } from "../lib/client";
import { ModelPrint } from "../lib/contract";
import { Attestation, ProfileSummary, Stats } from "../lib/types";
import { describeError } from "../lib/errors";
import { useWallet } from "../hooks/useWallet";

const EMPTY_STATS: Stats = {
  profiles: 0,
  attestations: 0,
  live: 0,
  verified: 0,
  falsified: 0,
  unreachable: 0,
  bonds: 0n,
  paid: 0n,
};

interface ModelPrintCtx {
  wallet: ReturnType<typeof useWallet>;
  read: ModelPrint;
  attestations: Attestation[];
  profiles: ProfileSummary[];
  stats: Stats;
  loading: boolean;
  error: string | null;
  busy: string | null;
  txError: string | null;
  lastTx: string | null;
  version: number;
  refresh: () => void;
  dismissTx: () => void;
  run: (label: string, fn: (c: ModelPrint) => Promise<string>) => Promise<boolean>;
}

const Ctx = createContext<ModelPrintCtx | null>(null);

export function ModelPrintProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const [attestations, setAttestations] = useState<Attestation[]>([]);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const readClient = useMemo(() => new ModelPrint(createModelPrintClient()), []);
  const writeClient = useMemo(
    () => new ModelPrint(createModelPrintClient(wallet.address)),
    [wallet.address],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [claims, models, summary] = await Promise.all([
        readClient.listAttestations(0, 100),
        readClient.listProfiles(0, 100),
        readClient.getStats(),
      ]);
      setAttestations(claims.sort((a, b) => b.id - a.id));
      setProfiles(models);
      setStats(summary);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLoading(false);
    }
  }, [readClient]);

  useEffect(() => {
    load();
  }, [load, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const dismissTx = useCallback(() => {
    setTxError(null);
    setLastTx(null);
  }, []);

  const run = useCallback(
    async (label: string, fn: (c: ModelPrint) => Promise<string>) => {
      if (!wallet.address) {
        setTxError("Connect a wallet first.");
        return false;
      }
      setBusy(label);
      setTxError(null);
      setLastTx(null);
      try {
        const hash = await fn(writeClient);
        setLastTx(hash);
        await writeClient.waitForReceipt(hash);
        setVersion((v) => v + 1);
        return true;
      } catch (e) {
        setTxError(describeError(e));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [wallet.address, writeClient],
  );

  const value: ModelPrintCtx = {
    wallet,
    read: readClient,
    attestations,
    profiles,
    stats,
    loading,
    error,
    busy,
    txError,
    lastTx,
    version,
    refresh,
    dismissTx,
    run,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useModelPrint(): ModelPrintCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useModelPrint must be used inside ModelPrintProvider");
  return ctx;
}

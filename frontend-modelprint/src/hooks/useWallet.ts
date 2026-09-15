import { useCallback, useEffect, useState } from "react";
import {
  connectWallet,
  getAccounts,
  getBalance,
  getChainId,
  hasEthereumProvider,
  onAccountsChanged,
  onChainChanged,
} from "../lib/client";
import { describeError } from "../lib/errors";

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [hasProvider, setHasProvider] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint>(0n);
  const [chainId, setChainId] = useState<string | null>(null);

  const refreshBalance = useCallback(async (addr: string) => {
    setBalance(await getBalance(addr));
  }, []);

  useEffect(() => {
    setHasProvider(hasEthereumProvider());
    getChainId().then(setChainId);
    getAccounts().then((accounts) => {
      if (accounts.length) {
        setAddress(accounts[0]);
        refreshBalance(accounts[0]);
      }
    });
  }, [refreshBalance]);

  useEffect(() => {
    const offAccounts = onAccountsChanged((accounts) => {
      const next = accounts.length ? accounts[0] : null;
      setAddress(next);
      if (next) refreshBalance(next);
      else setBalance(0n);
    });
    const offChain = onChainChanged((id) => {
      setChainId(id);
      if (address) refreshBalance(address);
    });
    return () => {
      offAccounts();
      offChain();
    };
  }, [address, refreshBalance]);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const addr = await connectWallet();
      setAddress(addr);
      setChainId(await getChainId());
      await refreshBalance(addr);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }, [refreshBalance]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setBalance(0n);
  }, []);

  return { address, hasProvider, busy, error, balance, chainId, connect, disconnect };
}

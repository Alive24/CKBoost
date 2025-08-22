import { useState, useEffect, useCallback } from "react";
import { ccc } from "@ckb-ccc/connector-react";
import { udtRegistry, UDTToken } from "@/lib/services/udt-registry";
import { debug } from "@/lib/utils/debug";

interface UDTBalance {
  raw: bigint;
  formatted: string;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch and manage UDT balance for a specific token
 */
export function useUDTBalance(
  token: UDTToken | undefined,
  signer: ccc.Signer | undefined
): UDTBalance & { refresh: () => Promise<void> } {
  const [balance, setBalance] = useState<UDTBalance>({
    raw: 0n,
    formatted: "0",
    loading: false,
    error: null
  });

  const fetchBalance = useCallback(async () => {
    if (!token || !signer) {
      setBalance({
        raw: 0n,
        formatted: "0",
        loading: false,
        error: null
      });
      return;
    }

    setBalance(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await udtRegistry.getBalance(token, signer);
      setBalance({
        raw: result.raw,
        formatted: result.formatted,
        loading: false,
        error: null
      });
    } catch (error) {
      debug.error(`Failed to fetch balance for ${token.symbol}:`, error);
      setBalance({
        raw: 0n,
        formatted: "0",
        loading: false,
        error: error instanceof Error ? error.message : "Failed to fetch balance"
      });
    }
  }, [token, signer]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return {
    ...balance,
    refresh: fetchBalance
  };
}

/**
 * Hook to fetch balances for multiple UDT tokens
 */
export function useMultipleUDTBalances(
  tokens: UDTToken[],
  signer: ccc.Signer | undefined
): {
  balances: Map<string, UDTBalance>;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [balances, setBalances] = useState<Map<string, UDTBalance>>(new Map());
  const [loading, setLoading] = useState(false);

  const fetchAllBalances = useCallback(async () => {
    if (!signer || tokens.length === 0) {
      setBalances(new Map());
      return;
    }

    setLoading(true);
    const newBalances = new Map<string, UDTBalance>();

    await Promise.all(
      tokens.map(async (token) => {
        try {
          const result = await udtRegistry.getBalance(token, signer);
          newBalances.set(token.symbol, {
            raw: result.raw,
            formatted: result.formatted,
            loading: false,
            error: null
          });
        } catch (error) {
          debug.error(`Failed to fetch balance for ${token.symbol}:`, error);
          newBalances.set(token.symbol, {
            raw: 0n,
            formatted: "0",
            loading: false,
            error: error instanceof Error ? error.message : "Failed to fetch balance"
          });
        }
      })
    );

    setBalances(newBalances);
    setLoading(false);
  }, [tokens, signer]);

  useEffect(() => {
    fetchAllBalances();
  }, [fetchAllBalances]);

  return {
    balances,
    loading,
    refresh: fetchAllBalances
  };
}

/**
 * Hook to manage all available UDT tokens and their balances
 */
export function useUDTRegistry(signer: ccc.Signer | undefined) {
  const [tokens, setTokens] = useState<UDTToken[]>([]);
  const [selectedToken, setSelectedToken] = useState<UDTToken | undefined>();
  
  useEffect(() => {
    const allTokens = udtRegistry.getAllTokens();
    setTokens(allTokens);
    if (allTokens.length > 0 && !selectedToken) {
      setSelectedToken(allTokens[0]);
    }
  }, []);

  const balance = useUDTBalance(selectedToken, signer);

  return {
    tokens,
    selectedToken,
    setSelectedToken,
    balance,
    registry: udtRegistry
  };
}
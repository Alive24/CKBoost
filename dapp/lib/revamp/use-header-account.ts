"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ccc } from "@ckb-ccc/connector-react";
import { ProtocolData } from "ssri-ckboost/types";
import { normalizePermissionHash } from "./campaign-permissions";

export interface HeaderAccountScope {
  /** Home passes Discovery's cell; details pass the authoritative protocol cell.
   * No provider or role context is conditionally mounted inside this hook. */
  protocolCell: ccc.Cell | null;
  protocolLoading?: boolean;
  protocolError?: string | null;
}

export type HeaderPointsStatus = "disconnected" | "loading" | "ready" | "unavailable" | "error";

const clientIds = new WeakMap<ccc.Client, number>();
let nextClientId = 1;
function clientScope(client: ccc.Client): number {
  const existing = clientIds.get(client);
  if (existing) return existing;
  const id = nextClientId++;
  clientIds.set(client, id);
  return id;
}

/** Spendable Points only. Never scan transactions, profile history or claims.
 * Unlike the legacy helper, RPC/malformed-data failures reject rather than
 * becoming an apparently authoritative zero balance. */
export async function readHeaderPointsBalance(
  client: ccc.Client,
  lock: ccc.Script,
  protocolTypeHash: ccc.Hex,
  pointsCodeHash: ccc.Hex,
  isCurrent: () => boolean = () => true,
): Promise<bigint> {
  const lockHash = lock.hash().toLowerCase();
  const type = {codeHash: pointsCodeHash, hashType: "type" as const, args: protocolTypeHash};
  let points = 0n;
  for await (const cell of client.findCells({
    script: type, scriptType: "type", scriptSearchMode: "exact",
    filter: {script: lock}, withData: true,
  })) {
    if (!isCurrent()) throw new Error("The wallet or network changed.");
    const actualType = cell.cellOutput.type;
    // Keep the query scope explicit even if an indexer returns unrelated cells.
    if (!actualType || actualType.codeHash.toLowerCase() !== pointsCodeHash.toLowerCase() ||
      actualType.hashType !== "type" || actualType.args.toLowerCase() !== protocolTypeHash.toLowerCase() ||
      cell.cellOutput.lock.hash().toLowerCase() !== lockHash) continue;
    const bytes = ccc.bytesFrom(cell.outputData);
    if (bytes.length < 16) throw new Error("A Points balance cell could not be read.");
    points += ccc.numLeFromBytes(bytes.slice(0, 16));
  }
  if (!isCurrent()) throw new Error("The wallet or network changed.");
  return points;
}

interface AccountIdentity {
  signer: ccc.Signer;
  client: ccc.Client;
  revision: number;
  address: string | null;
  lockHash: ccc.Hex | null;
  lock: ccc.Script | null;
  error: string | null;
}

export function useHeaderAccount({protocolCell, protocolLoading = false, protocolError = null}: HeaderAccountScope) {
  const signer = ccc.useSigner();
  const {client} = ccc.useCcc();
  const queryClient = useQueryClient();
  const [revision, setRevision] = useState(0);
  const [resolved, setResolved] = useState<AccountIdentity | null>(null);
  const current = useRef({signer, client});
  current.current = {signer, client};

  const protocol = useMemo(() => {
    if (!protocolCell) return {hash: null, codeHash: null, error: null};
    try {
      const hash = normalizePermissionHash(protocolCell.cellOutput.type?.hash());
      const decoded = ProtocolData.decode(protocolCell.outputData);
      const codeHash = normalizePermissionHash(ccc.hexFrom(decoded.protocol_config.script_code_hashes.ckb_boost_points_udt_type_code_hash));
      if (!hash || !codeHash) throw new Error("The Points configuration is unavailable.");
      return {hash: hash as ccc.Hex, codeHash: codeHash as ccc.Hex, error: null};
    } catch {
      return {hash: null, codeHash: null, error: "The Points configuration is unavailable."};
    }
  }, [protocolCell]);

  useEffect(() => {
    if (!signer) return;
    let cancelled = false;
    signer.getRecommendedAddressObj().then(address => {
      const lockHash = normalizePermissionHash(address.script.hash());
      const fullAddress = address.toString();
      if (!lockHash || !fullAddress || fullAddress === "[object Object]") throw new Error("The current wallet address is unavailable.");
      if (!cancelled) setResolved({signer, client, revision, address: fullAddress, lockHash: lockHash as ccc.Hex, lock: address.script, error: null});
    }).catch(() => {
      if (!cancelled) setResolved({signer, client, revision, address: null, lockHash: null, lock: null, error: "The current wallet address is unavailable."});
    });
    return () => {cancelled = true;};
  }, [signer, client, revision]);

  const identity = signer && resolved?.signer === signer && resolved.client === client && resolved.revision === revision ? resolved : null;
  const enabled = Boolean(identity?.lock && identity.lockHash && protocol.hash && protocol.codeHash && !protocolLoading && !protocolError && !protocol.error);
  const scope = clientScope(client);
  const balance = useQuery({
    queryKey: ["revamp-header-points", scope, protocol.hash, protocol.codeHash, identity?.lockHash ?? null],
    enabled,
    staleTime: 30_000,
    gcTime: 120_000,
    retry: false,
    queryFn: async () => {
      if (!signer || !identity?.lock || !identity.lockHash || !protocol.hash || !protocol.codeHash) throw new Error("The current wallet is unavailable.");
      const captured = {signer, client};
      const isCurrent = () => current.current.signer === captured.signer && current.current.client === captured.client;
      const checkAddress = async () => {
        if (!isCurrent()) throw new Error("The wallet or network changed.");
        const hash = (await signer.getRecommendedAddressObj()).script.hash().toLowerCase();
        if (!isCurrent()) throw new Error("The wallet or network changed.");
        if (hash !== identity.lockHash) {
          setRevision(value => value + 1);
          throw new Error("The wallet account changed.");
        }
      };
      await checkAddress();
      const points = await readHeaderPointsBalance(client, identity.lock, protocol.hash, protocol.codeHash, isCurrent);
      await checkAddress();
      return points;
    },
  });

  const refresh = useCallback(() => {
    setRevision(value => value + 1);
    void queryClient.invalidateQueries({queryKey: ["revamp-header-points", scope]});
  }, [queryClient, scope]);

  let pointsStatus: HeaderPointsStatus;
  if (!signer) pointsStatus = "disconnected";
  else if (!identity || protocolLoading) pointsStatus = "loading";
  else if (identity.error || protocolError || protocol.error || balance.isError) pointsStatus = "error";
  else if (!enabled) pointsStatus = "unavailable";
  else pointsStatus = balance.isSuccess ? "ready" : "loading";

  return {
    isConnected: Boolean(signer),
    address: identity?.address ?? null,
    displayAddress: identity?.address ? identity.address.length <= 8 ? identity.address : `${identity.address.slice(0, 4)}...${identity.address.slice(-4)}` : null,
    lockHash: identity?.lockHash ?? null,
    points: pointsStatus === "ready" ? balance.data ?? null : null,
    pointsStatus,
    isLoading: pointsStatus === "loading",
    error: !signer ? null : identity?.error || protocolError || protocol.error || (balance.isError ? "The Points balance could not be loaded." : null),
    refresh,
  };
}

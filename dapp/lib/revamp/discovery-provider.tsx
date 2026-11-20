"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ccc } from "@ckb-ccc/connector-react";
import { ProtocolData } from "ssri-ckboost/types";
import { currentDeployment as deploymentManager, getCurrentProtocolTypeScript as getProtocolTypeScript } from "@/lib/ckb/current-deployment";
import { createEndorserResolver, type EndorserResolver } from "@/lib/utils/endorser-resolver";
import {
  DISCOVERY_FRESHNESS_MS,
  DiscoveryCampaignUnavailableError,
  loadDiscoveryCampaigns,
  shouldRetryDiscovery,
  type DiscoveryCampaignSnapshot,
} from "./discovery-loader";
import { getDiscoveryReadClient } from "./discovery-read-client";
import { readDiscoveryCampaignBatch, readDiscoveryCampaignExact, readDiscoveryProtocol } from "./discovery-cells";

type DecodedProtocol = ReturnType<typeof ProtocolData.decode>;
interface ProtocolSnapshot { cell: ccc.Cell; data: DecodedProtocol }

export interface DiscoveryContextValue {
  protocolCell: ccc.Cell | null;
  protocolData: DecodedProtocol | null;
  endorserResolver: EndorserResolver;
  campaignCells: ccc.Cell[];
  protocolLoading: boolean;
  campaignLoading: boolean;
  protocolError: Error | null;
  campaignError: Error | null;
  pendingCount: number;
  retry: () => Promise<void>;
  refresh: () => Promise<void>;
}

const DiscoveryContext = createContext<DiscoveryContextValue | null>(null);

export function DiscoveryProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const configuration = useMemo(() => {
    try {
      const script = getProtocolTypeScript();
      const network = deploymentManager.getCurrentNetwork();
      return {
        scope: [network, script.codeHash.toLowerCase(), script.hashType, script.args.toLowerCase()],
        script,
        client: getDiscoveryReadClient(network),
        error: null,
      };
    } catch (error) {
      return { scope: ["invalid-configuration"], script: null, client: null, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }, []);
  const client = configuration.client;
  const protocolKey = ["revamp-discovery", "protocol", ...configuration.scope] as const;
  const protocol = useQuery<ProtocolSnapshot, Error>({
    queryKey: protocolKey,
    enabled: Boolean(client && !configuration.error),
    staleTime: DISCOVERY_FRESHNESS_MS,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: shouldRetryDiscovery,
    retryDelay: 300,
    queryFn: async ({ signal }) => {
      if (!client || !configuration.script) throw new Error("The discovery configuration is unavailable.");
      const cell = await readDiscoveryProtocol(client, configuration.script, signal);
      return { cell, data: ProtocolData.decode(cell.outputData) };
    },
  });

  const current = protocol.data;
  const approvedIds = useMemo(() => current
    ? [...new Set(current.data.campaigns_approved.map(id => ccc.hexFrom(id).toLowerCase()))].sort()
    : [], [current]);
  const outpoint = current
    ? `${current.cell.outPoint.txHash}:${current.cell.outPoint.index.toString()}`
    : "pending-protocol";
  const groupKey = ["revamp-discovery", "campaigns", ...configuration.scope, outpoint, approvedIds] as const;
  const protocolTypeHash = current?.cell.cellOutput.type?.hash();
  const codeHash = current ? ccc.hexFrom(current.data.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash) : null;
  // Membership belongs to the protocol snapshot, while each activity's content
  // belongs to its actual protocol/type/ID. Unrelated protocol edits must not
  // invalidate every already-loaded campaign.
  const campaignRootKey = ["revamp-discovery", "campaign", ...configuration.scope, protocolTypeHash, codeHash] as const;
  const campaignKey = (id: string) => [...campaignRootKey, id] as const;
  const cachedRecords = approvedIds.flatMap(id => {
    const cell = queryClient.getQueryData<ccc.Cell>(campaignKey(id));
    return cell ? [{id, cell}] : [];
  });

  const campaigns = useQuery<DiscoveryCampaignSnapshot<ccc.Cell>, Error>({
    queryKey: groupKey,
    enabled: Boolean(current && client),
    staleTime: DISCOVERY_FRESHNESS_MS,
    gcTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    placeholderData: cachedRecords.length ? {records: cachedRecords, errors: {}, pendingCount: approvedIds.length - cachedRecords.length} : undefined,
    queryFn: async ({ signal }) => {
      if (!current || !client || !protocolTypeHash || !codeHash) throw new Error("Protocol is not ready.");
      const initialRecords = approvedIds.flatMap(id => {
        const cell = queryClient.getQueryData<ccc.Cell>(campaignKey(id));
        return cell ? [{id, cell}] : [];
      });
      const freshIds = initialRecords.filter(({id}) => {
        const state = queryClient.getQueryState(campaignKey(id));
        return state?.status === "success" && !state.isInvalidated && state.dataUpdatedAt > Date.now() - DISCOVERY_FRESHNESS_MS;
      }).map(({id}) => id);
      const scope = {protocolTypeHash, campaignCodeHash: codeHash};
      return loadDiscoveryCampaigns({
        ids: approvedIds,
        initialRecords,
        freshIds,
        signal,
        fetchBatch: (ids, onRecord) => readDiscoveryCampaignBatch({client, scope, ids, signal, onRecord: record => {
          if (!signal.aborted) {
            queryClient.setQueryData(campaignKey(record.id), record.cell);
            onRecord(record);
          }
        }}),
        fetchCampaign: id => queryClient.fetchQuery({
          queryKey: campaignKey(id),
          staleTime: DISCOVERY_FRESHNESS_MS,
          gcTime: 5 * 60_000,
          retry: shouldRetryDiscovery,
          retryDelay: 300,
          queryFn: async ({ signal: requestSignal }) => {
            const cell = await readDiscoveryCampaignExact(client, scope, id, requestSignal);
            if (!cell) throw new DiscoveryCampaignUnavailableError();
            return cell;
          },
        }),
        onProgress: snapshot => {
          if (!signal.aborted) {
            // Keep in-flight refreshes stale across unmounts, even when seeded
            // cards make pendingCount zero. Resolving the query stamps success.
            queryClient.setQueryData(groupKey, snapshot, { updatedAt: 0 });
          }
        },
      });
    },
  });

  const endorserResolver = useMemo(() => createEndorserResolver(current?.data.endorsers_whitelist), [current]);
  const approved = useMemo(() => new Set(approvedIds), [approvedIds]);
  const campaignCells = useMemo(() => (campaigns.data?.records ?? [])
    .filter(record => approved.has(record.id)).map(record => record.cell), [campaigns.data, approved]);
  const failures = Object.keys(campaigns.data?.errors ?? {}).length;
  const campaignError = useMemo(() => campaigns.error ?? (failures
    ? new Error(`${failures} approved campaign${failures === 1 ? "" : "s"} could not be loaded.`) : null), [campaigns.error, failures]);
  const pendingCount = current ? campaigns.data?.pendingCount ?? approvedIds.length : 0;

  async function retry() {
    if (!current || protocol.error) {
      await protocol.refetch({ throwOnError: true });
      return;
    }
    // Successful individual cells are reused; failed IDs are stale and retry.
    await campaigns.refetch({ throwOnError: true });
  }

  async function refresh() {
    const result = await protocol.refetch({ throwOnError: true });
    if (!result.data) return;
    const updatedOutpoint = `${result.data.cell.outPoint.txHash}:${result.data.cell.outPoint.index.toString()}`;
    const updatedIds = [...new Set(result.data.data.campaigns_approved.map(id => ccc.hexFrom(id).toLowerCase()))].sort();
    if (updatedOutpoint === outpoint && JSON.stringify(updatedIds) === JSON.stringify(approvedIds)) {
      await queryClient.invalidateQueries({
        queryKey: campaignRootKey,
        refetchType: "none",
      });
      await campaigns.refetch({ throwOnError: true });
    }
    // A new protocol snapshot changes the complete group key, immediately
    // drops previous IDs, and starts its own approved lookup without a signer.
  }

  return <DiscoveryContext.Provider value={{
    protocolCell: current?.cell ?? null,
    protocolData: current?.data ?? null,
    endorserResolver,
    campaignCells,
    protocolLoading: !configuration.error && protocol.isPending,
    campaignLoading: Boolean(current && (campaigns.isPending || pendingCount > 0)),
    protocolError: configuration.error ?? protocol.error,
    campaignError,
    pendingCount,
    retry,
    refresh,
  }}>{children}</DiscoveryContext.Provider>;
}

export function useDiscovery(): DiscoveryContextValue {
  const value = useContext(DiscoveryContext);
  if (!value) throw new Error("useDiscovery must be used within DiscoveryProvider");
  return value;
}

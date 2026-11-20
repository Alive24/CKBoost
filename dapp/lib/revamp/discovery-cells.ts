import { ccc } from "@ckb-ccc/connector-react";
import { ConnectedTypeID } from "ssri-ckboost/types";
import { normalizePermissionHash } from "./campaign-permissions";
import { coalesceDiscoveryRead, discoveryAbortError, runDiscoveryRequest } from "./discovery-loader";

export const DISCOVERY_BATCH_PAGE_SIZE = 100;
export const DISCOVERY_BATCH_MAX_PAGES = 3;
export const DISCOVERY_BATCH_BUDGET_MS = 3_000;

export interface DiscoveryCampaignScope {
  protocolTypeHash: ccc.Hex;
  campaignCodeHash: ccc.Hex;
}

function request<T>(client: ccc.Client, key: string, read: () => Promise<T>, signal?: AbortSignal) {
  return runDiscoveryRequest(client, () => coalesceDiscoveryRead(client, key, read), {signal});
}

export async function readDiscoveryProtocol(client: ccc.Client, script: ccc.ScriptLike, signal?: AbortSignal): Promise<ccc.Cell> {
  const type = ccc.Script.from(script);
  const page = await request(client, `protocol:${type.hash()}`, () => client.findCellsPaged({
    script: type, scriptType: "type", scriptSearchMode: "exact", withData: true,
  }, "asc", 1), signal);
  const cell = page.cells.find(item => item.cellOutput.type?.eq(type));
  if (!cell) throw new Error("The configured protocol is unavailable.");
  return cell;
}

/** Indexer search results are candidates, never evidence of approval. Verify
 * the actual script and canonical full ConnectedTypeID, including protocol.
 * Neither a type-script hash nor an ID prefix is a campaign approval ID.
 */
export function discoveryCampaignId(cell: ccc.Cell, scope: DiscoveryCampaignScope): string | null {
  const script = cell.cellOutput.type;
  if (!script || script.hashType !== "type" || script.codeHash.toLowerCase() !== scope.campaignCodeHash.toLowerCase()) return null;
  try {
    const decoded = ConnectedTypeID.decode(script.args);
    const id = normalizePermissionHash(ccc.hexFrom(decoded.type_id));
    if (!id || normalizePermissionHash(ccc.hexFrom(decoded.connected_key)) !== scope.protocolTypeHash.toLowerCase() ||
      ccc.hexFrom(ConnectedTypeID.encode(decoded)).toLowerCase() !== script.args.toLowerCase()) return null;
    return id;
  } catch { return null; }
}

export async function readDiscoveryCampaignExact(client: ccc.Client, scope: DiscoveryCampaignScope, id: string, signal?: AbortSignal): Promise<ccc.Cell | undefined> {
  const normalized = normalizePermissionHash(id);
  if (!normalized) throw new Error("The approved campaign ID is invalid.");
  const args = ccc.hexFrom(ConnectedTypeID.encode({type_id: normalized, connected_key: scope.protocolTypeHash}));
  const page = await request(client, `campaign:${scope.protocolTypeHash}:${scope.campaignCodeHash}:${normalized}`, () => client.findCellsPaged({
    script: {codeHash: scope.campaignCodeHash, hashType: "type", args},
    scriptType: "type", scriptSearchMode: "exact", withData: true,
  }, "asc", 1), signal);
  return page.cells.find(cell => discoveryCampaignId(cell, scope) === normalized);
}

/** One page currently replaces sixteen separate activity lookups. Prefix
 * search is supported by the deployed indexer; args 'partial' requires a rich
 * indexer and is intentionally not used. Bounded pagination is an accelerator:
 * callers still query every uncovered approved ID exactly after this returns.
 */
export async function readDiscoveryCampaignBatch({client, scope, ids, signal, onRecord}: {
  client: ccc.Client;
  scope: DiscoveryCampaignScope;
  ids: readonly string[];
  signal?: AbortSignal;
  onRecord: (record: {id: string; cell: ccc.Cell}) => void;
}): Promise<void> {
  const missing = new Set(ids.map(id => normalizePermissionHash(id)).filter((id): id is string => Boolean(id)));
  if (!missing.size) return;
  const started = Date.now();
  let after: string | undefined;
  for (let index = 0; index < DISCOVERY_BATCH_MAX_PAGES && missing.size; index++) {
    if (signal?.aborted) throw discoveryAbortError();
    if (index > 0 && Date.now() - started >= DISCOVERY_BATCH_BUDGET_MS) break;
    const cursor = after;
    const page = await request(client, `campaign-page:${scope.campaignCodeHash}:${cursor ?? "first"}`, () => client.findCellsPaged({
      script: {codeHash: scope.campaignCodeHash, hashType: "type", args: "0x"},
      scriptType: "type", scriptSearchMode: "prefix", withData: true,
    }, "asc", DISCOVERY_BATCH_PAGE_SIZE, cursor), signal);
    if (signal?.aborted) throw discoveryAbortError();
    for (const cell of page.cells) {
      const id = discoveryCampaignId(cell, scope);
      if (id && missing.delete(id)) onRecord({id, cell});
    }
    if (page.cells.length < DISCOVERY_BATCH_PAGE_SIZE || !page.lastCursor || page.lastCursor === after) break;
    after = page.lastCursor;
  }
}

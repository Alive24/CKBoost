import { ccc } from "@ckb-ccc/connector-react";
import { ConnectedTypeID } from "ssri-ckboost/types";
import { discoveryCampaignId, readDiscoveryCampaignBatch, readDiscoveryCampaignExact, readDiscoveryProtocol, DISCOVERY_BATCH_MAX_PAGES, DISCOVERY_BATCH_PAGE_SIZE } from "../discovery-cells";
import { loadDiscoveryCampaigns } from "../discovery-loader";

// Keep the real installed CCC primitives and real Molecule codec; only the RPC
// boundary is substituted. The shared Jest setup's wallet stub is unsuitable.
jest.mock("@ckb-ccc/connector-react", () => ({ccc: jest.requireActual("@ckb-ccc/core").ccc}));
const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as ccc.Hex;
const scope = {protocolTypeHash: hash(1), campaignCodeHash: hash(2)};
function campaign(id: ccc.Hex, protocol = scope.protocolTypeHash, codeHash = scope.campaignCodeHash): ccc.Cell {
  return ccc.Cell.from({outPoint: {txHash: id, index: 0}, cellOutput: {
    lock: {codeHash: hash(3), hashType: "type", args: "0x"},
    type: {codeHash, hashType: "type", args: ccc.hexFrom(ConnectedTypeID.encode({type_id: id, connected_key: protocol}))},
  }, outputData: "0x"});
}
const page = (cells: ccc.Cell[], lastCursor = "end") => ({cells, lastCursor});
const makeClient = () => {
  const findCellsPaged = jest.fn<ReturnType<ccc.Client["findCellsPaged"]>, Parameters<ccc.Client["findCellsPaged"]>>();
  return {client: {findCellsPaged} as unknown as ccc.Client, findCellsPaged};
};

it("needs two network operations for the measured protocol + sixteen campaigns shape", async () => {
  const {client, findCellsPaged} = makeClient();
  const protocolType = ccc.Script.from({codeHash: hash(4), hashType: "type", args: hash(5)});
  const protocolCell = ccc.Cell.from({outPoint: {txHash: hash(6), index: 0}, cellOutput: {lock: {codeHash: hash(3), hashType: "type", args: "0x"}, type: protocolType}, outputData: "0x"});
  const realScope = {...scope, protocolTypeHash: protocolType.hash()};
  const ids = Array.from({length: 16}, (_, index) => hash(index + 10));
  findCellsPaged.mockResolvedValueOnce(page([protocolCell])).mockResolvedValueOnce(page(ids.map(id => campaign(id, realScope.protocolTypeHash))));
  await expect(readDiscoveryProtocol(client, protocolType)).resolves.toEqual(protocolCell);
  const exact = jest.fn(async (id: string) => readDiscoveryCampaignExact(client, realScope, id));
  const result = await loadDiscoveryCampaigns({ids,
    fetchBatch: (requested, onRecord) => readDiscoveryCampaignBatch({client, scope: realScope, ids: requested, onRecord}),
    fetchCampaign: async id => {const cell = await exact(id); if (!cell) throw Error("missing"); return cell;},
  });
  expect(result.records).toHaveLength(16);
  expect(findCellsPaged).toHaveBeenCalledTimes(2);
  expect(exact).not.toHaveBeenCalled();
  expect(findCellsPaged.mock.calls[1][0]).toMatchObject({scriptSearchMode: "prefix", withData: true});
});

it("filters unapproved, other-protocol, different-script and malformed candidates by the full canonical identity", async () => {
  const {client, findCellsPaged} = makeClient();
  const good = campaign(hash(10));
  const malformed = campaign(hash(10)); malformed.cellOutput.type!.args = "0x1234";
  const wrongHashType = campaign(hash(10)); wrongHashType.cellOutput.type!.hashType = "data";
  findCellsPaged.mockResolvedValue(page([campaign(hash(11)), campaign(hash(10), hash(99)), campaign(hash(10), scope.protocolTypeHash, hash(99)), malformed, wrongHashType, good]));
  const onRecord = jest.fn();
  await readDiscoveryCampaignBatch({client, scope, ids: [hash(10), hash(10).slice(0, 12), good.cellOutput.type!.hash()], onRecord});
  expect(onRecord).toHaveBeenCalledTimes(1);
  expect(onRecord).toHaveBeenCalledWith({id: hash(10), cell: good});
  expect(discoveryCampaignId(campaign(hash(10), hash(99)), scope)).toBeNull();
});

it("does not trust an exact indexer response with a different complete campaign or protocol", async () => {
  const {client, findCellsPaged} = makeClient();
  findCellsPaged.mockResolvedValueOnce(page([campaign(hash(11))])).mockResolvedValueOnce(page([campaign(hash(10), hash(99))]));
  await expect(readDiscoveryCampaignExact(client, scope, hash(10))).resolves.toBeUndefined();
  await expect(readDiscoveryCampaignExact(client, scope, hash(10))).resolves.toBeUndefined();
  const onRecord = jest.fn();
  await readDiscoveryCampaignBatch({client, scope, ids: [hash(10).slice(0, 12)], onRecord});
  expect(onRecord).not.toHaveBeenCalled();
  expect(findCellsPaged).toHaveBeenCalledTimes(2);
});

it("paginates the supported prefix search and falls back exactly for IDs beyond its bounded scan", async () => {
  const {client, findCellsPaged} = makeClient();
  const junk = Array.from({length: DISCOVERY_BATCH_PAGE_SIZE}, (_, index) => campaign(hash(index + 100), hash(99)));
  for (let index = 0; index < DISCOVERY_BATCH_MAX_PAGES; index++) findCellsPaged.mockResolvedValueOnce(page(junk, `cursor-${index}`));
  findCellsPaged.mockResolvedValueOnce(page([campaign(hash(10))]));
  const result = await loadDiscoveryCampaigns({ids: [hash(10)],
    fetchBatch: (ids, onRecord) => readDiscoveryCampaignBatch({client, scope, ids, onRecord}),
    fetchCampaign: async id => {const cell = await readDiscoveryCampaignExact(client, scope, id); if (!cell) throw Error("missing"); return cell;},
  });
  expect(result.records.map(record => record.id)).toEqual([hash(10)]);
  expect(findCellsPaged).toHaveBeenCalledTimes(DISCOVERY_BATCH_MAX_PAGES + 1);
  expect(findCellsPaged.mock.calls.at(-1)![0]).toMatchObject({scriptSearchMode: "exact"});
  expect(findCellsPaged.mock.calls[1][3]).toBe("cursor-0");
});

it("keeps successful first-page cells even if the next page fails, then resolves uncovered IDs exactly", async () => {
  const {client, findCellsPaged} = makeClient();
  const junk = Array.from({length: DISCOVERY_BATCH_PAGE_SIZE - 1}, (_, index) => campaign(hash(index + 100), hash(99)));
  findCellsPaged.mockResolvedValueOnce(page([campaign(hash(10)), ...junk], "next")).mockRejectedValueOnce(Error("unavailable page")).mockResolvedValueOnce(page([campaign(hash(11))]));
  const result = await loadDiscoveryCampaigns({ids: [hash(10), hash(11)],
    fetchBatch: (ids, onRecord) => readDiscoveryCampaignBatch({client, scope, ids, onRecord}),
    fetchCampaign: async id => {const cell = await readDiscoveryCampaignExact(client, scope, id); if (!cell) throw Error("missing"); return cell;},
  });
  expect(result.records.map(record => record.id)).toEqual([hash(10), hash(11)]);
  expect(findCellsPaged).toHaveBeenCalledTimes(3);
});

it("stops the batch between pages when the time budget expires", async () => {
  const {client, findCellsPaged} = makeClient();
  const junk = Array.from({length: DISCOVERY_BATCH_PAGE_SIZE}, (_, index) => campaign(hash(index + 100), hash(99)));
  findCellsPaged.mockResolvedValue(page(junk, "more"));
  const clock = jest.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(3_001);
  try {
    await readDiscoveryCampaignBatch({client, scope, ids: [hash(10)], onRecord: jest.fn()});
    expect(findCellsPaged).toHaveBeenCalledTimes(1);
  } finally {clock.mockRestore();}
});

it("does not issue RPC after cancellation or accept a different protocol script", async () => {
  const {client, findCellsPaged} = makeClient();
  const controller = new AbortController(); controller.abort();
  await expect(readDiscoveryCampaignBatch({client, scope, ids: [hash(10)], signal: controller.signal, onRecord: jest.fn()})).rejects.toMatchObject({name: "AbortError"});
  expect(findCellsPaged).not.toHaveBeenCalled();
  findCellsPaged.mockResolvedValueOnce(page([campaign(hash(10))]));
  await expect(readDiscoveryProtocol(client, {codeHash: hash(4), hashType: "type", args: hash(5)})).rejects.toThrow("configured protocol");
});

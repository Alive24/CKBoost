/** @jest-environment node */
import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { ccc } from "@ckb-ccc/core";
import { TESTNET_CODE_RELEASES, type TestnetCodeId } from "../testnet-code-releases";
import { buildLocalIsolatedTestnetProfile, loadLocalIsolatedTestnetProfile } from "../testnet-protocol-profile-loader";
import { GET } from "../../../app/revamp/testnet-setup/protocol-profile/route";

jest.mock("node:fs/promises", () => ({ open: jest.fn() }));
jest.mock("@ckb-ccc/connector-react", () => { throw new Error("Public profile loading must not initialize a wallet connector."); });
const savedEnable = process.env.CKBOOST_ENABLE_TESTNET_SETUP, savedNetwork = process.env.NEXT_PUBLIC_CKB_NETWORK;
const owner = ccc.Script.from({ codeHash: "0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb", hashType: "type", args: "0x1270de01d042a23bfab1dc06375138b48ea03d006900" });
function manifest(id: TestnetCodeId) {
  const pin = TESTNET_CODE_RELEASES[id], protocol = id === "protocol-lock";
  const type = ccc.Script.from({ codeHash: "0x00000000000000000000000000000000000000000000000000545950455f4944", hashType: "type", args: protocol ? "0x06661a546d171ae6f280f3f1363070c7d1e7ad7dc1032d566c7b16f804d57ab4" : "0xfe4dcdc1378be473b33321f30db589d220a2947a0156aa41e809af6f1cae5027" });
  return {
    schema: "ckboost-testnet-code-deployment/v1", network: "testnet", contract: id, contractSize: pin.byteLength,
    transactionHash: protocol ? "0xdb31514a0e178b3c5bd6f21d34a1cc20c0b7badbb3ebd6711c9bb2711a58a066" : "0x72dc50dbe634b1746e2d6033009c751ff02ff6bceab7d601e9c36fbcfb1d4a3d",
    index: "0x0", blockNumber: protocol ? "0x160d049" : "0x160d074", typeScript: type, typeHash: type.hash(),
    dataHash: pin.dataHash, hashType: "type", isTypeId: true,
    capacityShannons: ccc.CellOutput.from({ lock: owner, type }, new Uint8Array(pin.byteLength)).capacity.toString(), lockScript: owner,
    ignoredPrivateObject: { shouldNeverBeReturned: "not-public-metadata" },
  };
}
function setup() {
  const close = jest.fn(async () => {});
  jest.mocked(open).mockImplementation(async file => {
    const id = String(file).endsWith("ckboost-testnet-protocol-lock-confirmed.json") ? "protocol-lock" : "campaign-type";
    const text = JSON.stringify(manifest(id));
    return { stat: async () => ({ isFile: () => true, size: text.length }), readFile: async () => text, close } as unknown as Awaited<ReturnType<typeof open>>;
  });
  jest.spyOn(process, "cwd").mockReturnValue("/qa/work/CKBoost/dapp");
  process.env.CKBOOST_ENABLE_TESTNET_SETUP = "1"; process.env.NEXT_PUBLIC_CKB_NETWORK = "testnet";
  return { close };
}
const request = (url = "http://localhost:3203/revamp/testnet-setup/protocol-profile", host?: string) => new Request(url, host ? { headers: { host } } : undefined);
afterEach(() => {
  jest.restoreAllMocks(); jest.mocked(open).mockReset();
  if (savedEnable === undefined) delete process.env.CKBOOST_ENABLE_TESTNET_SETUP; else process.env.CKBOOST_ENABLE_TESTNET_SETUP = savedEnable;
  if (savedNetwork === undefined) delete process.env.NEXT_PUBLIC_CKB_NETWORK; else process.env.NEXT_PUBLIC_CKB_NETWORK = savedNetwork;
});

it("builds only the reviewed public profile, preserving seven dependency identities and two distinct new code records", () => {
  const result = buildLocalIsolatedTestnetProfile(manifest("protocol-lock"), manifest("campaign-type"));
  expect(result.schema).toBe("ckboost-isolated-testnet-profile/v1"); expect(result.network).toBe("testnet");
  expect(result.executorUrl).toBe("http://127.0.0.1:9091/"); expect(result.dependencies).toHaveLength(7);
  expect(result.newCode.protocolLock.typeHash).toBe("0xe91b5a78463c293318331c21d372e031eb9ffad87b379fbe0563222fcdd28815");
  expect(result.newCode.campaignType.typeHash).toBe("0x9004d12f500e558df19c14e08907e014dbfc50ae249500bb5c389f883a1487d2");
  expect(JSON.stringify(result)).not.toContain("ignoredPrivateObject");
});

it.each([
  { network: "mainnet" }, { contract: "campaign-type" }, { contractSize: 5 }, { index: "0x1" },
  { dataHash: `0x${"ab".repeat(32)}` }, { typeHash: `0x${"ab".repeat(32)}` }, { capacityShannons: "1" }, { blockNumber: "0x0" },
  { lockScript: { ...owner, args: "0x1234" } },
])("rejects changed owner/release/creation identity rather than exposing a usable profile: %j", changed => {
  expect(() => buildLocalIsolatedTestnetProfile({ ...manifest("protocol-lock"), ...changed }, manifest("campaign-type"))).toThrow("isolated profile");
});

it("reads only two fixed public manifest files, closes both handles and excludes local/private objects", async () => {
  const { close } = setup(); const result = await loadLocalIsolatedTestnetProfile();
  expect(open).toHaveBeenCalledWith("/qa/outputs/ckboost-testnet-protocol-lock-confirmed.json", constants.O_RDONLY | constants.O_NOFOLLOW);
  expect(open).toHaveBeenCalledWith("/qa/outputs/ckboost-testnet-campaign-type-confirmed.json", constants.O_RDONLY | constants.O_NOFOLLOW);
  expect(close).toHaveBeenCalledTimes(2); expect(result.newCode.protocolLock.contract).toBe("protocol-lock");
  expect(JSON.stringify(result)).not.toContain("not-public-metadata");
});

it("denies disabled, mainnet and nonlocal requests before reading any files", async () => {
  setup(); delete process.env.CKBOOST_ENABLE_TESTNET_SETUP;
  expect((await GET(request())).status).toBe(404);
  process.env.CKBOOST_ENABLE_TESTNET_SETUP = "1"; process.env.NEXT_PUBLIC_CKB_NETWORK = "mainnet";
  expect((await GET(request())).status).toBe(404); process.env.NEXT_PUBLIC_CKB_NETWORK = "testnet";
  expect((await GET(request("https://ckboost.example/revamp/testnet-setup/protocol-profile"))).status).toBe(404);
  expect((await GET(request(undefined, "remote.example"))).status).toBe(404);
  expect(open).not.toHaveBeenCalled();
});

it("returns no-store public JSON locally and a generic unavailable error without leaking filesystem details", async () => {
  setup(); const response = await GET(request()); expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store"); expect((await response.json()).newCode.campaignType.contract).toBe("campaign-type");
  jest.mocked(open).mockRejectedValue(new Error("ENOENT /private/credential/file"));
  const unavailable = await GET(request()); expect(unavailable.status).toBe(503);
  expect(await unavailable.text()).not.toMatch(/ENOENT|credential|\/private/);
});

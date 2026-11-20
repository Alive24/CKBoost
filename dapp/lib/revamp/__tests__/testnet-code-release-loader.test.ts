/** @jest-environment node */
import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { ccc } from "@ckb-ccc/core";
import { TESTNET_CODE_RELEASES } from "../testnet-code-releases";
import { loadReviewedTestnetRelease } from "../testnet-code-release-loader";
import { GET } from "../../../app/revamp/testnet-setup/release/[id]/route";

jest.mock("node:fs/promises", () => ({ open: jest.fn() }));
jest.mock("@ckb-ccc/connector-react", () => { throw new Error("Server release imports must not initialize the wallet connector."); });
const savedEnable = process.env.CKBOOST_ENABLE_TESTNET_SETUP, savedNetwork = process.env.NEXT_PUBLIC_CKB_NETWORK;
function fixture() {
  const bytes = new Uint8Array(128); bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
  const header = new DataView(bytes.buffer); header.setUint16(16, 2, true); header.setUint16(18, 243, true); header.setUint32(20, 1, true);
  return bytes;
}
function setup() {
  const bytes = fixture();
  const release = TESTNET_CODE_RELEASES["protocol-lock"] as { byteLength: number; dataHash: string };
  // Test-only synthetic reviewed bytes; no fixture is installed at a product path.
  jest.replaceProperty(release, "byteLength", bytes.length); jest.replaceProperty(release, "dataHash", ccc.hashCkb(bytes));
  const stat = jest.fn(async () => ({ isFile: () => true, size: bytes.length }));
  const readFile = jest.fn(async () => Buffer.from(bytes)), close = jest.fn(async () => {});
  jest.mocked(open).mockResolvedValue({ stat, readFile, close } as unknown as Awaited<ReturnType<typeof open>>);
  jest.spyOn(process, "cwd").mockReturnValue("/review/work/CKBoost/dapp");
  process.env.CKBOOST_ENABLE_TESTNET_SETUP = "1"; process.env.NEXT_PUBLIC_CKB_NETWORK = "testnet";
  return { bytes, stat, readFile, close };
}
const request = (url = "http://localhost:3203/revamp/testnet-setup/release/protocol-lock", host?: string) => new Request(url, host ? { headers: { host } } : undefined);
const context = (id = "protocol-lock") => ({ params: Promise.resolve({ id }) });
afterEach(() => {
  jest.restoreAllMocks(); jest.mocked(open).mockReset();
  if (savedEnable === undefined) delete process.env.CKBOOST_ENABLE_TESTNET_SETUP; else process.env.CKBOOST_ENABLE_TESTNET_SETUP = savedEnable;
  if (savedNetwork === undefined) delete process.env.NEXT_PUBLIC_CKB_NETWORK; else process.env.NEXT_PUBLIC_CKB_NETWORK = savedNetwork;
});

it("reads only the fixed reviewed file and validates it before returning public bytes", async () => {
  const { bytes, close } = setup();
  expect(await loadReviewedTestnetRelease("protocol-lock")).toEqual({ bytes, byteLength: bytes.length, fileName: "ckboost-protocol-lock", dataHash: ccc.hashCkb(bytes) });
  expect(open).toHaveBeenCalledWith("/review/work/testnet-release/ckboost-protocol-lock", constants.O_RDONLY | constants.O_NOFOLLOW);
  expect(close).toHaveBeenCalledTimes(1);
});

it.each(["../private", "constructor", "__proto__", "/tmp/file", "protocol-lock.exe", "protocol-lock/../../.env"])("does not access the filesystem for an unlisted id %s", async id => {
  setup(); await expect(loadReviewedTestnetRelease(id)).rejects.toThrow("not found"); expect(open).not.toHaveBeenCalled();
  expect((await GET(request(), context(id))).status).toBe(404); expect(open).not.toHaveBeenCalled();
});

it("blocks wrong-size files before reading, and same-size ELF/hash mismatches after reading", async () => {
  const { bytes, stat, readFile, close } = setup();
  stat.mockResolvedValue({ isFile: () => true, size: bytes.length + 1 });
  await expect(loadReviewedTestnetRelease("protocol-lock")).rejects.toThrow("byte size"); expect(readFile).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1);
  stat.mockResolvedValue({ isFile: () => true, size: bytes.length });
  const changed = Buffer.from(bytes); changed[100] = 1; readFile.mockResolvedValue(changed);
  await expect(loadReviewedTestnetRelease("protocol-lock")).rejects.toThrow("verification");
  changed[0] = 0; readFile.mockResolvedValue(changed);
  expect((await GET(request(), context())).status).toBe(422);
});

it("returns a generic unavailable response without leaking an underlying path", async () => {
  setup(); jest.mocked(open).mockRejectedValue(new Error("ENOENT /private/credential/file"));
  const response = await GET(request(), context()); expect(response.status).toBe(503);
  const body = await response.text(); expect(body).toContain("unavailable"); expect(body).not.toMatch(/credential|\/private|ENOENT/);
});

it("keeps disabled, mainnet and non-loopback requests off before any file read", async () => {
  setup(); delete process.env.CKBOOST_ENABLE_TESTNET_SETUP;
  expect((await GET(request(), context())).status).toBe(404);
  process.env.CKBOOST_ENABLE_TESTNET_SETUP = "1"; process.env.NEXT_PUBLIC_CKB_NETWORK = "mainnet";
  expect((await GET(request(), context())).status).toBe(404);
  process.env.NEXT_PUBLIC_CKB_NETWORK = "testnet";
  for (const url of ["http://localhost.attacker.example/revamp/testnet-setup/release/protocol-lock", "https://ckboost.netlify.app/revamp/testnet-setup/release/protocol-lock", "http://0.0.0.0/revamp/testnet-setup/release/protocol-lock"]) expect((await GET(request(url), context())).status).toBe(404);
  expect((await GET(request(undefined, "attacker.example"), context())).status).toBe(404);
  expect(open).not.toHaveBeenCalled();
});

it.each(["localhost:3203", "127.0.0.1:3203", "[::1]:3203"])("serves verified octet-stream with exact download headers on %s", async host => {
  const { bytes } = setup();
  const response = await GET(request(`http://${host}/revamp/testnet-setup/release/protocol-lock`, host), context());
  expect(response.status).toBe(200); expect(response.headers.get("content-type")).toBe("application/octet-stream");
  expect(response.headers.get("cache-control")).toBe("no-store"); expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("content-length")).toBe(String(bytes.length)); expect(response.headers.get("content-disposition")).toBe('attachment; filename="ckboost-protocol-lock"');
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
});

import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { ccc } from "@ckb-ccc/core";
import { TESTNET_CODE_RELEASES, type TestnetCodeId } from "./testnet-code-releases";
import { TESTNET_PROTOCOL_DEPENDENCY_PINS } from "./testnet-protocol-pins";

const TYPE_ID = "0x00000000000000000000000000000000000000000000000000545950455f4944";
const QA_OWNER = "0xf3da4d6310b03c2c62f3ce5d6b1573da3432549b7e2faa78d84e4a6e7b245192";
const HASH = /^0x[0-9a-f]{64}$/i;
const HEX = /^0x(?:[0-9a-f]{2})*$/i;
type Row = Record<string, unknown>;

export class IsolatedProfileLoadError extends Error {
  constructor(public readonly reason: "unavailable" | "invalid", message: string) { super(message); this.name = "IsolatedProfileLoadError"; }
}
function assert(value: unknown): asserts value {
  if (!value) throw new IsolatedProfileLoadError("invalid", "The saved code manifests do not match the reviewed releases and authorized Testnet owner. The isolated profile was not loaded.");
}
function row(value: unknown): Row { assert(value && typeof value === "object" && !Array.isArray(value)); return value as Row; }
function hash(value: unknown): ccc.Hex { assert(typeof value === "string" && HASH.test(value) && !/^0x0{64}$/i.test(value)); return value.toLowerCase() as ccc.Hex; }
function quantity(value: unknown): bigint {
  assert(typeof value === "string" && /^(?:0x[0-9a-f]{1,16}|[0-9]{1,20})$/i.test(value));
  const result = BigInt(value); assert(result >= 0n && result <= 0xffffffffffffffffn); return result;
}
function script(value: unknown): ccc.Script {
  const v = row(value); hash(v.codeHash);
  assert(["type", "data", "data1", "data2"].includes(String(v.hashType)) && typeof v.args === "string" && HEX.test(v.args) && v.args.length <= 16386);
  return ccc.Script.from({ codeHash: v.codeHash as ccc.Hex, hashType: v.hashType as ccc.HashType, args: v.args as ccc.Hex });
}
const publicScript = (s: ccc.Script) => ({ codeHash: s.codeHash, hashType: s.hashType, args: s.args });
function codeIdentity(value: unknown, id: TestnetCodeId) {
  const v = row(value), pin = TESTNET_CODE_RELEASES[id], type = script(v.typeScript), lock = script(v.lockScript);
  assert(v.schema === "ckboost-testnet-code-deployment/v1" && v.network === "testnet" && v.contract === id && v.isTypeId === true && v.hashType === "type");
  assert(v.contractSize === pin.byteLength && hash(v.dataHash) === pin.dataHash && quantity(v.index) === 0n);
  assert(type.codeHash === TYPE_ID && type.hashType === "type" && ccc.bytesFrom(type.args).length === 32 && !/^0x0{64}$/i.test(type.args));
  assert(type.hash() === hash(v.typeHash) && lock.hash() === QA_OWNER);
  const capacity = quantity(v.capacityShannons), block = quantity(v.blockNumber);
  assert(block > 0n && capacity === ccc.CellOutput.from({ lock, type }, new Uint8Array(pin.byteLength)).capacity);
  return {
    schema: "ckboost-testnet-code-deployment/v1" as const, network: "testnet" as const, contract: id,
    fileName: pin.fileName, contractName: pin.fileName, contractSize: pin.byteLength,
    transactionHash: hash(v.transactionHash), index: "0x0", blockNumber: `0x${block.toString(16)}`,
    typeScript: publicScript(type), typeHash: type.hash(), dataHash: pin.dataHash, hashType: "type" as const,
    isTypeId: true as const, capacityShannons: capacity.toString(), lockScript: publicScript(lock),
  };
}

/** Structural whitelist only. Actual code liveness and creation transactions are rechecked by unsigned preparation. */
export function buildLocalIsolatedTestnetProfile(protocolLock: unknown, campaignType: unknown) {
  try {
    const first = codeIdentity(protocolLock, "protocol-lock"), second = codeIdentity(campaignType, "campaign-type");
    assert(first.typeHash !== second.typeHash && first.transactionHash !== second.transactionHash);
    return {
      schema: "ckboost-isolated-testnet-profile/v1" as const, network: "testnet" as const,
      executorUrl: "http://127.0.0.1:9091/",
      dependencies: TESTNET_PROTOCOL_DEPENDENCY_PINS.map(pin => ({ ...pin, outPoint: { ...pin.outPoint } })),
      newCode: { protocolLock: first, campaignType: second },
    };
  } catch (cause) {
    if (cause instanceof IsolatedProfileLoadError) throw cause;
    throw new IsolatedProfileLoadError("invalid", "The saved code manifests are invalid. The isolated profile was not loaded.");
  }
}
async function readManifest(name: "ckboost-testnet-protocol-lock-confirmed.json" | "ckboost-testnet-campaign-type-confirmed.json"): Promise<unknown> {
  const file = resolve(process.cwd(), "../../../outputs", name);
  let handle: Awaited<ReturnType<typeof open>>;
  try { handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW); }
  catch { throw new IsolatedProfileLoadError("unavailable", "Both confirmed code manifests must be available locally before loading an isolated profile."); }
  try {
    const stat = await handle.stat();
    assert(stat.isFile() && stat.size > 0 && stat.size <= 32768);
    const text = await handle.readFile("utf8"); assert(text.length <= 32768);
    return JSON.parse(text);
  } catch (cause) {
    if (cause instanceof IsolatedProfileLoadError) throw cause;
    throw new IsolatedProfileLoadError("invalid", "A saved public code manifest could not be decoded.");
  } finally { await handle.close(); }
}
/** Fixed two public files only; no request-controlled path, private configuration, registry write or chain call. */
export async function loadLocalIsolatedTestnetProfile() {
  const [protocolLock, campaignType] = await Promise.all([
    readManifest("ckboost-testnet-protocol-lock-confirmed.json"), readManifest("ckboost-testnet-campaign-type-confirmed.json"),
  ]);
  return buildLocalIsolatedTestnetProfile(protocolLock, campaignType);
}

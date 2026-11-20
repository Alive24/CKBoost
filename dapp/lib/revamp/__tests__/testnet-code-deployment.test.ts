import { ccc } from "@ckb-ccc/connector-react";
import {
  TESTNET_CODE_RELEASES, TYPE_ID_CODE_HASH, CodeBroadcastStatusUnknownError,
  CodeDeploymentRejectedError, CodeDeploymentPreflightError, type SignedCodeDeploymentDiagnostic,
  TESTNET_JOYID_CODE_HASH, TESTNET_JOYID_RAW_LIMIT, assertTestnetJoyIdRawSize,
  assertTestnetDeploymentClient, deploymentReadDeadline, getTestnetCodeCapacity, isTestnetSetupEnabled,
  makeConfirmedCodeManifest, makePendingCodeDeployment, parsePendingCodeDeployments,
  prepareTestnetCodeDeployment, signAndBroadcastTestnetCode, validateTestnetRelease, parseSignedCodeDeploymentDiagnostics,
} from "../testnet-code-deployment";

jest.mock("@ckb-ccc/connector-react", () => ({ ccc: jest.requireActual("@ckb-ccc/core") }));

const hash = (value: string) => `0x${value.repeat(64)}` as ccc.Hex;
const lock = ccc.Script.from({ codeHash: hash("a"), hashType: "type", args: `0x${"11".repeat(20)}` });
const joyIdLock = ccc.Script.from({ codeHash: TESTNET_JOYID_CODE_HASH, hashType: "type", args: `0x0001${"11".repeat(20)}` });
const userCodeOwner = ccc.Script.from({ codeHash: "0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb", hashType: "type", args: "0x1270de01d042a23bfab1dc06375138b48ea03d006900" });
function txWithRawSize(rawBytes: number, walletLock = joyIdLock) {
  const tx = ccc.Transaction.from({ outputs: [{ lock: walletLock, capacity: ccc.fixedPointFrom(200000) }], outputsData: ["0x"] });
  const overhead = tx.rawToBytes().length;
  tx.outputsData[0] = `0x${"00".repeat(rawBytes - overhead)}`;
  expect(tx.rawToBytes().length).toBe(rawBytes);
  return tx;
}
// Small deterministic test-only ELF header fixture; it is never executed or broadcast.
function fixtureBytes() {
  const bytes = new Uint8Array(128);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
  const header = new DataView(bytes.buffer);
  header.setUint16(16, 2, true); header.setUint16(18, 243, true); header.setUint32(20, 1, true);
  return bytes;
}

function setup() {
  const bytes = fixtureBytes();
  // Model a separately reviewed fixture manifest, while exercising real CCC hashes/Molecule.
  const release = TESTNET_CODE_RELEASES["protocol-lock"] as { byteLength: number; dataHash: string };
  jest.replaceProperty(release, "byteLength", bytes.length);
  jest.replaceProperty(release, "dataHash", ccc.hashCkb(bytes));
  const client = new ccc.ClientPublicTestnet({ url: "https://testnet.ckb.dev/" });
  const address = ccc.Address.fromScript(lock, client);
  const cell = ccc.Cell.from({ outPoint: { txHash: hash("b"), index: 0 }, cellOutput: { capacity: ccc.fixedPointFrom(10000), lock }, outputData: "0x" });
  jest.spyOn(client, "getCellLive").mockResolvedValue(cell);
  const send = jest.spyOn(client, "sendTransaction").mockResolvedValue(hash("c"));
  const estimate = jest.spyOn(client, "estimateCycles").mockResolvedValue(12345n);
  const signer = {
    client, getRecommendedAddressObj: jest.fn().mockResolvedValue(address),
    prepareTransaction: jest.fn(async (tx: ccc.Transaction) => tx),
    signTransaction: jest.fn(async (tx: ccc.Transaction) => tx.clone()),
  } as unknown as ccc.Signer;
  jest.spyOn(ccc.Transaction.prototype, "completeInputsAtLeastOne").mockImplementation(async function (this: ccc.Transaction) {
    this.inputs.push(ccc.CellInput.from({ previousOutput: cell.outPoint, cellOutput: cell.cellOutput, outputData: cell.outputData })); return 1;
  });
  jest.spyOn(ccc.Transaction.prototype, "completeInputsByCapacity").mockResolvedValue(0);
  jest.spyOn(ccc.Transaction.prototype, "completeFeeBy").mockImplementation(async function (this: ccc.Transaction) {
    this.outputs.push(ccc.CellOutput.from({ lock, capacity: cell.cellOutput.capacity - this.outputs[0].capacity - 1000n }));
    this.outputsData.push("0x"); return [0, true];
  });
  return { bytes, client, address, cell, signer, send, estimate };
}

afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

describe("testnet code deployment boundaries", () => {
  it("pins the separate UserType binary and calculates its own deployment capacity", () => {
    expect(TESTNET_CODE_RELEASES["user-type"]).toMatchObject({ fileName: "ckboost-user-type", byteLength: 361256, dataHash: "0x76dbd826aa15708eee36d857fde53b92eb7904bfd0e6fe0ccf6d16c263bc4382" });
    expect(getTestnetCodeCapacity(361256, userCodeOwner)).toBe(ccc.fixedPointFrom(361384));
  });

  it("requires the specified deployment wallet for a new independent UserType before collecting inputs", async () => {
    const { bytes, signer } = setup();
    const release = TESTNET_CODE_RELEASES["user-type"] as { byteLength: number; dataHash: string };
    jest.replaceProperty(release, "byteLength", bytes.length); jest.replaceProperty(release, "dataHash", ccc.hashCkb(bytes));
    await expect(prepareTestnetCodeDeployment(signer, "user-type", bytes)).rejects.toThrow("deployment Admin wallet");
    expect(ccc.Transaction.prototype.completeInputsAtLeastOne).not.toHaveBeenCalled();
    expect(signer.signTransaction).not.toHaveBeenCalled();
  });

  it("exports a new UserType manifest only with the actual matching TypeID creation input", () => {
    const bytes = fixtureBytes(), release = TESTNET_CODE_RELEASES["user-type"] as { byteLength: number; dataHash: string };
    jest.replaceProperty(release, "byteLength", bytes.length); jest.replaceProperty(release, "dataHash", ccc.hashCkb(bytes));
    const input = ccc.CellInput.from({ previousOutput: { txHash: hash("e"), index: 0 } });
    const type = ccc.Script.from({ codeHash: TYPE_ID_CODE_HASH, hashType: "type", args: ccc.hashTypeId(input, 0) });
    const capacity = getTestnetCodeCapacity(bytes.length, userCodeOwner);
    const tx = ccc.Transaction.from({ inputs: [input], outputs: [{ capacity, lock: userCodeOwner, type }], outputsData: [ccc.hexFrom(bytes)] });
    const prepared = { id: "user-type" as const, tx, bodyHash: tx.hash(), dataHash: ccc.hashCkb(bytes), typeScript: type, typeHash: type.hash(), capacity, fee: 1000n, walletLock: userCodeOwner, walletAddress: new ccc.Address(userCodeOwner, "ckt").toString(), byteLength: bytes.length };
    const receipt = makePendingCodeDeployment(prepared, tx.hash());
    const cell = ccc.Cell.from({ outPoint: { txHash: tx.hash(), index: 0 }, cellOutput: tx.outputs[0], outputData: tx.outputsData[0] });
    expect(() => makeConfirmedCodeManifest(receipt, 123n, cell)).toThrow("creation input");
    const other = ccc.CellInput.from({ previousOutput: { txHash: hash("f"), index: 0 } });
    expect(() => makeConfirmedCodeManifest(receipt, 123n, cell, other)).toThrow("creation input");
    expect(makeConfirmedCodeManifest(receipt, 123n, cell, input)).toMatchObject({ contract: "user-type", creationEvidence: { transactionHash: tx.hash(), blockNumber: "0x7b", outputIndex: 0, firstInput: ccc.hexFrom(input.toBytes()), typeIdArgs: type.args } });
  });

  it("keeps the server route off by default and rejects mainnet/custom-network clients", () => {
    expect(isTestnetSetupEnabled(undefined, "testnet")).toBe(false);
    expect(isTestnetSetupEnabled("true", "testnet")).toBe(false);
    expect(isTestnetSetupEnabled("1", "mainnet")).toBe(false);
    expect(isTestnetSetupEnabled("1", "testnet")).toBe(true);
    expect(() => assertTestnetDeploymentClient({ addressPrefix: "ckb", url: "https://mainnet.ckb.dev/" })).toThrow("Testnet");
    expect(() => assertTestnetDeploymentClient({ addressPrefix: "ckt", url: "http://localhost:8114/" })).toThrow("Testnet");
    expect(() => assertTestnetDeploymentClient({ addressPrefix: "ckt", url: "https://testnet.ckb.dev.attacker.example/" })).toThrow("Testnet");
    expect(() => assertTestnetDeploymentClient({ addressPrefix: "ckt", url: "wss://testnet.ckb.dev/ws" })).not.toThrow();
  });

  it("requires ELF64 RISC-V executable, exact release size and exact CKB data hash", () => {
    const { bytes } = setup();
    expect(validateTestnetRelease("protocol-lock", bytes)).toEqual({ byteLength: 128, dataHash: ccc.hashCkb(bytes) });
    const x86 = bytes.slice(); new DataView(x86.buffer).setUint16(18, 62, true);
    expect(() => validateTestnetRelease("protocol-lock", x86)).toThrow("RISC-V");
    expect(() => validateTestnetRelease("protocol-lock", bytes.slice(0, 100))).toThrow("size mismatch");
    const modified = bytes.slice(); modified[100] = 1;
    expect(() => validateTestnetRelease("protocol-lock", modified)).toThrow("data hash mismatch");
    expect(() => validateTestnetRelease("protocol-lock", new Uint8Array(128))).toThrow("ELF64");
  });

  it("calculates storage capacity from the real wallet lock rather than assuming a 61 CKB code cell", () => {
    expect(getTestnetCodeCapacity(183336, lock)).toBe(ccc.fixedPointFrom(183462));
    const longerLock = lock.clone(); longerLock.args = `0x${"11".repeat(22)}`;
    expect(getTestnetCodeCapacity(183336, longerLock)).toBe(ccc.fixedPointFrom(183464));
    expect(() => getTestnetCodeCapacity(-1, lock)).toThrow("byte length");
  });

  it("enforces the actual deployed Testnet JoyID raw limit at 131072/131073 bytes, independent of witness size", () => {
    const boundary = txWithRawSize(TESTNET_JOYID_RAW_LIMIT);
    boundary.witnesses = [`0x${"00".repeat(20000)}`];
    expect(boundary.toBytes().length).toBeGreaterThan(TESTNET_JOYID_RAW_LIMIT);
    expect(() => assertTestnetJoyIdRawSize(boundary, joyIdLock)).not.toThrow();
    expect(() => assertTestnetJoyIdRawSize(txWithRawSize(TESTNET_JOYID_RAW_LIMIT + 1), joyIdLock)).toThrow("131,073 bytes");
    expect(() => assertTestnetJoyIdRawSize(txWithRawSize(TESTNET_JOYID_RAW_LIMIT + 1), joyIdLock)).toThrow("128 KiB");
    expect(() => assertTestnetJoyIdRawSize(txWithRawSize(TESTNET_JOYID_RAW_LIMIT + 1), joyIdLock)).toThrow("Switch to a deployment wallet");
  });

  it("does not apply the JoyID binary-specific limit to another wallet or hash type", () => {
    const large = txWithRawSize(TESTNET_JOYID_RAW_LIMIT + 1, lock);
    expect(() => assertTestnetJoyIdRawSize(large, lock)).not.toThrow();
    const differentHashType = joyIdLock.clone(); differentHashType.hashType = "data1";
    expect(() => assertTestnetJoyIdRawSize(large, differentHashType)).not.toThrow();
  });

  it("blocks an oversized reviewed binary for this JoyID lock before collecting inputs, fee RPC, or signing", async () => {
    const { bytes, signer, client, send, estimate } = setup();
    const large = new Uint8Array(TESTNET_JOYID_RAW_LIMIT + 1); large.set(bytes);
    const release = TESTNET_CODE_RELEASES["protocol-lock"] as { byteLength: number; dataHash: string };
    jest.replaceProperty(release, "byteLength", large.length);
    jest.replaceProperty(release, "dataHash", ccc.hashCkb(large));
    jest.mocked(signer.getRecommendedAddressObj).mockResolvedValue(ccc.Address.fromScript(joyIdLock, client));
    await expect(prepareTestnetCodeDeployment(signer, "protocol-lock", large)).rejects.toThrow("128 KiB");
    expect(ccc.Transaction.prototype.completeInputsAtLeastOne).not.toHaveBeenCalled();
    expect(ccc.Transaction.prototype.completeInputsByCapacity).not.toHaveBeenCalled();
    expect(ccc.Transaction.prototype.completeFeeBy).not.toHaveBeenCalled();
    expect(client.getCellLive).not.toHaveBeenCalled();
    expect(signer.prepareTransaction).not.toHaveBeenCalled(); expect(signer.signTransaction).not.toHaveBeenCalled();
    expect(estimate).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });

  it("blocks a cached oversized JoyID proposal prepared before the guard without requesting another signature", async () => {
    const { bytes, signer, client, send, estimate } = setup();
    const cached = await prepareTestnetCodeDeployment(signer, "protocol-lock", bytes);
    cached.walletLock = joyIdLock.clone();
    cached.tx = txWithRawSize(TESTNET_JOYID_RAW_LIMIT + 1); cached.bodyHash = cached.tx.hash();
    jest.mocked(signer.getRecommendedAddressObj).mockResolvedValue(ccc.Address.fromScript(joyIdLock, client));
    jest.mocked(client.getCellLive).mockClear();
    await expect(signAndBroadcastTestnetCode(signer, cached)).rejects.toThrow("128 KiB");
    expect(client.getCellLive).not.toHaveBeenCalled();
    expect(signer.signTransaction).not.toHaveBeenCalled(); expect(estimate).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });

  it("checks final raw growth after transaction preparation for a small JoyID artifact", async () => {
    const { bytes, signer, client, cell, send } = setup();
    cell.cellOutput.lock = joyIdLock.clone();
    jest.mocked(signer.getRecommendedAddressObj).mockResolvedValue(ccc.Address.fromScript(joyIdLock, client));
    jest.mocked(signer.prepareTransaction).mockImplementation(async tx => {
      const prepared = ccc.Transaction.from(tx); prepared.headerDeps = Array.from({ length: 4096 }, () => hash("d")); return prepared;
    });
    jest.mocked(ccc.Transaction.prototype.completeFeeBy).mockImplementation(async function (this: ccc.Transaction) {
      this.outputs.push(ccc.CellOutput.from({ lock: joyIdLock, capacity: cell.cellOutput.capacity - this.outputs[0].capacity - 1000n })); this.outputsData.push("0x"); return [0, true];
    });
    await expect(prepareTestnetCodeDeployment(signer, "protocol-lock", bytes)).rejects.toThrow("128 KiB");
    expect(signer.prepareTransaction).toHaveBeenCalledTimes(1);
    expect(signer.signTransaction).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });

  it("prepares a fresh Type ID code cell and exact fee without signing or broadcasting", async () => {
    const { bytes, signer, send } = setup();
    const prepared = await prepareTestnetCodeDeployment(signer, "protocol-lock", bytes);
    expect(prepared.typeScript.codeHash).toBe(TYPE_ID_CODE_HASH);
    expect(prepared.typeScript.args).toBe(ccc.hashTypeId(prepared.tx.inputs[0], 0));
    expect(prepared.tx.outputs[0].lock.eq(lock)).toBe(true);
    expect(prepared.tx.outputsData[0]).toBe(ccc.hexFrom(bytes));
    expect(prepared.capacity).toBe(getTestnetCodeCapacity(bytes.length, lock));
    expect(prepared.fee).toBe(1000n);
    expect(signer.signTransaction).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects funding that would consume an old typed code/protocol cell", async () => {
    const { bytes, signer, client, cell, send } = setup();
    cell.cellOutput.type = ccc.Script.from({ codeHash: hash("d"), hashType: "type", args: "0x" });
    jest.mocked(client.getCellLive).mockResolvedValue(cell);
    await expect(prepareTestnetCodeDeployment(signer, "protocol-lock", bytes)).rejects.toThrow("untyped");
    expect(signer.signTransaction).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });

  it("does not broadcast or automatically retry after wallet rejection", async () => {
    const { bytes, signer, send } = setup();
    const prepared = await prepareTestnetCodeDeployment(signer, "protocol-lock", bytes);
    jest.mocked(signer.signTransaction).mockRejectedValue(new Error("User rejected"));
    await expect(signAndBroadcastTestnetCode(signer, prepared)).rejects.toThrow("User rejected");
    expect(signer.signTransaction).toHaveBeenCalledTimes(1); expect(send).not.toHaveBeenCalled();
  });

  it("ignores stale work and blocks a wallet/network switch after signing", async () => {
    const { bytes, signer, send } = setup();
    let current = true;
    const prepared = await prepareTestnetCodeDeployment(signer, "protocol-lock", bytes);
    jest.mocked(signer.signTransaction).mockImplementation(async tx => { current = false; return ccc.Transaction.from(tx); });
    await expect(signAndBroadcastTestnetCode(signer, prepared, () => current)).rejects.toThrow("changed");
    expect(send).not.toHaveBeenCalled();
    await expect(prepareTestnetCodeDeployment(signer, "protocol-lock", bytes, () => false)).rejects.toThrow("changed");
  });

  it("blocks raw-body changes by the wallet before broadcast", async () => {
    const { bytes, signer, send } = setup();
    const prepared = await prepareTestnetCodeDeployment(signer, "protocol-lock", bytes);
    jest.mocked(signer.signTransaction).mockImplementation(async tx => { const changed = ccc.Transaction.from(tx).clone(); changed.outputs[0].capacity += 1n; return changed; });
    await expect(signAndBroadcastTestnetCode(signer, prepared)).rejects.toThrow("wallet changed the transaction body");
    expect(send).not.toHaveBeenCalled();
  });

  it("retains the known transaction hash if the RPC result is ambiguous", async () => {
    const { bytes, signer, send } = setup();
    const prepared = await prepareTestnetCodeDeployment(signer, "protocol-lock", bytes);
    send.mockRejectedValue(new Error("RPC timeout"));
    try { await signAndBroadcastTestnetCode(signer, prepared); throw new Error("Expected error"); }
    catch (error) { expect(error).toBeInstanceOf(CodeBroadcastStatusUnknownError); expect((error as CodeBroadcastStatusUnknownError).txHash).toBe(prepared.bodyHash); }
    expect(signer.signTransaction).toHaveBeenCalledTimes(1); expect(send).toHaveBeenCalledTimes(1);
  });

  it("persists exact signed public bytes before read-only verification and broadcast", async () => {
    const { bytes, signer, send, estimate } = setup();
    const prepared = await prepareTestnetCodeDeployment(signer, "protocol-lock", bytes);
    const order: string[] = [];
    let saved: SignedCodeDeploymentDiagnostic | undefined;
    jest.mocked(signer.signTransaction).mockImplementation(async tx => {
      const signed = ccc.Transaction.from(tx).clone();
      signed.witnesses = [ccc.hexFrom(ccc.WitnessArgs.from({ lock: "0x1234" }).toBytes())];
      return signed;
    });
    estimate.mockImplementation(async tx => { order.push("verify"); expect(saved?.signedTransaction).toBe(ccc.hexFrom(ccc.Transaction.from(tx).toBytes())); return 12345n; });
    send.mockImplementation(async tx => { order.push("send"); return ccc.Transaction.from(tx).hash(); });
    const result = await signAndBroadcastTestnetCode(signer, prepared, undefined, { onSignedDiagnostic: async snapshot => {
      await Promise.resolve(); saved = snapshot; order.push("persist");
    } });
    expect(order).toEqual(["persist", "verify", "send"]);
    expect(result).toBe(prepared.bodyHash);
    expect(saved).toMatchObject({ network: "testnet", transactionHash: prepared.bodyHash, preparedBodyHash: prepared.bodyHash,
      contract: "protocol-lock", release: { dataHash: ccc.hashCkb(bytes), byteLength: bytes.length } });
    expect(ccc.Transaction.fromBytes(saved!.signedTransaction).witnesses[0]).toBe(ccc.hexFrom(ccc.WitnessArgs.from({ lock: "0x1234" }).toBytes()));
    expect(parseSignedCodeDeploymentDiagnostics(JSON.stringify([saved]))).toEqual([saved]);
    expect(signer.signTransaction).toHaveBeenCalledTimes(1);
  });

  it("does not verify or broadcast if saving the signed diagnostic fails", async () => {
    const { bytes, signer, send, estimate } = setup();
    const prepared = await prepareTestnetCodeDeployment(signer, "protocol-lock", bytes);
    await expect(signAndBroadcastTestnetCode(signer, prepared, undefined, { onSignedDiagnostic: () => { throw new Error("storage unavailable"); } })).rejects.toThrow("storage unavailable");
    expect(estimate).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });

  it.each(["preflight", "broadcast"] as const)("classifies an explicit %s script rejection without an unknown broadcast status", async stage => {
    const { bytes, signer, send, estimate } = setup();
    const prepared = await prepareTestnetCodeDeployment(signer, "protocol-lock", bytes);
    const cause = Object.assign(new Error("TransactionFailedToVerify"), { code: -302, data: "Inputs[0].Lock ValidationFailure code -1" });
    (stage === "preflight" ? estimate : send).mockRejectedValue(cause);
    const diagnostic = jest.fn();
    try { await signAndBroadcastTestnetCode(signer, prepared, undefined, { onSignedDiagnostic: diagnostic }); throw new Error("Expected rejection"); }
    catch (error) {
      expect(error).toBeInstanceOf(CodeDeploymentRejectedError);
      expect(error).not.toBeInstanceOf(CodeBroadcastStatusUnknownError);
      expect(error).toMatchObject({ txHash: prepared.bodyHash, stage });
      expect((error as Error).message).toContain("not awaiting confirmation");
    }
    expect(diagnostic).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(stage === "preflight" ? 0 : 1);
  });

  it("recognizes a script rejection nested in RPC data even when the top-level message is generic", async () => {
    const { bytes, signer, send, estimate } = setup();
    const prepared = await prepareTestnetCodeDeployment(signer, "protocol-lock", bytes);
    estimate.mockRejectedValue({ message: "Client request error", data: { error: { message: "Script(TransactionScriptError { source: Inputs[0].Lock, cause: ValidationFailure code -1 })" } } });
    await expect(signAndBroadcastTestnetCode(signer, prepared)).rejects.toBeInstanceOf(CodeDeploymentRejectedError);
    expect(send).not.toHaveBeenCalled();
  });

  it("does not send when read-only script verification is unavailable", async () => {
    const { bytes, signer, send, estimate } = setup();
    const prepared = await prepareTestnetCodeDeployment(signer, "protocol-lock", bytes);
    estimate.mockRejectedValue(new Error("Method not found"));
    const diagnostic = jest.fn();
    await expect(signAndBroadcastTestnetCode(signer, prepared, undefined, { onSignedDiagnostic: diagnostic })).rejects.toBeInstanceOf(CodeDeploymentPreflightError);
    expect(diagnostic).toHaveBeenCalledTimes(1); expect(send).not.toHaveBeenCalled();
    expect(signer.signTransaction).toHaveBeenCalledTimes(1);
  });

  it("bounds script verification and never sends a late successful result", async () => {
    const { bytes, signer, send, estimate } = setup();
    const prepared = await prepareTestnetCodeDeployment(signer, "protocol-lock", bytes);
    jest.useFakeTimers();
    let resolve: (cycles: bigint) => void = () => {};
    estimate.mockReturnValue(new Promise<bigint>(done => { resolve = done; }));
    const pending = signAndBroadcastTestnetCode(signer, prepared);
    const rejected = expect(pending).rejects.toBeInstanceOf(CodeDeploymentPreflightError);
    await jest.advanceTimersByTimeAsync(20000); await rejected;
    resolve(12345n); await Promise.resolve();
    expect(send).not.toHaveBeenCalled(); expect(estimate).toHaveBeenCalledTimes(1);
  });

  it("rechecks current wallet and immutable signed witnesses after preflight", async () => {
    const { bytes, signer, send, estimate } = setup();
    const prepared = await prepareTestnetCodeDeployment(signer, "protocol-lock", bytes);
    let current = true;
    estimate.mockImplementation(async () => { current = false; return 123n; });
    await expect(signAndBroadcastTestnetCode(signer, prepared, () => current)).rejects.toThrow("changed");
    expect(send).not.toHaveBeenCalled();
    current = true;
    estimate.mockImplementation(async tx => { ccc.Transaction.from(tx).witnesses = ["0x1234"]; return 123n; });
    await expect(signAndBroadcastTestnetCode(signer, prepared)).rejects.toThrow("signed transaction changed");
    expect(send).not.toHaveBeenCalled();
  });

  it("restores only validated diagnostic whitelist fields, one per artifact, within a bounded payload", async () => {
    const { bytes, signer, send } = setup();
    const prepared = await prepareTestnetCodeDeployment(signer, "protocol-lock", bytes);
    send.mockImplementation(async tx => ccc.Transaction.from(tx).hash());
    let snapshot: SignedCodeDeploymentDiagnostic | undefined;
    await signAndBroadcastTestnetCode(signer, prepared, undefined, { onSignedDiagnostic: value => { snapshot = value; } });
    const poisoned = { ...snapshot, signer: { privateKey: "must-not-restore" }, walletLock: { ...snapshot!.walletLock, connection: { credential: "must-not-restore" } }, release: { ...snapshot!.release, secret: "must-not-restore" } };
    expect(parseSignedCodeDeploymentDiagnostics(JSON.stringify([poisoned, poisoned]))).toEqual([snapshot]);
    const alterBody = ccc.Transaction.fromBytes(snapshot!.signedTransaction); alterBody.outputs[0].capacity += 1n;
    const variants = [
      { ...snapshot, network: "mainnet" }, { ...snapshot, preparedBodyHash: hash("f") },
      { ...snapshot, release: { ...snapshot!.release, dataHash: hash("f") } },
      { ...snapshot, walletLock: { ...snapshot!.walletLock, args: "0x1234" } },
      { ...snapshot, typeScript: { ...snapshot!.typeScript, args: hash("e") } },
      { ...snapshot, signedTransaction: `${snapshot!.signedTransaction}00` },
      { ...snapshot, signedTransaction: ccc.hexFrom(alterBody.toBytes()), transactionHash: alterBody.hash(), preparedBodyHash: alterBody.hash() },
    ];
    for (const invalid of variants) expect(parseSignedCodeDeploymentDiagnostics(JSON.stringify([invalid]))).toEqual([]);
    expect(parseSignedCodeDeploymentDiagnostics(" ".repeat(2 * 1024 * 1024 + 1))).toEqual([]);
    expect(parseSignedCodeDeploymentDiagnostics(JSON.stringify([snapshot, snapshot, snapshot]))).toEqual([]);
    expect(parseSignedCodeDeploymentDiagnostics("not json")).toEqual([]);
  });

  it("exports only an on-chain matching committed receipt and restores public receipts without a secret", async () => {
    const { bytes, signer } = setup();
    const prepared = await prepareTestnetCodeDeployment(signer, "protocol-lock", bytes);
    const receipt = makePendingCodeDeployment(prepared, prepared.bodyHash);
    const cell = ccc.Cell.from({ outPoint: { txHash: prepared.bodyHash, index: 0 }, cellOutput: prepared.tx.outputs[0], outputData: prepared.tx.outputsData[0] });
    expect(parsePendingCodeDeployments(JSON.stringify([receipt]))).toEqual([receipt]);
    const manifest = makeConfirmedCodeManifest(receipt, 100n, cell);
    expect(manifest).toMatchObject({ network: "testnet", typeHash: prepared.typeHash, dataHash: prepared.dataHash, blockNumber: "0x64", isTypeId: true });
    expect(manifest.preparedFeeShannons).toBe("1000");
    expect(manifest.feeEvidence).toContain("not independently reconstructed");
    expect(makeConfirmedCodeManifest({ ...receipt, walletAddress: `ckt1${"tampered".repeat(4)}` }, 100n, cell).deployerAddress).toBe(new ccc.Address(lock, "ckt").toString());
    expect(JSON.stringify(manifest)).not.toMatch(/private.?key/i);
    cell.outputData = "0x";
    expect(() => makeConfirmedCodeManifest(receipt, 100n, cell)).toThrow("does not match");
    expect(parsePendingCodeDeployments(JSON.stringify([{ ...receipt, capacity: "1" }]))).toEqual([]);
    expect(parsePendingCodeDeployments("not JSON")).toEqual([]);
  });

  it("bounds read-only work with a retryable deadline", async () => {
    jest.useFakeTimers();
    const read = deploymentReadDeadline(new Promise<never>(() => {}), 12000);
    const rejected = expect(read).rejects.toThrow("Retry this read; it does not request a wallet signature");
    await jest.advanceTimersByTimeAsync(12000); await rejected;
  });
});

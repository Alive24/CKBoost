import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ccc } from "@ckb-ccc/connector-react";
import { ConnectedTypeID, ProtocolData, TransactionRecipe } from "ssri-ckboost/types";
import { TestnetProtocolSetupWorkspace } from "../testnet-protocol-setup-workspace";
import { TESTNET_CODE_RELEASES, TYPE_ID_CODE_HASH, getTestnetCodeCapacity, CodeDeploymentRejectedError, CodeBroadcastStatusUnknownError } from "@/lib/revamp/testnet-code-deployment";
import { TESTNET_FUNDING_RECIPIENT_ADDRESS } from "@/lib/revamp/testnet-funding-transfer";
import { TESTNET_PROTOCOL_DEPENDENCY_PINS, buildIsolatedTestnetProtocolData, prepareTestnetProtocolDeployment, validateIsolatedTestnetProfile, type IsolatedTestnetProfileInput, type PreparedTestnetProtocolDeployment } from "@/lib/revamp/testnet-protocol-deployment";
import { makePendingTestnetProtocolDeployment, parsePendingTestnetProtocolDeployments, parseSignedTestnetProtocolDiagnostics, signAndBroadcastTestnetProtocol, probeTestnetProtocolConfirmation, type PendingTestnetProtocolDeployment, type SignedTestnetProtocolDiagnostic } from "@/lib/revamp/testnet-protocol-transactions";

let mockSigner: ccc.Signer | undefined;
const mockOpen = jest.fn(), mockClient = { addressPrefix: "ckt", url: "https://testnet.ckb.dev/" };
const originalFetch = globalThis.fetch;
jest.mock("@ckb-ccc/connector-react", () => ({ ccc: { ...jest.requireActual("@ckb-ccc/core"), useSigner: () => mockSigner, useCcc: () => ({ client: mockClient, open: mockOpen }) } }));
jest.mock("../ui", () => ({ RevampButton: ({ children, variant: _v, ...props }: React.ComponentProps<"button"> & { variant?: string }) => <button {...props}>{children}</button> }));
jest.mock("@/lib/revamp/testnet-protocol-deployment", () => ({ ...jest.requireActual("@/lib/revamp/testnet-protocol-deployment"), prepareTestnetProtocolDeployment: jest.fn() }));
jest.mock("@/lib/revamp/testnet-protocol-transactions", () => ({
  ...jest.requireActual("@/lib/revamp/testnet-code-deployment"),
  makePendingTestnetProtocolDeployment: jest.fn(), signAndBroadcastTestnetProtocol: jest.fn(), probeTestnetProtocolConfirmation: jest.fn(),
  // Strict schema/Molecule validation belongs to the backend suite. These fixtures isolate UI persistence and explicit actions.
  parsePendingTestnetProtocolDeployments: jest.fn(), parseSignedTestnetProtocolDiagnostics: jest.fn(),
}));

const RECEIPTS_KEY = "ckboost-testnet-isolated-protocol-receipts-v1", DIAGNOSTICS_KEY = "ckboost-testnet-isolated-protocol-signed-diagnostics-v1";
const hash = (n: number) => `0x${n.toString(16).padStart(2, "0").repeat(32)}` as ccc.Hex;
const lock = ccc.Script.from({ codeHash: "0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb", hashType: "type", args: "0x1270de01d042a23bfab1dc06375138b48ea03d006900" });
const address = new ccc.Address(lock, "ckt");
const otherLock = ccc.Script.from({ codeHash: hash(0xfa), hashType: "type", args: "0x1234" });
const plain = (script: ccc.Script) => ({ codeHash: script.codeHash, hashType: script.hashType, args: script.args });
function profileFixture(): IsolatedTestnetProfileInput {
  const manifest = (id: "protocol-lock" | "campaign-type", n: number) => {
    const type = ccc.Script.from({ codeHash: TYPE_ID_CODE_HASH, hashType: "type", args: hash(n) }), release = TESTNET_CODE_RELEASES[id];
    return { schema: "ckboost-testnet-code-deployment/v1", network: "testnet", contract: id, contractSize: release.byteLength, dataHash: release.dataHash, typeHash: type.hash(), typeScript: plain(type), transactionHash: hash(n + 10), index: "0x0", blockNumber: "0x7b", lockScript: plain(lock), capacityShannons: getTestnetCodeCapacity(release.byteLength, lock).toString(), isTypeId: true, hashType: "type" };
  };
  return { schema: "ckboost-isolated-testnet-profile/v1", network: "testnet", executorUrl: "http://127.0.0.1:9091", dependencies: TESTNET_PROTOCOL_DEPENDENCY_PINS.map(pin => ({ ...pin, outPoint: { ...pin.outPoint } })), newCode: { protocolLock: manifest("protocol-lock", 1), campaignType: manifest("campaign-type", 2) } };
}
function preparedFixture(input = profileFixture()): PreparedTestnetProtocolDeployment {
  const profile = validateIsolatedTestnetProfile(input), input0 = ccc.CellInput.from({ previousOutput: { txHash: hash(0xc0), index: 0 } });
  const typeScript = ccc.Script.from({ codeHash: TESTNET_PROTOCOL_DEPENDENCY_PINS[0].codeHash, hashType: "type", args: ccc.hashTypeId(input0, 0) }), typeHash = typeScript.hash();
  const protocolDataHex = ccc.hexFrom(ProtocolData.encode(buildIsolatedTestnetProtocolData(profile, lock.hash(), 1795000000000)));
  const protocolLock = ccc.Script.from({ codeHash: profile.dependencies[7].codeHash, hashType: "type", args: ccc.hexFrom(ConnectedTypeID.encode({ type_id: lock.hash(), connected_key: typeHash })) });
  const output = ccc.CellOutput.from({ lock: protocolLock, type: typeScript }, protocolDataHex);
  const recipe = ccc.hexFrom(TransactionRecipe.encode({ method_path: ccc.hexFrom(ccc.bytesFrom("CKBoostProtocol.update_protocol", "utf8")), arguments: [{ arg_type: 2, data: "0x00000000" }] }));
  const tx = ccc.Transaction.from({ inputs: [input0], outputs: [output], outputsData: [protocolDataHex], witnesses: [ccc.hexFrom(ccc.WitnessArgs.encode({ outputType: recipe }))] });
  return { profile, profileHash: ccc.hashCkb(ccc.bytesFrom(JSON.stringify(profile), "utf8")), tx, bodyHash: tx.hash(), protocolOutputIndex: 0, typeScript, typeHash, protocolDataHex, dataHash: ccc.hashCkb(protocolDataHex), capacity: output.capacity, fee: 12345n, walletLock: lock, walletAddress: address.toString(), recipe, firstInput: ccc.hexFrom(input0.toBytes()) };
}
function receiptFixture(prepared = preparedFixture()): PendingTestnetProtocolDeployment {
  return { schema: "ckboost-testnet-protocol-pending/v1", network: "testnet", txHash: prepared.bodyHash, transaction: ccc.hexFrom(prepared.tx.toBytes()), profile: prepared.profile, profileHash: prepared.profileHash, walletLock: plain(lock), walletAddress: address.toString(), protocolOutputIndex: 0, typeScript: plain(prepared.typeScript), typeHash: prepared.typeHash, protocolDataHex: prepared.protocolDataHex, dataHash: prepared.dataHash, capacityShannons: prepared.capacity.toString(), preparedFeeShannons: prepared.fee.toString(), recipe: prepared.recipe, firstInput: prepared.firstInput };
}
function diagnosticFixture(prepared: PreparedTestnetProtocolDeployment): SignedTestnetProtocolDiagnostic {
  return { schema: "ckboost-testnet-protocol-signed-diagnostic/v1", network: "testnet", receipt: receiptFixture(prepared), signedTransaction: ccc.hexFrom(prepared.tx.toBytes()), transactionHash: prepared.bodyHash, preparedBodyHash: prepared.bodyHash };
}
function connect(script = lock) { mockSigner = { client: mockClient, getRecommendedAddressObj: jest.fn().mockResolvedValue(new ccc.Address(script, "ckt")) } as unknown as ccc.Signer; }
function response(input = profileFixture()): Response { return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => Uint8Array.from(ccc.bytesFrom(JSON.stringify(input), "utf8")).buffer } as unknown as Response; }
const loadButton = () => screen.getByRole("button", { name: "Load verified isolated profile · no signing" });
const prepareButton = () => screen.getByRole("button", { name: "Prepare unsigned isolated protocol" });
const signButton = () => screen.getByRole("button", { name: "Sign and create new isolated protocol state" });
const base = (receipt: PendingTestnetProtocolDeployment) => ({ txHash: receipt.txHash, checkedAt: "2026-11-20T00:00:00.000Z", attempts: [] });
async function ready() {
  connect(); const prepared = preparedFixture(); jest.mocked(fetch).mockResolvedValue(response()); jest.mocked(prepareTestnetProtocolDeployment).mockResolvedValue(prepared);
  const view = render(<TestnetProtocolSetupWorkspace />); await screen.findByText("Matches the specified deployment wallet");
  fireEvent.click(loadButton()); await screen.findByText("Fixed isolated profile loaded"); fireEvent.click(prepareButton()); await screen.findByLabelText("Unsigned isolated protocol preview");
  return { ...view, prepared, receipt: receiptFixture(prepared) };
}

beforeEach(() => {
  jest.clearAllMocks(); localStorage.clear(); mockSigner = undefined; globalThis.fetch = jest.fn();
  jest.mocked(prepareTestnetProtocolDeployment).mockReset(); jest.mocked(signAndBroadcastTestnetProtocol).mockReset();
  jest.mocked(parsePendingTestnetProtocolDeployments).mockImplementation(raw => raw ? JSON.parse(raw) : []);
  jest.mocked(parseSignedTestnetProtocolDiagnostics).mockImplementation(raw => raw ? JSON.parse(raw) : []);
  jest.mocked(makePendingTestnetProtocolDeployment).mockImplementation(prepared => receiptFixture(prepared));
  jest.mocked(probeTestnetProtocolConfirmation).mockImplementation(async receipt => ({ ...base(receipt), status: "unknown", reason: "not-found", message: "Protocol not found; keep the saved receipt." }));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: jest.fn(() => "blob:protocol-public-json") }); Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: jest.fn() });
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); globalThis.fetch = originalFetch; });

it("has no automatic profile, wallet, prepare, signing, broadcast, or confirmation action", () => {
  render(<TestnetProtocolSetupWorkspace />);
  expect(screen.getByText(TESTNET_FUNDING_RECIPIENT_ADDRESS)).toBeInTheDocument(); expect(prepareButton()).toBeDisabled();
  expect(fetch).not.toHaveBeenCalled(); expect(mockOpen).not.toHaveBeenCalled(); expect(prepareTestnetProtocolDeployment).not.toHaveBeenCalled(); expect(signAndBroadcastTestnetProtocol).not.toHaveBeenCalled(); expect(probeTestnetProtocolConfirmation).not.toHaveBeenCalled();
});
it("explicitly loads only the fixed pinned profile and gates preparation to the specified funded wallet", async () => {
  connect(otherLock); jest.mocked(fetch).mockResolvedValue(response()); render(<TestnetProtocolSetupWorkspace />);
  fireEvent.click(loadButton()); await screen.findByText("Fixed isolated profile loaded"); await screen.findByText("Different from the specified deployment wallet");
  expect(fetch).toHaveBeenCalledWith("/revamp/testnet-setup/protocol-profile", expect.objectContaining({ redirect: "error", cache: "no-store", signal: expect.any(AbortSignal) }));
  expect(prepareButton()).toBeDisabled(); expect(prepareButton()).toHaveAccessibleDescription(/does not match your specified funded deployment address/);
  expect(mockOpen).not.toHaveBeenCalled(); expect(prepareTestnetProtocolDeployment).not.toHaveBeenCalled();
});
it("previews the actual type, sole admin, capacity, fee and empty lists before a separate explicit signature", async () => {
  const { prepared } = await ready(); const preview = screen.getByLabelText("Unsigned isolated protocol preview");
  expect(within(preview).getByText(prepared.typeHash)).toBeInTheDocument(); expect(within(preview).getByText(prepared.walletAddress)).toBeInTheDocument();
  expect(within(preview).getByText("0.00012345 tCKB (12345 shannons)")).toBeInTheDocument(); expect(within(preview).getByText("0 Organizers · 0 approved campaigns · 0 approved tippings")).toBeInTheDocument();
  expect(screen.getByText(/does not activate this new state in the app/)).toBeInTheDocument(); expect(signAndBroadcastTestnetProtocol).not.toHaveBeenCalled();
  jest.mocked(signAndBroadcastTestnetProtocol).mockRejectedValue(new Error("User rejected protocol signature")); fireEvent.click(signButton());
  expect(await screen.findByRole("alert")).toHaveTextContent("User rejected protocol signature"); expect(localStorage.getItem(RECEIPTS_KEY)).toBeNull();
});
it("invalidates unsigned preparation when the account or profile changes", async () => {
  const { rerender } = await ready(); connect(otherLock); rerender(<TestnetProtocolSetupWorkspace />); await screen.findByText("Different from the specified deployment wallet");
  expect(screen.queryByLabelText("Unsigned isolated protocol preview")).not.toBeInTheDocument(); expect(signAndBroadcastTestnetProtocol).not.toHaveBeenCalled();
  connect(); rerender(<TestnetProtocolSetupWorkspace />); await screen.findByText("Matches the specified deployment wallet");
  fireEvent.click(prepareButton()); await screen.findByLabelText("Unsigned isolated protocol preview"); fireEvent.click(loadButton()); await screen.findByText("Fixed isolated profile loaded");
  expect(screen.queryByLabelText("Unsigned isolated protocol preview")).not.toBeInTheDocument();
});
it("preserves the public receipt before sending and blocks an unknown restored state without auto-resending", async () => {
  const { receipt, unmount } = await ready();
  jest.mocked(signAndBroadcastTestnetProtocol).mockImplementation(async (_s, _p, _c, options) => {
    await options?.onBeforeBroadcast?.(receipt); expect(JSON.parse(localStorage.getItem(RECEIPTS_KEY)!)).toEqual([receipt]); return receipt.txHash;
  });
  fireEvent.click(signButton()); await screen.findByText("Protocol not found; keep the saved receipt."); expect(prepareButton()).toBeDisabled();
  unmount(); render(<TestnetProtocolSetupWorkspace />); expect(prepareButton()).toBeDisabled(); expect(probeTestnetProtocolConfirmation).toHaveBeenCalledTimes(1); expect(signAndBroadcastTestnetProtocol).toHaveBeenCalledTimes(1);
});
it("keeps a known ambiguous receipt when navigation happens before the send result settles", async () => {
  const { receipt, unmount } = await ready(); let reject!: (cause: unknown) => void;
  jest.mocked(signAndBroadcastTestnetProtocol).mockImplementation(async (_s, _p, _c, options) => { await options?.onBeforeBroadcast?.(receipt); return new Promise((_done, fail) => { reject = fail; }); });
  fireEvent.click(signButton()); await waitFor(() => expect(reject).toBeDefined()); unmount(); await act(async () => { reject(new CodeBroadcastStatusUnknownError(receipt.txHash, new Error("Send timed out"))); });
  expect(JSON.parse(localStorage.getItem(RECEIPTS_KEY)!)).toEqual([receipt]); expect(probeTestnetProtocolConfirmation).not.toHaveBeenCalled();
});
it("keeps a preflight-rejected signed diagnostic downloadable without claiming protocol creation or saving a broadcast receipt", async () => {
  const { prepared } = await ready(), snapshot = diagnosticFixture(prepared);
  jest.mocked(signAndBroadcastTestnetProtocol).mockImplementation(async (_s, _p, _c, options) => { await options?.onSignedDiagnostic?.(snapshot); throw new CodeDeploymentRejectedError(prepared.bodyHash, "preflight", "Script rejected"); });
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}); fireEvent.click(signButton());
  fireEvent.click(await screen.findByRole("button", { name: "Download signed protocol diagnostic" }));
  expect(JSON.parse(localStorage.getItem(DIAGNOSTICS_KEY)!)).toEqual([snapshot]); expect(localStorage.getItem(RECEIPTS_KEY)).toBeNull(); expect(click).toHaveBeenCalledTimes(1);
  expect(await screen.findByText(/Read-only protocol verification failed/)).toHaveTextContent("Nothing was broadcast"); expect(screen.queryByRole("button", { name: "Export confirmed isolated protocol manifest" })).not.toBeInTheDocument();
});
it("retains broadcast rejection until an explicit read proves rejected, then permits only a new manual preparation", async () => {
  const { receipt } = await ready();
  jest.mocked(signAndBroadcastTestnetProtocol).mockImplementation(async (_s, _p, _c, options) => { await options?.onBeforeBroadcast?.(receipt); throw new CodeDeploymentRejectedError(receipt.txHash, "broadcast", "Node rejected"); });
  fireEvent.click(signButton()); await screen.findByRole("alert"); expect(prepareButton()).toBeDisabled();
  jest.mocked(probeTestnetProtocolConfirmation).mockResolvedValue({ ...base(receipt), status: "rejected", endpoint: "https://testnet.ckbapp.dev/", reason: "Node rejected", message: "This protocol transaction was rejected." });
  fireEvent.click(screen.getByRole("button", { name: "Check protocol status · no signing" })); await screen.findByText(/The node rejected this protocol transaction. Node rejected/); expect(prepareButton()).toBeEnabled();
  expect(signAndBroadcastTestnetProtocol).toHaveBeenCalledTimes(1); expect(prepareTestnetProtocolDeployment).toHaveBeenCalledTimes(1);
});
it("checks a restored public receipt without a wallet and exports only a confirmed isolated manifest", async () => {
  const receipt = receiptFixture(); localStorage.setItem(RECEIPTS_KEY, JSON.stringify([receipt]));
  const manifest = { schema: "ckboost-isolated-testnet-protocol-state/v1" as const, network: "testnet" as const, transactionHash: receipt.txHash, index: "0x0" as const, blockNumber: "0x7b", protocolTypeScript: receipt.typeScript, protocolTypeHash: receipt.typeHash, protocolLockScript: plain(ccc.Transaction.fromBytes(receipt.transaction).outputs[0].lock), dataHash: receipt.dataHash, protocolDataHex: receipt.protocolDataHex, capacityShannons: receipt.capacityShannons, adminLockHashes: [lock.hash()], campaignsApproved: [], tippingsApproved: [], endorsersWhitelist: [], profile: receipt.profile, scope: "Initial-state-only UI test fixture; no activation." };
  jest.mocked(probeTestnetProtocolConfirmation).mockResolvedValue({ ...base(receipt), status: "confirmed", endpoint: "https://testnet.ckbapp.dev/", blockNumber: "0x7b", manifest });
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}); render(<TestnetProtocolSetupWorkspace />);
  fireEvent.click(screen.getByRole("button", { name: "Check protocol status · no signing" }));
  const exportButton = await screen.findByRole("button", { name: "Export confirmed isolated protocol manifest" }); fireEvent.click(exportButton);
  expect(screen.getByText(/This does not activate it or change the shared protocol/)).toBeInTheDocument(); expect(click).toHaveBeenCalledTimes(1); expect(signAndBroadcastTestnetProtocol).not.toHaveBeenCalled(); expect(prepareButton()).toBeDisabled();
});
it("stops before broadcasting if its required public receipt cannot be saved", async () => {
  const { receipt } = await ready(), send = jest.fn(); jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage full"); });
  jest.mocked(signAndBroadcastTestnetProtocol).mockImplementation(async (_s, _p, _c, options) => { await options?.onBeforeBroadcast?.(receipt); send(); return receipt.txHash; });
  fireEvent.click(signButton()); expect(await screen.findByRole("alert")).toHaveTextContent("Submission was stopped before sending"); expect(send).not.toHaveBeenCalled(); expect(probeTestnetProtocolConfirmation).not.toHaveBeenCalled();
});
it("clears an old valid profile on failed reload and cannot prepare with unreviewed server data", async () => {
  const { } = await ready(); jest.mocked(fetch).mockResolvedValue(response({ ...profileFixture(), network: "mainnet" } as unknown as IsolatedTestnetProfileInput));
  fireEvent.click(loadButton()); expect(await screen.findByRole("alert")).toHaveTextContent("Testnet"); expect(screen.queryByText("Fixed isolated profile loaded")).not.toBeInTheDocument(); expect(screen.queryByLabelText("Unsigned isolated protocol preview")).not.toBeInTheDocument(); expect(prepareButton()).toBeDisabled();
});
it("times out a stuck profile read and never accepts its late result", async () => {
  let resolve!: (value: Response) => void; jest.mocked(fetch).mockImplementation(() => new Promise(done => { resolve = done; })); render(<TestnetProtocolSetupWorkspace />); jest.useFakeTimers(); fireEvent.click(loadButton());
  await act(async () => { jest.advanceTimersByTime(12001); }); expect(screen.getByRole("alert")).toHaveTextContent("timed out");
  await act(async () => { resolve(response()); }); expect(screen.queryByText("Fixed isolated profile loaded")).not.toBeInTheDocument(); expect(prepareButton()).toBeDisabled(); expect(jest.mocked(fetch).mock.calls[0][1]!.signal!.aborted).toBe(true);
});

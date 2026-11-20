import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ccc } from "@ckb-ccc/connector-react";
import { TestnetFundingTransferWorkspace } from "../testnet-funding-transfer-workspace";
import {
  TESTNET_FUNDING_AMOUNT, TESTNET_FUNDING_RECIPIENT_ADDRESS, TESTNET_FUNDING_SOURCE_LOCK_HASH,
  prepareTestnetFundingTransfer, signAndBroadcastTestnetFundingTransfer, makePendingFundingTransfer,
  parsePendingFundingTransfers, parseSignedFundingTransferDiagnostics, probeTestnetFundingTransfer,
  CodeDeploymentRejectedError, CodeBroadcastStatusUnknownError,
  type PreparedTestnetFundingTransfer, type SignedFundingTransferDiagnostic,
} from "@/lib/revamp/testnet-funding-transfer";

let mockSigner: ccc.Signer | undefined;
const mockOpen = jest.fn();
const mockClient = { addressPrefix: "ckt", url: "https://testnet.ckb.dev/" };
jest.mock("@ckb-ccc/connector-react", () => ({ ccc: {
  ...jest.requireActual("@ckb-ccc/core"), useSigner: () => mockSigner, useCcc: () => ({ client: mockClient, open: mockOpen }),
} }));
jest.mock("../ui", () => ({ RevampButton: ({ children, variant: _variant, ...props }: React.ComponentProps<"button"> & { variant?: string }) => <button {...props}>{children}</button> }));
jest.mock("@/lib/revamp/testnet-funding-transfer", () => ({
  ...jest.requireActual("@/lib/revamp/testnet-funding-transfer"),
  prepareTestnetFundingTransfer: jest.fn(), signAndBroadcastTestnetFundingTransfer: jest.fn(), probeTestnetFundingTransfer: jest.fn(),
}));

const RECEIPTS_KEY = "ckboost-testnet-funding-transfer-receipts-v1";
const DIAGNOSTICS_KEY = "ckboost-testnet-funding-transfer-signed-diagnostics-v1";
const sourceLock = ccc.Script.from({ codeHash: "0xd23761b364210735c19c60561d213fb3beae2fd6172743719eff6920e020baac", hashType: "type", args: "0x0001969980e5e09eb09f4e0d0650b0f593e02acd8aca" });
const recipientLock = ccc.Script.from({ codeHash: "0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb", hashType: "type", args: "0x1270de01d042a23bfab1dc06375138b48ea03d006900" });
const otherLock = ccc.Script.from({ codeHash: `0x${"aa".repeat(32)}`, hashType: "type", args: "0x1111" });
const sourceAddress = new ccc.Address(sourceLock, "ckt");
function connect(lock = sourceLock) {
  mockSigner = { client: mockClient, getRecommendedAddressObj: jest.fn().mockResolvedValue(new ccc.Address(lock, "ckt")) } as unknown as ccc.Signer;
}
function fixture(index = 0): PreparedTestnetFundingTransfer {
  const tx = ccc.Transaction.from({
    inputs: [{ previousOutput: { txHash: `0x${"33".repeat(32)}`, index } }],
    outputs: [{ lock: recipientLock, capacity: TESTNET_FUNDING_AMOUNT }, { lock: sourceLock, capacity: ccc.fixedPointFrom(100) }], outputsData: ["0x", "0x"],
    cellDeps: [{ outPoint: { txHash: "0x8f8c79eb6671709633fe6a46de93c0fedc9c1b8a6527a18d3983879542635c9f", index: 3 }, depType: "code" }], witnesses: ["0x1234"],
  });
  return { tx, bodyHash: tx.hash(), sourceLock, sourceAddress: sourceAddress.toString(), recipientLock, recipientAddress: TESTNET_FUNDING_RECIPIENT_ADDRESS, amount: TESTNET_FUNDING_AMOUNT, fee: 200000n };
}
function diagnostic(prepared: PreparedTestnetFundingTransfer): SignedFundingTransferDiagnostic {
  return { schema: "ckboost-testnet-funding-signed-diagnostic/v1", network: "testnet", signedTransaction: ccc.hexFrom(prepared.tx.toBytes()), transactionHash: prepared.bodyHash, preparedBodyHash: prepared.bodyHash, sourceLock: { ...sourceLock }, recipientLock: { ...recipientLock }, recipientAddress: TESTNET_FUNDING_RECIPIENT_ADDRESS, amountShannons: TESTNET_FUNDING_AMOUNT.toString() };
}
function prepareButton() { return screen.getByRole("button", { name: "Prepare unsigned test-fund transfer" }); }
function signButton() { return screen.getByRole("button", { name: "Sign and send fixed 500,000 tCKB transfer" }); }
async function ready() {
  connect(); const prepared = fixture();
  jest.mocked(prepareTestnetFundingTransfer).mockResolvedValue(prepared);
  const view = render(<TestnetFundingTransferWorkspace />);
  await screen.findByText("Matches the authorized JoyID source");
  fireEvent.click(prepareButton()); await screen.findByLabelText("Unsigned transfer preview");
  return { ...view, prepared };
}
const baseResult = (txHash: string) => ({ txHash, checkedAt: "2026-11-20T00:00:00.000Z", attempts: [] });

beforeEach(() => {
  jest.clearAllMocks(); localStorage.clear(); mockSigner = undefined;
  jest.mocked(prepareTestnetFundingTransfer).mockReset(); jest.mocked(signAndBroadcastTestnetFundingTransfer).mockReset(); jest.mocked(probeTestnetFundingTransfer).mockReset();
  jest.mocked(probeTestnetFundingTransfer).mockImplementation(async receipt => ({ ...baseResult(receipt.txHash), status: "unknown", reason: "not-found", message: "Not yet found; keep the saved transfer." }));
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: jest.fn(() => "blob:public-transfer-diagnostic") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: jest.fn() });
});
afterEach(() => jest.restoreAllMocks());

it("shows the pinned full destination and amount without opening a wallet, preparing, signing, or sending", () => {
  render(<TestnetFundingTransferWorkspace />);
  expect(screen.getByText(TESTNET_FUNDING_RECIPIENT_ADDRESS)).toBeInTheDocument();
  expect(screen.getByText(TESTNET_FUNDING_SOURCE_LOCK_HASH)).toBeInTheDocument();
  expect(screen.getByText("500,000 tCKB")).toBeInTheDocument();
  expect(screen.getByText(/does not request more faucet funds/)).toBeInTheDocument();
  expect(prepareButton()).toBeDisabled(); expect(screen.queryByRole("button", { name: /Sign and send/ })).not.toBeInTheDocument();
  expect(mockOpen).not.toHaveBeenCalled(); expect(prepareTestnetFundingTransfer).not.toHaveBeenCalled(); expect(signAndBroadcastTestnetFundingTransfer).not.toHaveBeenCalled();
});

it("keeps a different connected wallet read-only and explains the deliberate JoyID then MetaMask switch", async () => {
  connect(otherLock); render(<TestnetFundingTransferWorkspace />);
  await screen.findByText("Does not match the authorized source");
  expect(prepareButton()).toBeDisabled(); expect(screen.getByText(/Use Open connected wallet above/)).toHaveTextContent("return to MetaMask");
  expect(mockOpen).not.toHaveBeenCalled(); expect(prepareTestnetFundingTransfer).not.toHaveBeenCalled();
});

it("prepares only on click, shows exact capacity and fee, and requests a signature only on a separate click", async () => {
  const { prepared } = await ready();
  const preview = screen.getByLabelText("Unsigned transfer preview");
  expect(within(preview).getByText(TESTNET_FUNDING_RECIPIENT_ADDRESS)).toBeInTheDocument();
  expect(within(preview).getByText("0.002 tCKB (200000 shannons)")).toBeInTheDocument();
  expect(within(preview).getByText("500,000.002 tCKB")).toBeInTheDocument();
  expect(signAndBroadcastTestnetFundingTransfer).not.toHaveBeenCalled();
  jest.mocked(signAndBroadcastTestnetFundingTransfer).mockRejectedValue(new Error("User rejected the transfer request"));
  fireEvent.click(signButton());
  expect(await screen.findByRole("alert")).toHaveTextContent("User rejected the transfer request");
  expect(signAndBroadcastTestnetFundingTransfer).toHaveBeenCalledTimes(1);
  expect(signAndBroadcastTestnetFundingTransfer).toHaveBeenCalledWith(mockSigner, prepared, expect.any(Function), expect.any(Object));
  expect(localStorage.getItem(RECEIPTS_KEY)).toBeNull();
});

it("invalidates an unsigned preparation and its old result when the connected account changes", async () => {
  connect(); let resolve!: (value: PreparedTestnetFundingTransfer) => void;
  jest.mocked(prepareTestnetFundingTransfer).mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = render(<TestnetFundingTransferWorkspace />); await screen.findByText("Matches the authorized JoyID source");
  fireEvent.click(prepareButton()); const guard = jest.mocked(prepareTestnetFundingTransfer).mock.calls[0][1]!;
  connect(otherLock); view.rerender(<TestnetFundingTransferWorkspace />); await screen.findByText("Does not match the authorized source");
  expect(guard()).toBe(false);
  await act(async () => { resolve(fixture()); });
  expect(screen.queryByLabelText("Unsigned transfer preview")).not.toBeInTheDocument(); expect(signAndBroadcastTestnetFundingTransfer).not.toHaveBeenCalled();
});

it("persists the public receipt before broadcast and blocks a restored unknown transfer without automatic retry", async () => {
  const { prepared, unmount } = await ready(); const receipt = makePendingFundingTransfer(prepared, prepared.bodyHash);
  jest.mocked(signAndBroadcastTestnetFundingTransfer).mockImplementation(async (_signer, _prepared, _current, options) => {
    await options?.onBeforeBroadcast?.(receipt);
    expect(parsePendingFundingTransfers(localStorage.getItem(RECEIPTS_KEY))).toEqual([receipt]);
    return receipt.txHash;
  });
  fireEvent.click(signButton()); await screen.findByText("Not yet found; keep the saved transfer.");
  expect(prepareButton()).toBeDisabled(); expect(probeTestnetFundingTransfer).toHaveBeenCalledTimes(1);
  unmount(); render(<TestnetFundingTransferWorkspace />); await screen.findByText("Matches the authorized JoyID source");
  expect(prepareButton()).toBeDisabled(); expect(signAndBroadcastTestnetFundingTransfer).toHaveBeenCalledTimes(1); expect(probeTestnetFundingTransfer).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(parsePendingFundingTransfers(localStorage.getItem(RECEIPTS_KEY)))).not.toMatch(/private.?key|signedTransaction/);
});

it("retains an ambiguous transfer receipt even if the component unmounts before the send result settles", async () => {
  const { prepared, unmount } = await ready(); const receipt = makePendingFundingTransfer(prepared, prepared.bodyHash);
  let reject!: (cause: unknown) => void;
  jest.mocked(signAndBroadcastTestnetFundingTransfer).mockImplementation(async (_s, _p, _c, options) => {
    await options?.onBeforeBroadcast?.(receipt); return new Promise((_done, fail) => { reject = fail; });
  });
  fireEvent.click(signButton()); await waitFor(() => expect(reject).toBeDefined()); unmount();
  await act(async () => { reject(new CodeBroadcastStatusUnknownError(receipt.txHash, new Error("RPC timeout"))); });
  expect(parsePendingFundingTransfers(localStorage.getItem(RECEIPTS_KEY))).toEqual([receipt]); expect(probeTestnetFundingTransfer).not.toHaveBeenCalled();
});

it("preserves a preflight-rejected signed diagnostic for download without adding a broadcast receipt", async () => {
  const { prepared } = await ready(); const snapshot = diagnostic(prepared);
  expect(parseSignedFundingTransferDiagnostics(JSON.stringify([snapshot]))).toHaveLength(1);
  jest.mocked(signAndBroadcastTestnetFundingTransfer).mockImplementation(async (_s, _p, _c, options) => {
    await options?.onSignedDiagnostic?.(snapshot);
    throw new CodeDeploymentRejectedError(prepared.bodyHash, "preflight", "ValidationFailure code -1");
  });
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  fireEvent.click(signButton());
  fireEvent.click(await screen.findByRole("button", { name: "Download signed transfer diagnostic" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("ValidationFailure code -1");
  expect(parseSignedFundingTransferDiagnostics(localStorage.getItem(DIAGNOSTICS_KEY))).toEqual([snapshot]);
  expect(localStorage.getItem(RECEIPTS_KEY)).toBeNull(); expect(probeTestnetFundingTransfer).not.toHaveBeenCalled(); expect(click).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Read-only transfer verification failed/)).toHaveTextContent("Nothing was broadcast");
});

it("retains an explicitly rejected broadcast receipt and permits a fresh manual preparation", async () => {
  const { prepared } = await ready(); const receipt = makePendingFundingTransfer(prepared, prepared.bodyHash);
  jest.mocked(signAndBroadcastTestnetFundingTransfer).mockImplementation(async (_s, _p, _c, options) => {
    await options?.onBeforeBroadcast?.(receipt); throw new CodeDeploymentRejectedError(receipt.txHash, "broadcast", "Rejected fixed transfer");
  });
  fireEvent.click(signButton()); expect(await screen.findByRole("alert")).toHaveTextContent("Rejected fixed transfer");
  expect(parsePendingFundingTransfers(localStorage.getItem(RECEIPTS_KEY))).toEqual([receipt]);
  expect(prepareButton()).toBeEnabled(); expect(prepareTestnetFundingTransfer).toHaveBeenCalledTimes(1); expect(probeTestnetFundingTransfer).not.toHaveBeenCalled();
});

it("rechecks a restored receipt without the source wallet and permanently blocks repetition once confirmed", async () => {
  const prepared = fixture(), receipt = makePendingFundingTransfer(prepared, prepared.bodyHash);
  localStorage.setItem(RECEIPTS_KEY, JSON.stringify([receipt])); connect(otherLock);
  jest.mocked(probeTestnetFundingTransfer).mockResolvedValue({ ...baseResult(receipt.txHash), status: "confirmed", endpoint: "https://testnet.ckbapp.dev/", blockNumber: "0x123", recipientAddress: TESTNET_FUNDING_RECIPIENT_ADDRESS, amountShannons: TESTNET_FUNDING_AMOUNT.toString() });
  const view = render(<TestnetFundingTransferWorkspace />); fireEvent.click(await screen.findByRole("button", { name: "Check transfer status · no signing" }));
  expect(await screen.findByText(/Committed: 500,000 tCKB/)).toHaveTextContent("Do not repeat");
  connect(); view.rerender(<TestnetFundingTransferWorkspace />); await screen.findByText("Matches the authorized JoyID source");
  expect(prepareButton()).toBeDisabled(); expect(signAndBroadcastTestnetFundingTransfer).not.toHaveBeenCalled();
});

it("unblocks a restored rejected receipt only after an explicit status check", async () => {
  const prepared = fixture(), receipt = makePendingFundingTransfer(prepared, prepared.bodyHash);
  localStorage.setItem(RECEIPTS_KEY, JSON.stringify([receipt])); connect();
  jest.mocked(probeTestnetFundingTransfer).mockResolvedValue({ ...baseResult(receipt.txHash), status: "rejected", endpoint: "https://testnet.ckbapp.dev/", reason: "Rejected transaction:null", message: "Rejected" });
  render(<TestnetFundingTransferWorkspace />); await screen.findByText("Matches the authorized JoyID source"); expect(prepareButton()).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Check transfer status · no signing" }));
  await screen.findByText(/The node rejected this transfer. Rejected transaction:null/); expect(prepareButton()).toBeEnabled();
  expect(signAndBroadcastTestnetFundingTransfer).not.toHaveBeenCalled(); expect(prepareTestnetFundingTransfer).not.toHaveBeenCalled();
});

it("stops before sending if the public receipt cannot be persisted", async () => {
  const { prepared } = await ready(); const receipt = makePendingFundingTransfer(prepared, prepared.bodyHash), send = jest.fn();
  jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
  jest.mocked(signAndBroadcastTestnetFundingTransfer).mockImplementation(async (_s, _p, _c, options) => {
    await options?.onBeforeBroadcast?.(receipt); send(); return receipt.txHash;
  });
  fireEvent.click(signButton()); expect(await screen.findByRole("alert")).toHaveTextContent("Submission was stopped before sending");
  expect(send).not.toHaveBeenCalled(); expect(probeTestnetFundingTransfer).not.toHaveBeenCalled();
});

it("detects a receipt saved by another tab before asking for a signature", async () => {
  await ready(); const other = fixture(1), receipt = makePendingFundingTransfer(other, other.bodyHash);
  localStorage.setItem(RECEIPTS_KEY, JSON.stringify([receipt])); fireEvent.click(signButton());
  expect(await screen.findByRole("alert")).toHaveTextContent("Check the existing transfer receipt");
  expect(signAndBroadcastTestnetFundingTransfer).not.toHaveBeenCalled(); expect(prepareButton()).toBeDisabled();
});

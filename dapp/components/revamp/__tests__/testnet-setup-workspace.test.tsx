import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ccc } from "@ckb-ccc/connector-react";
import { TestnetSetupWorkspace } from "../testnet-setup-workspace";
import { TESTNET_CODE_RELEASES, TESTNET_JOYID_CODE_HASH, TYPE_ID_CODE_HASH, CodeBroadcastStatusUnknownError, CodeDeploymentRejectedError, CodeDeploymentPreflightError, getTestnetCodeCapacity, makePendingCodeDeployment, parsePendingCodeDeployments, parseSignedCodeDeploymentDiagnostics, prepareTestnetCodeDeployment, signAndBroadcastTestnetCode, validateTestnetRelease, type PreparedCodeDeployment, type SignedCodeDeploymentDiagnostic, type ConfirmedCodeManifest } from "@/lib/revamp/testnet-code-deployment";
import { probeTestnetCodeConfirmation } from "@/lib/revamp/testnet-code-confirmation";
import { TESTNET_FUNDING_RECIPIENT_ADDRESS } from "@/lib/revamp/testnet-funding-transfer";

const mockOpen = jest.fn();
let mockSigner: ccc.Signer | undefined;
let mockWalletName: string | undefined;
const mockClient = { addressPrefix: "ckt", url: "https://testnet.ckb.dev/" };
const originalFetch = globalThis.fetch;
jest.mock("@ckb-ccc/connector-react", () => ({ ccc: {
  ...jest.requireActual("@ckb-ccc/core"), useSigner: () => mockSigner, useCcc: () => ({ client: mockClient, open: mockOpen, wallet: mockWalletName ? { name: mockWalletName } : undefined }),
} }));
jest.mock("../ui", () => ({ RevampButton: ({ children, variant: _variant, ...props }: React.ComponentProps<"button"> & { variant?: string }) => <button {...props}>{children}</button> }));
jest.mock("@/lib/revamp/testnet-code-deployment", () => ({
  ...jest.requireActual("@/lib/revamp/testnet-code-deployment"),
  prepareTestnetCodeDeployment: jest.fn(), signAndBroadcastTestnetCode: jest.fn(), validateTestnetRelease: jest.fn(),
  // The backend suite validates the signed Molecule whitelist; these tests exercise UI persistence/downloads.
  parseSignedCodeDeploymentDiagnostics: jest.fn(),
}));
jest.mock("@/lib/revamp/testnet-code-confirmation", () => ({ probeTestnetCodeConfirmation: jest.fn() }));
jest.mock("../testnet-funding-transfer-workspace", () => ({ TestnetFundingTransferWorkspace: () => <div data-testid="fixed-funding-transfer" /> }));
jest.mock("../testnet-protocol-setup-workspace", () => ({ TestnetProtocolSetupWorkspace: () => <div data-testid="isolated-protocol-setup" /> }));

const lock = ccc.Script.from({ codeHash: `0x${"ab".repeat(32)}`, hashType: "type", args: `0x${"11".repeat(20)}` });
const address = new ccc.Address(lock, "ckt");
const RECEIPTS_KEY = "ckboost-testnet-code-receipts-v1";
const DIAGNOSTICS_KEY = "ckboost-testnet-code-signed-diagnostics-v1";
const rejection = "TransactionFailedToVerify Inputs[0].Lock ValidationFailure code -1";
const publicJoyIdLock = ccc.Script.from({ codeHash: TESTNET_JOYID_CODE_HASH, hashType: "type", args: "0x0001969980e5e09eb09f4e0d0650b0f593e02acd8aca" });
const publicJoyIdAddress = new ccc.Address(publicJoyIdLock, "ckt");
const fundingLock = ccc.Script.from({ codeHash: "0xf329effd1c475a2978453c8600e1eaf0bc2087ee093c3ee64cc96ec6847752cb", hashType: "type", args: "0x1270de01d042a23bfab1dc06375138b48ea03d006900" });
function previousJoyIdReceipt() {
  // The original public rejected hash and JoyID owner; the Type ID is an unsigned test fixture.
  const prepared = { ...preparedFixture(), bodyHash: "0x3b4c7a2f471bf3d19feee735a8e8a774a58b0bb7c424e78663616bf883c57e44" as ccc.Hex, walletLock: publicJoyIdLock, walletAddress: publicJoyIdAddress.toString(), capacity: getTestnetCodeCapacity(183336, publicJoyIdLock) };
  return makePendingCodeDeployment(prepared, prepared.bodyHash);
}
function preparedFixture(): PreparedCodeDeployment {
  const typeScript = ccc.Script.from({ codeHash: TYPE_ID_CODE_HASH, hashType: "type", args: `0x${"22".repeat(32)}` });
  return {
    id: "protocol-lock", tx: ccc.Transaction.from({}), bodyHash: `0x${"34".repeat(32)}`,
    dataHash: TESTNET_CODE_RELEASES["protocol-lock"].dataHash, typeScript, typeHash: typeScript.hash(),
    capacity: ccc.fixedPointFrom(183462), fee: 200000n, walletLock: lock, walletAddress: address.toString(), byteLength: 183336,
  };
}
function diagnosticFixture(prepared: PreparedCodeDeployment): SignedCodeDeploymentDiagnostic {
  return {
    schema: "ckboost-testnet-code-signed-diagnostic/v1", network: "testnet", contract: prepared.id,
    signedTransaction: "0x1234", transactionHash: prepared.bodyHash, preparedBodyHash: prepared.bodyHash,
    release: { dataHash: prepared.dataHash, byteLength: prepared.byteLength },
    walletLock: { codeHash: prepared.walletLock.codeHash, hashType: prepared.walletLock.hashType, args: prepared.walletLock.args },
    typeScript: { codeHash: prepared.typeScript.codeHash, hashType: prepared.typeScript.hashType, args: prepared.typeScript.args },
  };
}
function connectFixture() {
  mockSigner = { client: mockClient, getRecommendedAddressObj: jest.fn().mockResolvedValue(address) } as unknown as ccc.Signer;
}
async function uploadFixture() {
  const file = new File([new Uint8Array(183336)], "ckboost-protocol-lock");
  Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(183336) });
  fireEvent.change(screen.getByLabelText("Protocol lock release binary"), { target: { files: [file] } });
  await screen.findByText("Verified release: ckboost-protocol-lock");
}
async function readyFixture() {
  connectFixture();
  const prepared = preparedFixture();
  jest.mocked(prepareTestnetCodeDeployment).mockResolvedValue(prepared);
  const view = render(<TestnetSetupWorkspace />);
  await screen.findByText(address.toString()); await uploadFixture();
  fireEvent.click(screen.getByRole("button", { name: "Prepare protocol lock transaction" }));
  await screen.findByRole("button", { name: "Deploy new code cell · Protocol lock" });
  return { ...view, prepared, diagnostic: diagnosticFixture(prepared) };
}

beforeEach(() => {
  jest.clearAllMocks(); localStorage.clear(); mockSigner = undefined; mockWalletName = undefined;
  globalThis.fetch = jest.fn();
  jest.mocked(validateTestnetRelease).mockReset();
  jest.mocked(prepareTestnetCodeDeployment).mockReset(); jest.mocked(signAndBroadcastTestnetCode).mockReset();
  jest.mocked(probeTestnetCodeConfirmation).mockReset();
  jest.mocked(probeTestnetCodeConfirmation).mockResolvedValue({ status: "unknown", reason: "not-found", message: "Not yet found; check again.", txHash: `0x${"34".repeat(32)}`, checkedAt: "2026-11-19T00:00:00.000Z", attempts: [] });
  jest.mocked(parseSignedCodeDeploymentDiagnostics).mockImplementation(raw => raw ? JSON.parse(raw) : []);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: jest.fn(() => "blob:test-diagnostic") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: jest.fn() });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); globalThis.fetch = originalFetch; });

it("has no signing or broadcasting action on mount or wallet connection", () => {
  render(<TestnetSetupWorkspace />);
  fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
  expect(mockOpen).toHaveBeenCalledTimes(1);
  expect(prepareTestnetCodeDeployment).not.toHaveBeenCalled();
  expect(signAndBroadcastTestnetCode).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /Deploy new code cell ·/ })).not.toBeInTheDocument();
});

it("rejects a wrong-size file before preparing a transaction or requesting a signature", async () => {
  mockSigner = { client: mockClient, getRecommendedAddressObj: jest.fn().mockResolvedValue(address) } as unknown as ccc.Signer;
  render(<TestnetSetupWorkspace />);
  await screen.findByText(address.toString());
  fireEvent.change(screen.getByLabelText("Protocol lock release binary"), { target: { files: [new File(["not code"], "wrong.bin")] } });
  expect(await screen.findByRole("alert")).toHaveTextContent("183,336 bytes");
  expect(prepareTestnetCodeDeployment).not.toHaveBeenCalled(); expect(signAndBroadcastTestnetCode).not.toHaveBeenCalled();
});

it("requires a separate explicit Deploy click and keeps wallet rejection visible without a success manifest", async () => {
  mockSigner = { client: mockClient, getRecommendedAddressObj: jest.fn().mockResolvedValue(address) } as unknown as ccc.Signer;
  const typeScript = ccc.Script.from({ codeHash: `0x${"cd".repeat(32)}`, hashType: "type", args: `0x${"22".repeat(32)}` });
  jest.mocked(prepareTestnetCodeDeployment).mockResolvedValue({
    id: "protocol-lock", tx: ccc.Transaction.from({}), bodyHash: `0x${"34".repeat(32)}`,
    dataHash: TESTNET_CODE_RELEASES["protocol-lock"].dataHash, typeScript, typeHash: typeScript.hash(),
    capacity: ccc.fixedPointFrom(183462), fee: 200000n, walletLock: lock, walletAddress: address.toString(), byteLength: 183336,
  });
  jest.mocked(signAndBroadcastTestnetCode).mockRejectedValue(new Error("User rejected the wallet request"));
  render(<TestnetSetupWorkspace />);
  await screen.findByText(address.toString());
  const file = new File([new Uint8Array(183336)], "ckboost-protocol-lock");
  Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(183336) });
  fireEvent.change(screen.getByLabelText("Protocol lock release binary"), { target: { files: [file] } });
  await screen.findByText("Verified release: ckboost-protocol-lock");
  expect(validateTestnetRelease).toHaveBeenCalledTimes(1);
  expect(prepareTestnetCodeDeployment).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Prepare protocol lock transaction" }));
  const deploy = await screen.findByRole("button", { name: "Deploy new code cell · Protocol lock" });
  expect(signAndBroadcastTestnetCode).not.toHaveBeenCalled();
  expect(screen.getByText("Estimated network fee")).toBeInTheDocument();
  fireEvent.click(deploy);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("User rejected the wallet request"));
  expect(signAndBroadcastTestnetCode).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Export confirmed code manifest" })).not.toBeInTheDocument();
});

it("saves the known public receipt when an ambiguous broadcast settles after navigating away", async () => {
  mockSigner = { client: mockClient, getRecommendedAddressObj: jest.fn().mockResolvedValue(address) } as unknown as ccc.Signer;
  const txHash = `0x${"34".repeat(32)}` as ccc.Hex;
  const typeScript = ccc.Script.from({ codeHash: TYPE_ID_CODE_HASH, hashType: "type", args: `0x${"22".repeat(32)}` });
  jest.mocked(prepareTestnetCodeDeployment).mockResolvedValue({
    id: "protocol-lock", tx: ccc.Transaction.from({}), bodyHash: txHash,
    dataHash: TESTNET_CODE_RELEASES["protocol-lock"].dataHash, typeScript, typeHash: typeScript.hash(),
    capacity: ccc.fixedPointFrom(183462), fee: 200000n, walletLock: lock, walletAddress: address.toString(), byteLength: 183336,
  });
  let failBroadcast!: (cause: unknown) => void;
  jest.mocked(signAndBroadcastTestnetCode).mockImplementation(() => new Promise((_, reject) => { failBroadcast = reject; }));
  const { unmount } = render(<TestnetSetupWorkspace />);
  await screen.findByText(address.toString());
  const file = new File([new Uint8Array(183336)], "ckboost-protocol-lock");
  Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(183336) });
  fireEvent.change(screen.getByLabelText("Protocol lock release binary"), { target: { files: [file] } });
  await screen.findByText("Verified release: ckboost-protocol-lock");
  fireEvent.click(screen.getByRole("button", { name: "Prepare protocol lock transaction" }));
  fireEvent.click(await screen.findByRole("button", { name: "Deploy new code cell · Protocol lock" }));
  await waitFor(() => expect(signAndBroadcastTestnetCode).toHaveBeenCalledTimes(1));
  unmount();
  await act(async () => { failBroadcast(new CodeBroadcastStatusUnknownError(txHash, new Error("RPC timeout"))); });
  const restored = parsePendingCodeDeployments(localStorage.getItem("ckboost-testnet-code-receipts-v1"));
  expect(restored).toHaveLength(1); expect(restored[0].txHash).toBe(txHash);
  expect(JSON.stringify(restored)).not.toMatch(/private.?key/i);
});

it("rechecks a saved old rejected transaction without polling, signing, deleting the receipt, or offering a manifest", async () => {
  const prepared = preparedFixture(), receipt = makePendingCodeDeployment(prepared, prepared.bodyHash);
  localStorage.setItem(RECEIPTS_KEY, JSON.stringify([receipt]));
  jest.mocked(probeTestnetCodeConfirmation).mockResolvedValue({
    status: "rejected", reason: rejection, message: "Node explicitly rejected transaction:null.",
    endpoint: "https://testnet.ckbapp.dev/", txHash: receipt.txHash, checkedAt: "2026-11-19T00:00:00.000Z",
    attempts: [{ endpoint: "https://testnet.ckbapp.dev/", status: "rejected", chainStatus: "rejected", reason: rejection }],
  });
  render(<TestnetSetupWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: "Check confirmation · no signing" }));
  expect(await screen.findByText(new RegExp(`Node rejected this transaction.*ValidationFailure code -1`))).toBeInTheDocument();
  expect(screen.queryByText(/Checking the saved transaction through public/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Export confirmed code manifest" })).not.toBeInTheDocument();
  expect(probeTestnetCodeConfirmation).toHaveBeenCalledTimes(1);
  expect(prepareTestnetCodeDeployment).not.toHaveBeenCalled(); expect(signAndBroadcastTestnetCode).not.toHaveBeenCalled();
  expect(parsePendingCodeDeployments(localStorage.getItem(RECEIPTS_KEY))).toEqual([receipt]);
});

it.each(["script-rejected", "verification-unavailable"] as const)("persists a downloadable diagnostic after %s preflight, with no broadcast receipt", async failure => {
  const { prepared, diagnostic } = await readyFixture();
  jest.mocked(signAndBroadcastTestnetCode).mockImplementation(async (_signer, _prepared, _guard, options) => {
    await options?.onSignedDiagnostic?.(diagnostic);
    if (failure === "script-rejected") throw new CodeDeploymentRejectedError(prepared.bodyHash, "preflight", rejection);
    throw new CodeDeploymentPreflightError(prepared.bodyHash, "Read-only RPC unavailable");
  });
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  fireEvent.click(screen.getByRole("button", { name: "Deploy new code cell · Protocol lock" }));
  const download = await screen.findByRole("button", { name: "Download signed transaction diagnostic" });
  expect(download).toBeEnabled();
  expect(await screen.findByRole("alert")).toHaveTextContent(failure === "script-rejected" ? "during preflight" : "Nothing was broadcast");
  expect(JSON.parse(localStorage.getItem(DIAGNOSTICS_KEY)!)).toEqual([diagnostic]);
  expect(localStorage.getItem(RECEIPTS_KEY)).toBeNull();
  expect(screen.queryByRole("region", { name: "Deployment receipts" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Export confirmed code manifest" })).not.toBeInTheDocument();
  expect(probeTestnetCodeConfirmation).not.toHaveBeenCalled();
  fireEvent.click(download);
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1); expect(click).toHaveBeenCalledTimes(1);
  expect(signAndBroadcastTestnetCode).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(diagnostic)).not.toMatch(/private.?key/i);
});

it("keeps a broadcast-rejected receipt and its diagnostic, without pretending it is awaiting confirmation", async () => {
  const { prepared, diagnostic } = await readyFixture();
  jest.mocked(signAndBroadcastTestnetCode).mockImplementation(async (_signer, _prepared, _guard, options) => {
    await options?.onSignedDiagnostic?.(diagnostic);
    throw new CodeDeploymentRejectedError(prepared.bodyHash, "broadcast", rejection);
  });
  fireEvent.click(screen.getByRole("button", { name: "Deploy new code cell · Protocol lock" }));
  await screen.findByText("The node rejected submission. This transaction is not waiting for confirmation.");
  expect(screen.getAllByText(/rejected this transaction during broadcast/).length).toBeGreaterThan(0);
  expect(parsePendingCodeDeployments(localStorage.getItem(RECEIPTS_KEY))).toEqual([makePendingCodeDeployment(prepared, prepared.bodyHash)]);
  expect(JSON.parse(localStorage.getItem(DIAGNOSTICS_KEY)!)).toEqual([diagnostic]);
  expect(screen.getByRole("button", { name: "Download signed transaction diagnostic" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Export confirmed code manifest" })).not.toBeInTheDocument();
  expect(probeTestnetCodeConfirmation).not.toHaveBeenCalled();
});

it("restores a signed diagnostic for download after refresh without reconnecting, signing or broadcasting", async () => {
  const diagnostic = diagnosticFixture(preparedFixture());
  localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify([diagnostic]));
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(<TestnetSetupWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: "Download signed transaction diagnostic" }));
  expect(click).toHaveBeenCalledTimes(1); expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  expect(mockOpen).not.toHaveBeenCalled(); expect(signAndBroadcastTestnetCode).not.toHaveBeenCalled();
  expect(probeTestnetCodeConfirmation).not.toHaveBeenCalled();
});

it("blocks a repeated prepare while a saved same-artifact transaction is unverified or pending, and unlocks only after a rejected check", async () => {
  connectFixture(); const prepared = preparedFixture(), receipt = makePendingCodeDeployment(prepared, prepared.bodyHash);
  localStorage.setItem(RECEIPTS_KEY, JSON.stringify([receipt]));
  jest.mocked(prepareTestnetCodeDeployment).mockResolvedValue(prepared);
  jest.mocked(probeTestnetCodeConfirmation).mockResolvedValueOnce({ status: "pending", chainStatus: "proposed", endpoint: "https://testnet.ckbapp.dev/", message: "Proposed, not committed.", txHash: receipt.txHash, checkedAt: "2026-11-19T00:00:00.000Z", attempts: [] });
  render(<TestnetSetupWorkspace />); await screen.findByText(address.toString()); await uploadFixture();
  const prepare = screen.getByRole("button", { name: "Prepare protocol lock transaction" });
  expect(prepare).toBeDisabled();
  expect(prepare).toHaveAccessibleDescription(/has not been verified in this session/);
  fireEvent.click(screen.getByRole("button", { name: "Check confirmation · no signing" }));
  await screen.findByText("Proposed, not committed."); expect(prepare).toBeDisabled();
  expect(prepare).toHaveAccessibleDescription(/is pending/);
  jest.mocked(probeTestnetCodeConfirmation).mockResolvedValueOnce({ status: "rejected", reason: rejection, endpoint: "https://testnet.ckbapp.dev/", message: "Rejected.", txHash: receipt.txHash, checkedAt: "2026-11-19T00:00:00.000Z", attempts: [] });
  fireEvent.click(screen.getByRole("button", { name: "Check confirmation · no signing" }));
  await screen.findByText(/Node rejected this transaction/);
  expect(prepare).toBeEnabled(); fireEvent.click(prepare);
  await screen.findByRole("button", { name: "Deploy new code cell · Protocol lock" });
  expect(prepareTestnetCodeDeployment).toHaveBeenCalledTimes(1); expect(signAndBroadcastTestnetCode).not.toHaveBeenCalled();
  expect(parsePendingCodeDeployments(localStorage.getItem(RECEIPTS_KEY))).toEqual([receipt]);
});

it("keeps a confirmed same-artifact deployment blocked while enabling its manifest download", async () => {
  connectFixture(); const prepared = preparedFixture(), receipt = makePendingCodeDeployment(prepared, prepared.bodyHash);
  localStorage.setItem(RECEIPTS_KEY, JSON.stringify([receipt]));
  const manifest = { schema: "ckboost-testnet-code-deployment/v1", network: "testnet", contract: prepared.id, transactionHash: receipt.txHash, dataHash: prepared.dataHash } as ConfirmedCodeManifest;
  jest.mocked(probeTestnetCodeConfirmation).mockResolvedValue({ status: "confirmed", manifest, endpoint: "https://testnet.ckbapp.dev/", blockNumber: "0x123", txHash: receipt.txHash, checkedAt: "2026-11-19T00:00:00.000Z", attempts: [] });
  render(<TestnetSetupWorkspace />); await screen.findByText(address.toString()); await uploadFixture();
  fireEvent.click(screen.getByRole("button", { name: "Check confirmation · no signing" }));
  expect(await screen.findByRole("button", { name: "Export confirmed code manifest" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Prepare protocol lock transaction" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Deploy new code cell · Protocol lock" })).not.toBeInTheDocument();
  expect(prepareTestnetCodeDeployment).not.toHaveBeenCalled(); expect(signAndBroadcastTestnetCode).not.toHaveBeenCalled();
});

it("explains the current JoyID size incompatibility and blocks both code preparations while leaving the wallet control available", async () => {
  const joyLock = ccc.Script.from({ codeHash: TESTNET_JOYID_CODE_HASH, hashType: "type", args: `0x0001${"ab".repeat(20)}` });
  const joyAddress = new ccc.Address(joyLock, "ckt");
  mockSigner = { client: mockClient, getRecommendedAddressObj: jest.fn().mockResolvedValue(joyAddress) } as unknown as ccc.Signer;
  render(<TestnetSetupWorkspace />);
  const explanation = await screen.findByRole("note", { name: "JoyID deployment size limit" });
  expect(explanation).toHaveTextContent("131,072");
  expect(explanation).toHaveTextContent("183,336");
  expect(explanation).toHaveTextContent("255,480");
  expect(explanation).toHaveTextContent("compatible, smaller CKBoost app transactions");
  expect(explanation).toHaveTextContent("compatible funding wallet");
  await uploadFixture();
  const campaign = new File([new Uint8Array(255480)], "ckboost-campaign-type");
  Object.defineProperty(campaign, "arrayBuffer", { value: async () => new ArrayBuffer(255480) });
  fireEvent.change(screen.getByLabelText("Campaign type release binary"), { target: { files: [campaign] } });
  await screen.findByText("Verified release: ckboost-campaign-type");
  const protocolPrepare = screen.getByRole("button", { name: "Prepare protocol lock transaction" });
  const campaignPrepare = screen.getByRole("button", { name: "Prepare campaign type transaction" });
  expect(protocolPrepare).toBeDisabled(); expect(campaignPrepare).toBeDisabled();
  expect(protocolPrepare).toHaveAccessibleDescription(/128 KiB/);
  fireEvent.click(protocolPrepare); fireEvent.click(campaignPrepare);
  expect(prepareTestnetCodeDeployment).not.toHaveBeenCalled(); expect(signAndBroadcastTestnetCode).not.toHaveBeenCalled();
  const walletControl = screen.getByRole("button", { name: "Open connected wallet" });
  expect(walletControl).toBeEnabled(); expect(mockOpen).not.toHaveBeenCalled();
  fireEvent.click(walletControl); expect(mockOpen).toHaveBeenCalledTimes(1);
});

it("keeps JoyID receipt checks and diagnostic downloads usable without allowing a rejected oversized deployment to be prepared again", async () => {
  const joyLock = ccc.Script.from({ codeHash: TESTNET_JOYID_CODE_HASH, hashType: "type", args: `0x0001${"ab".repeat(20)}` });
  const joyAddress = new ccc.Address(joyLock, "ckt");
  mockSigner = { client: mockClient, getRecommendedAddressObj: jest.fn().mockResolvedValue(joyAddress) } as unknown as ccc.Signer;
  const prepared = { ...preparedFixture(), walletLock: joyLock, walletAddress: joyAddress.toString(), capacity: getTestnetCodeCapacity(183336, joyLock) };
  const receipt = makePendingCodeDeployment(prepared, prepared.bodyHash), diagnostic = diagnosticFixture(prepared);
  localStorage.setItem(RECEIPTS_KEY, JSON.stringify([receipt]));
  localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify([diagnostic]));
  jest.mocked(probeTestnetCodeConfirmation).mockResolvedValue({ status: "rejected", reason: rejection, endpoint: "https://testnet.ckbapp.dev/", message: "Rejected.", txHash: receipt.txHash, checkedAt: "2026-11-19T00:00:00.000Z", attempts: [] });
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(<TestnetSetupWorkspace />);
  await screen.findByRole("note", { name: "JoyID deployment size limit" }); await uploadFixture();
  const check = screen.getByRole("button", { name: "Check confirmation · no signing" });
  expect(check).toBeEnabled(); fireEvent.click(check);
  await screen.findByText(/Node rejected this transaction/);
  const download = screen.getByRole("button", { name: "Download signed transaction diagnostic" });
  expect(download).toBeEnabled(); fireEvent.click(download);
  expect(click).toHaveBeenCalledTimes(1); expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Prepare protocol lock transaction" })).toBeDisabled();
  expect(probeTestnetCodeConfirmation).toHaveBeenCalledTimes(1);
  expect(prepareTestnetCodeDeployment).not.toHaveBeenCalled(); expect(signAndBroadcastTestnetCode).not.toHaveBeenCalled();
  expect(parsePendingCodeDeployments(localStorage.getItem(RECEIPTS_KEY))).toEqual([receipt]);
});

it("always describes every Prepare button and lists both missing wallet and refresh-cleared file requirements", () => {
  render(<TestnetSetupWorkspace />);
  for (const name of ["protocol lock", "campaign type"]) {
    const button = screen.getByRole("button", { name: `Prepare ${name} transaction` });
    expect(button).toBeDisabled(); expect(button).toHaveAttribute("aria-describedby");
    expect(button).toHaveAccessibleDescription(/Connect a Testnet wallet/);
    expect(button).toHaveAccessibleDescription(/Load the reviewed ckboost-/);
    expect(button).toHaveAccessibleDescription(/Refreshing clears selected files and unsigned preparation/);
  }
  expect(prepareTestnetCodeDeployment).not.toHaveBeenCalled(); expect(signAndBroadcastTestnetCode).not.toHaveBeenCalled();
});

it("distinguishes a wallet read in progress from a failed read and offers an explicit retry", async () => {
  let fail!: (cause: unknown) => void;
  const read = jest.fn().mockImplementationOnce(() => new Promise((_ok, reject) => { fail = reject; })).mockResolvedValue(address);
  mockSigner = { client: mockClient, getRecommendedAddressObj: read } as unknown as ccc.Signer;
  render(<TestnetSetupWorkspace />); await uploadFixture();
  const prepare = screen.getByRole("button", { name: "Prepare protocol lock transaction" });
  expect(prepare).toHaveAccessibleDescription(/Checking the connected Testnet wallet/);
  await act(async () => { fail(new Error("Public wallet read timed out")); });
  expect(prepare).toHaveAccessibleDescription(/could not be verified: Public wallet read timed out/);
  expect(prepare).not.toHaveAccessibleDescription(/Checking the connected Testnet wallet/);
  fireEvent.click(screen.getByRole("button", { name: "Retry wallet check" }));
  await screen.findByText(address.toString()); expect(prepare).toBeEnabled();
  expect(prepare).toHaveAccessibleDescription(/Ready to prepare/); expect(prepareTestnetCodeDeployment).not.toHaveBeenCalled();
});

it("explains local file validation, invalid files, and busy preparation using the same disabled gate", async () => {
  connectFixture(); render(<TestnetSetupWorkspace />); await screen.findByText(address.toString());
  const prepare = screen.getByRole("button", { name: "Prepare protocol lock transaction" });
  let read!: (bytes: ArrayBuffer) => void;
  const file = new File([new Uint8Array(183336)], "ckboost-protocol-lock");
  Object.defineProperty(file, "arrayBuffer", { value: () => new Promise<ArrayBuffer>(resolve => { read = resolve; }) });
  fireEvent.change(screen.getByLabelText("Protocol lock release binary"), { target: { files: [file] } });
  expect(prepare).toBeDisabled(); expect(prepare).toHaveAccessibleDescription(/Validating the selected local release file/);
  await act(async () => { read(new ArrayBuffer(183336)); });
  expect(prepare).toBeEnabled(); expect(prepare).toHaveAccessibleDescription(/Ready to prepare/);
  fireEvent.change(screen.getByLabelText("Protocol lock release binary"), { target: { files: [new File(["bad"], "wrong.bin")] } });
  expect(prepare).toBeDisabled(); expect(prepare).toHaveAccessibleDescription(/selected release file is invalid/);
  await uploadFixture();
  let finish!: (result: PreparedCodeDeployment) => void;
  jest.mocked(prepareTestnetCodeDeployment).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(prepare); expect(prepare).toBeDisabled(); expect(prepare).toHaveAccessibleDescription(/Another deployment operation is in progress/);
  fireEvent.click(prepare); expect(prepareTestnetCodeDeployment).toHaveBeenCalledTimes(1);
  await act(async () => { finish(preparedFixture()); });
  expect(signAndBroadcastTestnetCode).not.toHaveBeenCalled();
});

it("enables MetaMask preparation with a verified file after the real old JoyID transaction is rejected, retaining its previous owner history", async () => {
  const receipt = previousJoyIdReceipt(); localStorage.setItem(RECEIPTS_KEY, JSON.stringify([receipt]));
  mockWalletName = "MetaMask";
  mockSigner = { type: ccc.SignerType.EVM, client: mockClient, getRecommendedAddressObj: jest.fn().mockResolvedValue(new ccc.Address(fundingLock, "ckt")) } as unknown as ccc.Signer;
  jest.mocked(probeTestnetCodeConfirmation).mockResolvedValue({ status: "rejected", reason: rejection, endpoint: "https://testnet.ckb.dev/", message: "Rejected transaction:null", txHash: receipt.txHash, checkedAt: "2026-11-20T00:00:00.000Z", attempts: [] });
  jest.mocked(prepareTestnetCodeDeployment).mockResolvedValue(preparedFixture());
  render(<TestnetSetupWorkspace />); await screen.findByText(TESTNET_FUNDING_RECIPIENT_ADDRESS);
  expect(screen.getByText("MetaMask · EVM")).toBeInTheDocument(); expect(screen.getByText("Matches your specified deployment funding address")).toBeInTheDocument();
  const prepare = screen.getByRole("button", { name: "Prepare protocol lock transaction" });
  expect(prepare).toBeDisabled(); expect(prepare).toHaveAccessibleDescription(/Load the reviewed/);
  expect(prepare).toHaveAccessibleDescription(/has not been verified in this session/);
  expect(screen.getByText(`Owner: ${publicJoyIdAddress.toString()}`)).toBeInTheDocument();
  expect(screen.getByText(/Owner is a previous wallet/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Check confirmation · no signing" }));
  await screen.findByText(/Node rejected this transaction/);
  expect(prepare).toBeDisabled(); expect(prepare).toHaveAccessibleDescription(/Refreshing clears selected files/);
  expect(prepare).not.toHaveAccessibleDescription(/Saved transaction/);
  await uploadFixture();
  expect(prepare).toBeEnabled(); expect(prepare).toHaveAccessibleDescription(/Previously rejected transactions do not block/);
  fireEvent.click(prepare); await screen.findByRole("button", { name: "Deploy new code cell · Protocol lock" });
  expect(prepareTestnetCodeDeployment).toHaveBeenCalledTimes(1); expect(signAndBroadcastTestnetCode).not.toHaveBeenCalled();
  expect(parsePendingCodeDeployments(localStorage.getItem(RECEIPTS_KEY))).toEqual([receipt]);
});

it("does not guess a generic EVM provider brand or ignore an unknown previous-wallet receipt", async () => {
  const receipt = previousJoyIdReceipt(); localStorage.setItem(RECEIPTS_KEY, JSON.stringify([receipt]));
  mockSigner = { type: ccc.SignerType.EVM, client: mockClient, getRecommendedAddressObj: jest.fn().mockResolvedValue(new ccc.Address(fundingLock, "ckt")) } as unknown as ccc.Signer;
  render(<TestnetSetupWorkspace />); await screen.findByText(TESTNET_FUNDING_RECIPIENT_ADDRESS); await uploadFixture();
  expect(screen.getByText("EVM wallet · provider brand not reported")).toBeInTheDocument(); expect(screen.queryByText("MetaMask · EVM")).not.toBeInTheDocument();
  const prepare = screen.getByRole("button", { name: "Prepare protocol lock transaction" });
  expect(prepare).toBeDisabled(); expect(prepare).toHaveAccessibleDescription(/including when its owner is a previous wallet/);
  fireEvent.click(screen.getByRole("button", { name: "Check confirmation · no signing" })); await screen.findByText("Not yet found; check again.");
  expect(prepare).toBeDisabled(); expect(prepare).toHaveAccessibleDescription(/has unknown status/);
  expect(prepareTestnetCodeDeployment).not.toHaveBeenCalled(); expect(signAndBroadcastTestnetCode).not.toHaveBeenCalled();
});

function releaseResponse(byteLength = 183336, header = String(byteLength)): Response {
  return { ok: true, status: 200, headers: { get: (name: string) => name.toLowerCase() === "content-length" ? header : null }, arrayBuffer: async () => new ArrayBuffer(byteLength) } as unknown as Response;
}
function loadButton() { return screen.getByRole("button", { name: "Load reviewed release · Protocol lock" }); }

it("loads only the explicitly chosen reviewed release, validates it, and does not auto-prepare or sign", async () => {
  connectFixture(); jest.mocked(fetch).mockResolvedValue(releaseResponse());
  render(<TestnetSetupWorkspace />); await screen.findByText(address.toString());
  expect(fetch).not.toHaveBeenCalled(); fireEvent.click(loadButton());
  await screen.findByText("Verified release: ckboost-protocol-lock");
  expect(screen.getByText(/Reviewed release loaded; no manual file selection needed/)).toBeInTheDocument();
  expect(screen.getByLabelText("Protocol lock release binary")).toHaveValue("");
  expect(fetch).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledWith("/revamp/testnet-setup/release/protocol-lock", expect.objectContaining({ cache: "no-store", redirect: "error", signal: expect.any(AbortSignal) }));
  expect(validateTestnetRelease).toHaveBeenCalledWith("protocol-lock", expect.any(Uint8Array));
  expect(screen.getByRole("button", { name: "Prepare protocol lock transaction" })).toBeEnabled();
  expect(prepareTestnetCodeDeployment).not.toHaveBeenCalled(); expect(signAndBroadcastTestnetCode).not.toHaveBeenCalled();
});

it("clears a previously verified file when server loading fails and supports an explicit retry", async () => {
  connectFixture(); render(<TestnetSetupWorkspace />); await screen.findByText(address.toString()); await uploadFixture();
  jest.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as Response).mockResolvedValueOnce(releaseResponse());
  fireEvent.click(loadButton()); expect(await screen.findByRole("alert")).toHaveTextContent("HTTP 404");
  const prepare = screen.getByRole("button", { name: "Prepare protocol lock transaction" });
  expect(prepare).toBeDisabled(); expect(prepare).toHaveAccessibleDescription(/local reviewed release could not be loaded/);
  expect(screen.queryByText("Verified release: ckboost-protocol-lock")).not.toBeInTheDocument();
  fireEvent.click(loadButton()); await screen.findByText("Verified release: ckboost-protocol-lock"); expect(prepare).toBeEnabled();
  expect(fetch).toHaveBeenCalledTimes(2); expect(prepareTestnetCodeDeployment).not.toHaveBeenCalled();
});

it.each(["header", "body", "hash"] as const)("rejects a server release with an invalid %s without enabling Prepare", async failure => {
  connectFixture(); render(<TestnetSetupWorkspace />); await screen.findByText(address.toString());
  jest.mocked(fetch).mockResolvedValue(failure === "header" ? releaseResponse(183336, "2000000") : failure === "body" ? releaseResponse(12, "183336") : releaseResponse());
  if (failure === "hash") jest.mocked(validateTestnetRelease).mockImplementationOnce(() => { throw new Error("The ELF or pinned data hash does not match"); });
  fireEvent.click(loadButton()); await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Prepare protocol lock transaction" })).toBeDisabled();
  expect(screen.queryByText("Verified release: ckboost-protocol-lock")).not.toBeInTheDocument();
  expect(prepareTestnetCodeDeployment).not.toHaveBeenCalled(); expect(signAndBroadcastTestnetCode).not.toHaveBeenCalled();
});

it("stops an oversized streamed body within the pinned byte budget", async () => {
  connectFixture(); render(<TestnetSetupWorkspace />); await screen.findByText(address.toString());
  const cancel = jest.fn().mockResolvedValue(undefined), releaseLock = jest.fn();
  jest.mocked(fetch).mockResolvedValue({ ...releaseResponse(), body: { getReader: () => ({ read: async () => ({ done: false, value: new Uint8Array(183337) }), cancel, releaseLock }) } } as unknown as Response);
  fireEvent.click(loadButton()); expect(await screen.findByRole("alert")).toHaveTextContent("exceeded the reviewed size");
  expect(cancel).toHaveBeenCalledTimes(1); expect(releaseLock).toHaveBeenCalledTimes(1); expect(validateTestnetRelease).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Prepare protocol lock transaction" })).toBeDisabled();
});

it("keeps a newer manual selection when a superseded server download resolves late", async () => {
  connectFixture(); render(<TestnetSetupWorkspace />); await screen.findByText(address.toString());
  let resolve!: (response: Response) => void; jest.mocked(fetch).mockImplementation(() => new Promise(done => { resolve = done; }));
  fireEvent.click(loadButton()); const signal = jest.mocked(fetch).mock.calls[0][1]!.signal!;
  const file = new File([new Uint8Array(183336)], "manual-reviewed-release"); Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(183336) });
  fireEvent.change(screen.getByLabelText("Protocol lock release binary"), { target: { files: [file] } });
  await screen.findByText("Verified release: manual-reviewed-release"); expect(signal.aborted).toBe(true);
  await act(async () => { resolve(releaseResponse()); });
  expect(screen.getByText("Verified release: manual-reviewed-release")).toBeInTheDocument();
  expect(screen.queryByText("Verified release: ckboost-protocol-lock")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("ignores a superseded manual file read after a newer reviewed server release succeeds", async () => {
  connectFixture(); render(<TestnetSetupWorkspace />); await screen.findByText(address.toString());
  let resolve!: (bytes: ArrayBuffer) => void;
  const file = new File([new Uint8Array(183336)], "stale-manual-release"); Object.defineProperty(file, "arrayBuffer", { value: () => new Promise(done => { resolve = done; }) });
  fireEvent.change(screen.getByLabelText("Protocol lock release binary"), { target: { files: [file] } });
  jest.mocked(fetch).mockResolvedValue(releaseResponse()); fireEvent.click(loadButton()); await screen.findByText("Verified release: ckboost-protocol-lock");
  await act(async () => { resolve(new ArrayBuffer(183336)); });
  expect(screen.queryByText("Verified release: stale-manual-release")).not.toBeInTheDocument(); expect(validateTestnetRelease).toHaveBeenCalledTimes(1);
});

it.each(["manual", "server"] as const)("times out a stuck %s read and ignores a late result", async kind => {
  connectFixture(); render(<TestnetSetupWorkspace />); await screen.findByText(address.toString()); jest.useFakeTimers();
  let resolve!: (value: ArrayBuffer | Response) => void;
  if (kind === "server") { jest.mocked(fetch).mockImplementation(() => new Promise(done => { resolve = done as typeof resolve; })); fireEvent.click(loadButton()); }
  else {
    const file = new File([new Uint8Array(183336)], "stuck-manual-release"); Object.defineProperty(file, "arrayBuffer", { value: () => new Promise(done => { resolve = done; }) });
    fireEvent.change(screen.getByLabelText("Protocol lock release binary"), { target: { files: [file] } });
  }
  await act(async () => { jest.advanceTimersByTime(12001); });
  const prepare = screen.getByRole("button", { name: "Prepare protocol lock transaction" });
  expect(prepare).toBeDisabled(); expect(prepare).toHaveAccessibleDescription(/timed out/);
  await act(async () => { resolve(kind === "server" ? releaseResponse() : new ArrayBuffer(183336)); });
  expect(screen.queryByText(/Verified release:/)).not.toBeInTheDocument(); expect(validateTestnetRelease).not.toHaveBeenCalled();
  if (kind === "server") expect(jest.mocked(fetch).mock.calls[0][1]!.signal!.aborted).toBe(true);
});

import "@testing-library/jest-dom";
import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProtocolManagement } from "../protocol-management";
import type { ProtocolChangesDialog } from "../protocol/protocol-changes-dialog";

const mockUpdate = jest.fn();
let mockDialogProps: React.ComponentProps<typeof ProtocolChangesDialog> | undefined;
const mockHash = `0x${"1".repeat(64)}`;
const mockTemplate = {
  protocol_config: {
    admin_lock_hash_vec: [mockHash],
    script_code_hashes: Object.fromEntries([
      "protocol_type", "protocol_lock", "campaign_type", "funding_lock", "user_type", "points_udt_type", "tipping_type", "achievement_type",
    ].map(key => [`ckb_boost_${key}_code_hash`, mockHash])),
    achievement_type_hashes: [], streak_bonus_interval: 0n, streak_bonus_amount: 0n,
  },
  tipping_config: { approval_requirement_thresholds: [1n], expiration_duration: 3600n },
  endorsers_whitelist: [{ endorser_lock_hash: mockHash, endorser_name: "Organizer" }],
};
const mockProtocol = {
  protocolData: mockTemplate, metrics: null, transactions: [], isLoading: false, error: null,
  updateProtocol: mockUpdate, addEndorser: jest.fn(), getTipping: jest.fn(), editEndorser: jest.fn(), removeEndorser: jest.fn(),
  calculateChanges: jest.fn(), refreshProtocolData: jest.fn(), isWalletConnected: true, protocolCell: {},
};
jest.mock("@/lib/providers/protocol-provider", () => ({ useProtocol: () => mockProtocol }));
jest.mock("@/lib/ckb/protocol-deployment", () => ({
  getProtocolConfigStatus: () => "complete", getProtocolDeploymentTemplate: () => mockTemplate,
  getContractDeploymentStatus: () => ({ allDeployed: true, missingContracts: [] }), deployProtocolCell: jest.fn(), validateDeploymentParams: jest.fn(),
}));
jest.mock("@ckb-ccc/connector-react", () => ({ ccc: {
  useSigner: () => undefined, Script: { from: (value: unknown) => value },
  hexFrom: (value: unknown) => value, numFrom: (value: bigint | string | number) => BigInt(value),
} }));
jest.mock("ssri-ckboost", () => ({ createScopedLogger: () => ({ info: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() }) }), { virtual: true });
jest.mock("../protocol", () => ({
  ProtocolStats: () => null, AdminManagement: () => null, TippingConfig: () => null,
  StreakConfig: () => null, ScriptCodeHashes: () => null, AchievementsConfig: () => null,
  ProtocolDeploymentSection: () => null, ProtocolSummarySection: () => null,
  EndorserManagement: ({ onRemoveEndorser }: { onRemoveEndorser: (index: number) => void }) => <button onClick={() => onRemoveEndorser(0)}>Remove organizer</button>,
  ProtocolChangesDialog: (props: React.ComponentProps<typeof ProtocolChangesDialog>) => {
    mockDialogProps = props;
    const Actual = jest.requireActual("../protocol/protocol-changes-dialog").ProtocolChangesDialog;
    return <Actual {...props} />;
  },
}));

function deferred() {
  let resolve!: (value: string) => void, reject!: (error: Error) => void;
  const promise = new Promise<string>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function openConfirmation() {
  render(<ProtocolManagement />);
  fireEvent.click(screen.getByRole("button", { name: "Remove organizer" }));
  const save = screen.getByRole("button", { name: "Save All Changes" });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(save);
  expect(screen.getByRole("button", { name: "Confirm & Update Protocol" })).toBeEnabled();
  return save;
}

beforeEach(() => {
  jest.clearAllMocks(); mockUpdate.mockReset(); mockDialogProps = undefined;
  jest.spyOn(window, "alert").mockImplementation(() => {});
  jest.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

it("writes protocol updates in Unix seconds, consistent with campaign approval timestamps", async () => {
  jest.spyOn(Date, "now").mockReturnValue(1795161524143);
  mockUpdate.mockResolvedValueOnce(mockHash);
  await openConfirmation();
  fireEvent.click(screen.getByRole("button", { name: "Confirm & Update Protocol" }));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  expect(mockUpdate.mock.calls[0][0].last_updated).toBe(1795161524n);
});

it("blocks same-tick repeated confirmations and disables Save, Confirm, and Cancel while the update is pending", async () => {
  const pending = deferred(); mockUpdate.mockReturnValue(pending.promise);
  const save = await openConfirmation();
  const confirm = mockDialogProps!.onConfirm;
  act(() => { confirm(); confirm(); });
  expect(mockUpdate).toHaveBeenCalledTimes(1);
  expect(save).toBeDisabled();
  expect(screen.getByRole("button", { name: "Updating Protocol..." })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await act(async () => { pending.resolve(mockHash); });
  expect(window.alert).toHaveBeenCalledWith(expect.stringContaining(mockHash));
  expect(screen.queryByRole("button", { name: "Confirm & Update Protocol" })).not.toBeInTheDocument();
});

it("explains RBF conflicts without calling the grant failed and releases the UI lock after the request settles", async () => {
  const pending = deferred(); mockUpdate.mockReturnValue(pending.promise);
  const save = await openConfirmation();
  fireEvent.click(screen.getByRole("button", { name: "Confirm & Update Protocol" }));
  await act(async () => { pending.reject(new Error('PoolRejectedRBF: RBFRejected("Tx current fee is 3042; expect >= 5323 to replace old txs")')); });
  expect(mockUpdate).toHaveBeenCalledTimes(1);
  expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/Refresh protocol data and check the earlier transaction before signing again/));
  expect(window.alert).not.toHaveBeenCalledWith(expect.stringContaining("Failed to update protocol:"));
  expect(save).toBeEnabled();
  fireEvent.click(save);
  expect(screen.getByRole("button", { name: "Confirm & Update Protocol" })).toBeEnabled();
});

it("preserves ordinary error feedback and permits a later explicit confirmation", async () => {
  mockUpdate.mockRejectedValueOnce(new Error("Wallet request rejected"));
  const save = await openConfirmation();
  fireEvent.click(screen.getByRole("button", { name: "Confirm & Update Protocol" }));
  await waitFor(() => expect(window.alert).toHaveBeenCalledWith("Failed to update protocol: Wallet request rejected"));
  expect(save).toBeEnabled();
  fireEvent.click(save);
  mockUpdate.mockResolvedValueOnce(mockHash);
  fireEvent.click(screen.getByRole("button", { name: "Confirm & Update Protocol" }));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
});

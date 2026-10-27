import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DidBindingCard } from "./DidBindingCard";

const DID = "did:ckb:omdrzidnxy3lrdrwc6bo4sll6zljhuar";
const TX_HASH = `0x${"11".repeat(32)}`;

const mockOpen = jest.fn();
const mockListControlledDids = jest.fn();
const mockUpdateDidVerification = jest.fn();
const mockRefreshUserData = jest.fn();
const mockWaitTransaction = jest.fn();
let walletConnected = true;

const mockSigner = {
  getRecommendedAddressObj: jest.fn(async () => ({
    script: {
      codeHash: `0x${"22".repeat(32)}`,
      hashType: "type",
      args: "0x01",
    },
  })),
  client: { waitTransaction: mockWaitTransaction },
};

jest.mock("@ckb-ccc/connector-react", () => ({
  ccc: {
    useSigner: () => (walletConnected ? mockSigner : undefined),
    useCcc: () => ({ open: mockOpen }),
  },
}));

jest.mock("@/lib/providers/user-provider", () => ({
  useUser: () => ({
    userService: { updateDidVerification: mockUpdateDidVerification },
    refreshUserData: mockRefreshUserData,
  }),
}));

jest.mock("@/lib/vellum/dids", () => ({
  listControlledDids: (...args: unknown[]) => mockListControlledDids(...args),
  formatDid: (did: string) => `${did.slice(0, 16)}…${did.slice(-6)}`,
}));

beforeEach(() => {
  jest.clearAllMocks();
  walletConnected = true;
  mockListControlledDids.mockResolvedValue([
    { did: DID, displayName: "Vellum User" },
  ]);
  mockUpdateDidVerification.mockResolvedValue(TX_HASH);
  mockWaitTransaction.mockResolvedValue(undefined);
  mockRefreshUserData.mockResolvedValue(undefined);
});

test("asks the user to connect the controlling wallet", async () => {
  walletConnected = false;
  render(
    <DidBindingCard
      isVerified={false}
      isStatusLoading={false}
      onUpdated={jest.fn()}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
  expect(mockOpen).toHaveBeenCalledTimes(1);
  expect(mockListControlledDids).not.toHaveBeenCalled();
});

test("links the selected controlled DID and refreshes user state", async () => {
  const onUpdated = jest.fn(async () => undefined);
  render(
    <DidBindingCard
      isVerified={false}
      isStatusLoading={false}
      onUpdated={onUpdated}
    />,
  );

  expect(await screen.findByText("Vellum User")).not.toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Connect preferred DID" }),
  );

  await waitFor(() =>
    expect(mockUpdateDidVerification).toHaveBeenCalledWith({
      did: DID,
      displayName: "Vellum User",
    }),
  );
  await waitFor(() =>
    expect(mockWaitTransaction).toHaveBeenCalledWith(
      TX_HASH,
      0,
      5 * 60 * 1000,
      2000,
    ),
  );
  await waitFor(() => expect(mockRefreshUserData).toHaveBeenCalledTimes(1));
  expect(onUpdated).toHaveBeenCalledTimes(1);
  expect(
    screen.getByText("Preferred DID connected to your CKBoost profile."),
  ).not.toBeNull();
});

test("shows an empty state with a Vellum creation path", async () => {
  mockListControlledDids.mockResolvedValue([]);
  render(
    <DidBindingCard
      isVerified={false}
      isStatusLoading={false}
      onUpdated={jest.fn()}
    />,
  );

  const link = await screen.findByRole("link", { name: /Create a Vellum DID/ });
  expect(link.getAttribute("href")).toBe(
    "https://dashboard.usevellum.xyz/identity",
  );
});

test("shows the connected name and DID without reopening the selector", async () => {
  render(
    <DidBindingCard
      currentDid={{ did: DID, displayName: "Vellum User" }}
      isVerified
      isStatusLoading={false}
      onUpdated={jest.fn()}
    />,
  );

  expect(await screen.findByText("Vellum User")).not.toBeNull();
  expect(screen.getByLabelText(DID)).not.toBeNull();
  expect(screen.queryByLabelText("Preferred identity")).toBeNull();
  expect(screen.getByText("Connected")).not.toBeNull();
});

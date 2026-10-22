import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { PointsBalance } from "./points-balance";

const DID = "did:ckb:tlitp7j8exampleidentity";
const SECOND_DID = "did:ckb:tlitp7j8secondidentity";
const PROTOCOL_TYPE_HASH = `0x${"11".repeat(32)}`;
const LOCK_HASH = `0x${"22".repeat(32)}`;
const REWARD_TX_HASH = `0x${"33".repeat(32)}`;

const mockClaimPointsBatch = jest.fn();
const mockListControlledDids = jest.fn();
const mockRegisterQuestClaimIssuance = jest.fn();
const mockToast = jest.fn();

const mockLockScript = {
  args: "0x01",
  codeHash: `0x${"44".repeat(32)}`,
  hash: jest.fn(() => LOCK_HASH),
  hashType: "type",
};
const mockSigner = {
  getRecommendedAddress: jest.fn(async () => "ckt1-test-address"),
  getRecommendedAddressObj: jest.fn(async () => ({ script: mockLockScript })),
};
const mockClient = {};

jest.mock("@ckb-ccc/connector-react", () => ({
  ccc: {
    Script: {
      from: jest.fn((script) => ({
        ...script,
        hash: () => `0x${"55".repeat(32)}`,
      })),
    },
    hexFrom: jest.fn((value) => value),
    useCcc: () => ({ client: mockClient }),
    useSigner: () => mockSigner,
  },
}));

jest.mock(
  "ssri-ckboost",
  () => ({
    createScopedLogger: () => ({
      error: jest.fn(),
      warn: jest.fn(),
    }),
  }),
  { virtual: true },
);

jest.mock("@/lib/providers/protocol-provider", () => ({
  useProtocol: () => ({
    isAdmin: false,
    protocolCell: {
      cellOutput: { type: { hash: () => PROTOCOL_TYPE_HASH } },
    },
  }),
}));

jest.mock("@/lib/ckb/points-balance", () => ({
  fetchUserPointsBalance: jest.fn(),
  formatPointsBalance: (value: bigint) => value.toString(),
}));

jest.mock("@/lib/services/streak-bonus-service", () => ({
  StreakBonusService: jest.fn().mockImplementation(() => ({
    claim: jest.fn(),
    query: jest.fn(async () => null),
  })),
}));

jest.mock("@/lib/ckb/streak-bonus", () => ({
  buildStreakBonusTransaction: jest.fn(),
}));

jest.mock("@/lib/services/user-service", () => ({
  UserService: jest.fn().mockImplementation(() => ({
    claimClaimablePoolBatch: jest.fn(),
    claimPointsBatch: mockClaimPointsBatch,
  })),
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock("@/lib/ckb/deployment-manager", () => ({
  deploymentManager: {
    getContractCodeHash: jest.fn(() => `0x${"66".repeat(32)}`),
    getCurrentNetwork: jest.fn(() => "testnet"),
  },
}));

jest.mock("@/lib/ckb/claimable-pool", () => ({
  addClaimablePoolAssetCellDep: jest.fn(),
  emptyClaimablePointsSummary: jest.fn((claimantLockHash = LOCK_HASH) => ({
    cells: [],
    claimantLockHash,
    totalAmount: 0n,
  })),
  queryClaimablePointsPools: jest.fn(async () => ({
    cells: [{ amount: 100n, cell: { outPoint: { index: 0 } } }],
    claimantLockHash: LOCK_HASH,
    totalAmount: 100n,
  })),
  queryClaimableUdtPoolGroups: jest.fn(async () => []),
}));

jest.mock("@/lib/cache/query-cache", () => ({
  buildPointsBalanceCacheKey: jest.fn(() => "points-cache-key"),
  withPointsBalanceCache: jest.fn(async () => ({ value: 0n })),
}));

jest.mock("@/lib/pending-transactions", () => ({
  registerPendingTransaction: jest.fn(),
}));

jest.mock("@/lib/vellum/dids", () => ({
  listControlledDids: (...args: unknown[]) =>
    mockListControlledDids(...args),
}));

jest.mock("@/lib/vellum/quest-claim-queue", () => ({
  registerQuestClaimIssuance: (...args: unknown[]) =>
    mockRegisterQuestClaimIssuance(...args),
}));

async function openPortableClaimDialog() {
  render(<PointsBalance />);
  const claimButton = await screen.findByRole("button", {
    name: /100 claimable/i,
  });
  await waitFor(() =>
    expect((claimButton as HTMLButtonElement).disabled).toBe(false),
  );
  fireEvent.click(claimButton);
  return screen.findByRole("dialog", { name: "Portable quest claim" });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockClaimPointsBatch.mockResolvedValue(REWARD_TX_HASH);
  mockListControlledDids.mockResolvedValue([DID]);
});

test("a single discovered DID still requires portable claim consent", async () => {
  await openPortableClaimDialog();

  expect(screen.getByText(DID)).not.toBeNull();
  expect(screen.getByText(/public portable Claim Cell/)).not.toBeNull();
  expect(
    screen.getByRole("button", {
      name: "Claim rewards and issue portable claim",
    }),
  ).not.toBeNull();

  fireEvent.click(
    screen.getByRole("button", { name: "Claim rewards only" }),
  );

  await waitFor(() => expect(mockClaimPointsBatch).toHaveBeenCalledTimes(1));
  expect(mockRegisterQuestClaimIssuance).not.toHaveBeenCalled();
});

test("portable claim issuance starts only after the explicit issue action", async () => {
  await openPortableClaimDialog();

  fireEvent.click(
    screen.getByRole("button", {
      name: "Claim rewards and issue portable claim",
    }),
  );

  await waitFor(() =>
    expect(mockRegisterQuestClaimIssuance).toHaveBeenCalledWith(
      REWARD_TX_HASH,
      DID,
    ),
  );
});

test("multiple discovered DIDs still allow a rewards-only claim", async () => {
  mockListControlledDids.mockResolvedValue([DID, SECOND_DID]);
  await openPortableClaimDialog();

  fireEvent.click(
    screen.getByRole("button", { name: "Claim rewards only" }),
  );

  await waitFor(() => expect(mockClaimPointsBatch).toHaveBeenCalledTimes(1));
  expect(mockRegisterQuestClaimIssuance).not.toHaveBeenCalled();
});

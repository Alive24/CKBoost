import { ccc } from "@ckb-ccc/connector-react";
import { CampaignAdminService } from "@/lib/services/campaign-admin-service";

jest.mock("@ckb-ccc/connector-react", () => ({
  ccc: jest.requireActual("@ckb-ccc/core").ccc,
}));
jest.mock("../../../../packages/ssri-ckboost/dist/index.js", () => ({
  Campaign: class {},
  createScopedLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  assertActorNetCapacitySpend: jest.fn(async () => {}),
  guardPrivilegedActorSigner: (signer: unknown) => signer,
  retainOutputCapacityFloor: jest.fn(),
}));
jest.mock("../../../../packages/ssri-ckboost/dist/generated/index.js", () => ({ CampaignData: {}, ConnectedTypeID: {} }));
jest.mock("@/lib/ckb/user-cells", () => ({}));
jest.mock("@/lib/ckb/campaign-cells", () => ({}));
jest.mock("@/lib/ckb/deployment-manager", () => ({
  deploymentManager: { getCurrentNetwork: () => "testnet", getContractCodeHash: () => undefined },
}));
jest.mock("@/lib/services/udt-registry", () => ({ udtRegistry: {} }));
jest.mock("@/lib/ckb/transaction-wrapper", () => ({}));
jest.mock("@/lib/utils/api", () => ({ injectProxyAuthenticationCell: jest.fn(async () => {}) }));
jest.mock("@/lib/pending-transactions", () => ({ registerPendingTransaction: jest.fn() }));
jest.mock("@/lib/ckb/claimable-pool", () => ({ getClaimablePoolLockCodeHash: () => undefined }));

it("preserves every proxy-signed raw field while hydrating the local input cache", async () => {
  const hex = (byte: string) => `0x${byte.repeat(32)}` as ccc.Hex;
  const lock = ccc.Script.from({ codeHash: hex("11"), hashType: "type", args: "0x" });
  const type = ccc.Script.from({ codeHash: hex("22"), hashType: "type", args: "0x1234" });
  const campaign = ccc.Cell.from({
    outPoint: { txHash: hex("33"), index: 0 },
    cellOutput: { capacity: 500_00000000n, lock, type },
    outputData: "0xaabb",
  });
  const plain = ccc.Cell.from({
    outPoint: { txHash: hex("44"), index: 0 },
    cellOutput: { capacity: 1000_00000000n, lock },
    outputData: "0x",
  });
  const draft = ccc.Transaction.from({
    inputs: [{ previousOutput: campaign.outPoint }, { previousOutput: plain.outPoint, since: 5 }],
    outputs: [{ capacity: 500_00000000n, lock, type }],
    outputsData: ["0xaabb"],
  });
  jest.spyOn(draft, "completeInputsByCapacity").mockResolvedValue(0);
  jest.spyOn(draft, "completeFeeBy").mockResolvedValue([0, false]);

  // This is a valid over-minimum state capacity and an existing proxy witness.
  // Rebuilding typed outputs after the response used to shrink this capacity,
  // changing the raw hash and invalidating the proxy administrator's signature.
  const signed = ccc.Transaction.fromBytes(draft.toBytes());
  signed.outputs[0].capacity = 500_00000000n;
  signed.witnesses = ["0x123456", "0xabcd"];
  const signedRawHash = signed.hash();
  const signedRawBytes = ccc.hexFrom(signed.toBytes());
  const sendTransaction = jest.fn(async (_transaction: ccc.TransactionLike) => hex("55"));
  const signer = {
    getRecommendedAddressObj: async () => ({ script: lock }),
    client: {
      getCell: jest.fn(async (outPoint: ccc.OutPointLike) => outPoint.txHash === campaign.outPoint.txHash ? campaign : plain),
    },
    sendTransaction,
  } as unknown as ccc.Signer;
  const service = new CampaignAdminService(signer, hex("66"), hex("77"), type.codeHash, null);
  const internals = service as unknown as {
    buildApproveCompletionTransaction: () => Promise<ccc.Transaction>;
    ensureSignerPlainCkbInput: () => Promise<void>;
  };
  jest.spyOn(internals, "buildApproveCompletionTransaction").mockResolvedValue(draft);
  jest.spyOn(internals, "ensureSignerPlainCkbInput").mockResolvedValue();
  const previousFetch = global.fetch;
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ success: true, txHex: signedRawBytes }),
  })) as unknown as typeof fetch;
  try {
    await service.approveCompletionViaProxy(hex("88"), 0, [hex("99")]);
    const received = sendTransaction.mock.calls[0][0] as ccc.Transaction;
    expect(received.hash()).toBe(signedRawHash);
    expect(ccc.hexFrom(received.toBytes())).toBe(signedRawBytes);
    expect(received.outputs[0].capacity).toBe(500_00000000n);
    expect(received.witnesses).toEqual(signed.witnesses);
    expect(received.inputs[1].since).toBe(5n);
    expect(received.inputs[0].cellOutput).toBeDefined();
  } finally {
    global.fetch = previousFetch;
  }
});

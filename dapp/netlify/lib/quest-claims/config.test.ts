import {
  requiredRewardConfirmations,
  rpcUrl,
  trustedProtocolTypeHash,
} from "./config";

const PROTOCOL_TYPE_ENVIRONMENT = {
  NEXT_PUBLIC_PROTOCOL_TYPE_ARGS:
    "0x87539ca8578870addf52ba06937d0fc418eff542400a6a163c684acda54fe972",
  NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH:
    "0x53769be2ed1d09a9da7c1d71488347449bb76f1212068f7e366939d0d5fd59fa",
  NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE: "type",
};
const PROTOCOL_TYPE_HASH =
  "0x42d9ecee38e8f260d68fa90762048c6d07be12200a9e81e8521a904da2a96908";

describe("quest claim configuration", () => {
  test("uses the Testnet RPC and six confirmations by default", () => {
    expect(rpcUrl({})).toBe("https://testnet.ckb.dev/");
    expect(requiredRewardConfirmations({})).toBe(6);
  });

  test("accepts explicit HTTP RPC URLs without credentials", () => {
    expect(
      rpcUrl({ NEXT_PUBLIC_CKB_RPC_URL: "http://127.0.0.1:8114" }),
    ).toBe("http://127.0.0.1:8114/");
  });

  test.each([
    "file:///tmp/ckb.sock",
    "https://user:password@testnet.ckb.dev",
    "not a URL",
  ])("rejects an unsafe RPC URL: %s", (value) => {
    expect(() => rpcUrl({ NEXT_PUBLIC_CKB_RPC_URL: value })).toThrow(
      "invalid",
    );
  });

  test.each(["0", "1.5", "101", "not-a-number"])(
    "rejects an invalid confirmation count: %s",
    (value) => {
      expect(() =>
        requiredRewardConfirmations({
          CKBOOST_VELLUM_MIN_CONFIRMATIONS: value,
        }),
      ).toThrow("between 1 and 100");
    },
  );

  test("does not accept the previous confirmation variable name", () => {
    expect(
      requiredRewardConfirmations({ CKBOOST_REWARD_CONFIRMATIONS: "12" }),
    ).toBe(6);
  });

  test("derives the trusted protocol instance hash", () => {
    expect(trustedProtocolTypeHash(PROTOCOL_TYPE_ENVIRONMENT)).toBe(
      PROTOCOL_TYPE_HASH,
    );
  });

  test.each([
    {},
    {
      ...PROTOCOL_TYPE_ENVIRONMENT,
      NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH: "0x1234",
    },
    {
      ...PROTOCOL_TYPE_ENVIRONMENT,
      NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE: "invalid",
    },
    {
      ...PROTOCOL_TYPE_ENVIRONMENT,
      NEXT_PUBLIC_PROTOCOL_TYPE_ARGS: "0x123",
    },
  ])("rejects an invalid protocol Type Script: %#", (environment) => {
    expect(() => trustedProtocolTypeHash(environment)).toThrow(
      "protocol Type Script configuration is invalid",
    );
  });
});

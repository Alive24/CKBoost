import { requiredRewardConfirmations, rpcUrl } from "./config";

describe("quest claim configuration", () => {
  test("uses the Testnet RPC and six confirmations by default", () => {
    expect(rpcUrl({})).toBe("https://testnet.ckb.dev/");
    expect(requiredRewardConfirmations({})).toBe(6);
  });

  test("accepts explicit HTTP RPC URLs without credentials", () => {
    expect(rpcUrl({ CKB_RPC_URL: "http://127.0.0.1:8114" })).toBe(
      "http://127.0.0.1:8114/",
    );
  });

  test.each([
    "file:///tmp/ckb.sock",
    "https://user:password@testnet.ckb.dev",
    "not a URL",
  ])("rejects an unsafe RPC URL: %s", (value) => {
    expect(() => rpcUrl({ CKB_RPC_URL: value })).toThrow("invalid");
  });

  test.each(["0", "1.5", "101", "not-a-number"])(
    "rejects an invalid confirmation count: %s",
    (value) => {
      expect(() =>
        requiredRewardConfirmations({
          CKBOOST_REWARD_CONFIRMATIONS: value,
        }),
      ).toThrow("between 1 and 100");
    },
  );
});

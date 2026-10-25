jest.mock("@ckb-ccc/did-ckb", () => ({ resolveDidCkb: jest.fn() }));
jest.mock("@usevellum/sdk", () => ({ writeClaim: jest.fn() }), {
  virtual: true,
});
jest.mock("ethers", () => ({ Wallet: jest.fn() }));

import { issuerCredential } from "./issuer";

const PRIVATE_KEY = `0x${"11".repeat(32)}`;

describe("quest claim issuer configuration", () => {
  test("loads the Vellum-specific CKBoost issuer credential", () => {
    expect(
      issuerCredential({
        CKBOOST_VELLUM_ISSUER_EVM_PRIVATE_KEY: PRIVATE_KEY,
      }),
    ).toBe(PRIVATE_KEY);
  });

  test("does not accept the previous issuer variable name", () => {
    expect(() =>
      issuerCredential({ CKBOOST_ISSUER_EVM_PRIVATE_KEY: PRIVATE_KEY }),
    ).toThrow("not configured");
  });
});

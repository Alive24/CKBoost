const mockResolveDidCkb = jest.fn();

jest.mock("@ckb-ccc/did-ckb", () => ({
  resolveDidCkb: (...args: unknown[]) => mockResolveDidCkb(...args),
}));

jest.mock("@ckb-ccc/core", () => ({
  ccc: {
    Script: {
      from: (script: { id: string }) => ({
        ...script,
        eq: (other: { id: string }) => script.id === other.id,
      }),
    },
  },
}));

import { validateDidVerification } from "./did-verification";

const DID = "did:ckb:omdrzidnxy3lrdrwc6bo4sll6zljhuar";
const USER_LOCK = { id: "user-lock" };

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveDidCkb.mockResolvedValue({
    cell: { cellOutput: { lock: USER_LOCK } },
    data: {
      value: {
        document: {
          services: {
            profile: {
              type: "VellumProfile",
              displayName: "Vellum User",
            },
          },
        },
      },
    },
  });
});

test("accepts a live DID controlled by the CKBoost user lock", async () => {
  await expect(
    validateDidVerification({
      client: {} as never,
      userLock: USER_LOCK as never,
      data: { did: DID, displayName: "Vellum User" },
    }),
  ).resolves.toEqual({ did: DID, displayName: "Vellum User" });
});

test("rejects a DID controlled by another lock", async () => {
  mockResolveDidCkb.mockResolvedValueOnce({
    cell: { cellOutput: { lock: { id: "another-lock" } } },
    data: { value: { document: {} } },
  });

  await expect(
    validateDidVerification({
      client: {} as never,
      userLock: USER_LOCK as never,
      data: { did: DID },
    }),
  ).rejects.toThrow("not controlled by this CKBoost user");
});

test("rejects a stale or forged DID profile name", async () => {
  await expect(
    validateDidVerification({
      client: {} as never,
      userLock: USER_LOCK as never,
      data: { did: DID, displayName: "Different Name" },
    }),
  ).rejects.toThrow("does not match its live document");
});

test("rejects inactive and malformed DIDs", async () => {
  mockResolveDidCkb.mockResolvedValueOnce(undefined);
  await expect(
    validateDidVerification({
      client: {} as never,
      userLock: USER_LOCK as never,
      data: { did: DID },
    }),
  ).rejects.toThrow("not active");

  await expect(
    validateDidVerification({
      client: {} as never,
      userLock: USER_LOCK as never,
      data: { did: "did:example:invalid" },
    }),
  ).rejects.toThrow("malformed");
});

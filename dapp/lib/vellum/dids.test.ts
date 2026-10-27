const mockListDidCkbsByLock = jest.fn();

jest.mock("@ckb-ccc/core", () => ({
  ccc: {
    ClientPublicTestnet: jest.fn(() => ({})),
    Script: { from: jest.fn((value) => value) },
  },
}));

jest.mock("@ckb-ccc/did-ckb", () => ({
  listDidCkbsByLock: (...args: unknown[]) =>
    mockListDidCkbsByLock(...args),
}));

import { formatDid, listControlledDids } from "./dids";

const lock = {
  args: "0x01",
  codeHash: `0x${"11".repeat(32)}`,
  hashType: "type" as const,
};

test("returns canonical Vellum profile names with controlled DIDs", async () => {
  mockListDidCkbsByLock.mockResolvedValue([
    {
      did: "did:ckb:second",
      data: {
        value: {
          document: {
            services: {
              profile: {
                type: "VellumProfile",
                endpoint: "inline",
                displayName: "  Second Builder  ",
              },
            },
          },
        },
      },
    },
    {
      did: "did:ckb:first",
      data: { value: { document: {} } },
    },
  ]);

  await expect(listControlledDids(lock)).resolves.toEqual([
    { did: "did:ckb:first", displayName: undefined },
    { did: "did:ckb:second", displayName: "Second Builder" },
  ]);
});

test("ignores display names outside the Vellum profile service", async () => {
  mockListDidCkbsByLock.mockResolvedValue([
    {
      did: "did:ckb:example",
      data: {
        value: {
          document: {
            services: {
              profile: {
                type: "OtherProfile",
                displayName: "Not Vellum",
              },
            },
          },
        },
      },
    },
  ]);

  await expect(listControlledDids(lock)).resolves.toEqual([
    { did: "did:ckb:example", displayName: undefined },
  ]);
});

test("formats a DID without hiding its method", () => {
  expect(formatDid("did:ckb:omdrzidnxy3lrdrwc6bo4sll6zljhuar")).toBe(
    "did:ckb:omdrzidn…ljhuar",
  );
});

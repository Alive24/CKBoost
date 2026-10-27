import { ccc } from "@ckb-ccc/core";

import {
  decodeVerificationEntries,
  deriveVerificationFlags,
  getDidVerificationData,
  hasMatchingVerificationEntry,
  isTelegramBindingConsistent,
  normalizeDidVerificationData,
  upsertVerificationEntry,
} from "./verification-data";

const DID = "did:ckb:omdrzidnxy3lrdrwc6bo4sll6zljhuar";

test("decodes verification entries from on-chain bytes", () => {
  const stored = ccc.bytesFrom(
    JSON.stringify([
      { source: "telegram", data: { id: "42", hash: "proof" } },
      { source: "did", data: { did: DID, displayName: "Vellum User" } },
    ]),
    "utf8",
  );

  expect(decodeVerificationEntries(stored)).toEqual([
    { source: "telegram", data: { id: "42", hash: "proof" } },
    { source: "did", data: { did: DID, displayName: "Vellum User" } },
  ]);
  expect(getDidVerificationData(stored)).toEqual({
    did: DID,
    displayName: "Vellum User",
  });
  expect(deriveVerificationFlags(stored)).toBe(5);
});

test("replaces only the entry with the selected verification source", () => {
  const entries = [
    { source: "telegram" as const, data: { id: "42", hash: "proof" } },
    { source: "did" as const, data: { did: DID } },
  ];

  expect(
    upsertVerificationEntry(entries, {
      source: "did",
      data: { did: DID, displayName: "Updated Name" },
    }),
  ).toEqual([
    { source: "telegram", data: { id: "42", hash: "proof" } },
    { source: "did", data: { did: DID, displayName: "Updated Name" } },
  ]);
});

test("rejects malformed DID binding data", () => {
  expect(
    normalizeDidVerificationData({ did: "did:example:invalid" }),
  ).toBeNull();
  expect(
    normalizeDidVerificationData({ did: DID, displayName: 123 }),
  ).toBeNull();
  expect(normalizeDidVerificationData({ did: ` ${DID} ` })).toEqual({
    did: DID,
  });
});

test("ignores malformed and unsupported stored entries", () => {
  expect(
    decodeVerificationEntries(
      JSON.stringify([
        null,
        { source: "unknown", data: {} },
        { source: "did", data: "not-an-object" },
      ]),
    ),
  ).toEqual([]);
});

test("detects an unchanged verification entry", () => {
  const telegram = {
    source: "telegram" as const,
    data: { id: 42, username: "builder", hash: "signed" },
  };

  expect(hasMatchingVerificationEntry([telegram], telegram)).toBe(true);
  expect(
    hasMatchingVerificationEntry([telegram], {
      ...telegram,
      data: { ...telegram.data, username: "other" },
    }),
  ).toBe(false);
});

test("requires the stored Telegram entry to match the user chat ID", () => {
  const entry = {
    source: "telegram" as const,
    data: { id: "42", hash: "signed" },
  };

  expect(isTelegramBindingConsistent([entry], 42n)).toBe(true);
  expect(isTelegramBindingConsistent([entry], 7n)).toBe(false);
  expect(isTelegramBindingConsistent([], 0n)).toBe(true);
  expect(isTelegramBindingConsistent([], 42n)).toBe(false);
});

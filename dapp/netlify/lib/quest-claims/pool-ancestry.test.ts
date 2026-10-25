import {
  assertPoolContinuation,
  findParentPoolInputIndex,
} from "./pool-ancestry";

const POOL = "pool";
const OTHER = "other";

describe("claimable pool ancestry", () => {
  test("pairs a residual output with the same ordinal pool input", () => {
    expect(
      findParentPoolInputIndex({
        inputLockHashes: [OTHER, POOL, OTHER, POOL],
        outputIndex: 3,
        outputLockHashes: [POOL, OTHER, OTHER, POOL],
        poolLockHash: POOL,
      }),
    ).toBe(3);
  });

  test("recognizes a pool output with no parent as an origin", () => {
    expect(
      findParentPoolInputIndex({
        inputLockHashes: [OTHER],
        outputIndex: 1,
        outputLockHashes: [OTHER, POOL],
        poolLockHash: POOL,
      }),
    ).toBeUndefined();
  });

  test("rejects a malformed lock-group transition", () => {
    expect(() =>
      findParentPoolInputIndex({
        inputLockHashes: [POOL, POOL],
        outputIndex: 0,
        outputLockHashes: [POOL],
        poolLockHash: POOL,
      }),
    ).toThrow("cell count");
  });

  test("accepts only ordered entry removals with conserved amounts", () => {
    const previous = {
      entries: [
        { amount: 10n, claimantLockHash: "a" },
        { amount: 20n, claimantLockHash: "b" },
        { amount: 30n, claimantLockHash: "c" },
      ],
      remainingAmount: 60n,
    };

    expect(() =>
      assertPoolContinuation(previous, {
        entries: [
          { amount: 10n, claimantLockHash: "a" },
          { amount: 30n, claimantLockHash: "c" },
        ],
        remainingAmount: 40n,
      }),
    ).not.toThrow();
    expect(() =>
      assertPoolContinuation(previous, {
        entries: [
          { amount: 30n, claimantLockHash: "c" },
          { amount: 10n, claimantLockHash: "a" },
        ],
        remainingAmount: 40n,
      }),
    ).toThrow("entry-removal");
    expect(() =>
      assertPoolContinuation(previous, {
        entries: [{ amount: 10n, claimantLockHash: "a" }],
        remainingAmount: 11n,
      }),
    ).toThrow("inconsistent amounts");
  });
});

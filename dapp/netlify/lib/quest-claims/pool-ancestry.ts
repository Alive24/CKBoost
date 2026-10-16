export type ClaimablePoolState = {
  entries: Array<{
    amount: bigint;
    claimantLockHash: string;
  }>;
  remainingAmount: bigint;
};

export function findParentPoolInputIndex(params: {
  inputLockHashes: string[];
  outputIndex: number;
  outputLockHashes: string[];
  poolLockHash: string;
}): number | undefined {
  const inputIndexes = params.inputLockHashes
    .map((lockHash, index) => ({ index, lockHash }))
    .filter(({ lockHash }) => lockHash === params.poolLockHash)
    .map(({ index }) => index);
  const outputIndexes = params.outputLockHashes
    .map((lockHash, index) => ({ index, lockHash }))
    .filter(({ lockHash }) => lockHash === params.poolLockHash)
    .map(({ index }) => index);
  const outputOrdinal = outputIndexes.indexOf(params.outputIndex);

  if (outputOrdinal === -1) {
    throw new Error("Pool output is missing from its lock group.");
  }
  if (inputIndexes.length === 0) return undefined;
  if (inputIndexes.length !== outputIndexes.length) {
    throw new Error("Pool ancestry changed the lock-group cell count.");
  }
  return inputIndexes[outputOrdinal];
}

export function assertPoolContinuation(
  previous: ClaimablePoolState,
  next: ClaimablePoolState,
): void {
  const previousTotal = previous.entries.reduce(
    (total, entry) => total + entry.amount,
    0n,
  );
  const nextTotal = next.entries.reduce(
    (total, entry) => total + entry.amount,
    0n,
  );
  if (
    previous.entries.some((entry) => entry.amount <= 0n) ||
    next.entries.some((entry) => entry.amount <= 0n) ||
    previousTotal !== previous.remainingAmount ||
    nextTotal !== next.remainingAmount
  ) {
    throw new Error("Pool ancestry contains inconsistent amounts.");
  }

  let nextIndex = 0;
  let removedAmount = 0n;
  for (const entry of previous.entries) {
    const candidate = next.entries[nextIndex];
    if (
      candidate &&
      candidate.claimantLockHash === entry.claimantLockHash &&
      candidate.amount === entry.amount
    ) {
      nextIndex += 1;
    } else {
      removedAmount += entry.amount;
    }
  }

  if (
    nextIndex !== next.entries.length ||
    removedAmount <= 0n ||
    previous.remainingAmount - next.remainingAmount !== removedAmount
  ) {
    throw new Error("Pool ancestry is not an entry-removal transition.");
  }
}

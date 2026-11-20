import { createReviewReadSigner, withReviewDeadline } from "../review-request";
import type { ccc } from "@ckb-ccc/connector-react";

afterEach(() => jest.useRealTimers());

it("stops an expired contributor iterator before requesting another page", async () => {
  jest.useFakeTimers();
  let deliver!: (value: unknown) => void;
  const page = new Promise(resolve => { deliver = resolve; });
  const next = jest.fn().mockReturnValueOnce(page).mockResolvedValue({ done: true });
  const close = jest.fn(async () => ({ done: true }));
  const signer = { client: { findCells: () => ({ [Symbol.asyncIterator]: () => ({ next, return: close }) }) } } as unknown as ccc.Signer;
  const reading = withReviewDeadline(async active => {
    for await (const _cell of createReviewReadSigner(signer, active).client.findCells({} as never)) { /* next page */ }
  }, 30_000, "scan expired");
  const rejected = expect(reading).rejects.toThrow("scan expired");
  await jest.advanceTimersByTimeAsync(30_000);
  await rejected;
  deliver({ done: false, value: {} });
  await Promise.resolve();
  await Promise.resolve();
  expect(next).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});

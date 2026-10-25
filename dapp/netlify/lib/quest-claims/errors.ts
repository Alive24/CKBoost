export class QuestClaimError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

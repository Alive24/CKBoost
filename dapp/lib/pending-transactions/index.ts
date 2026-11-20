import { createScopedLogger } from "ssri-ckboost/logging";

export type PendingTransactionMetadata = {
  /**
   * Optional short description (eg. "Deploy Protocol") shown in the UI
   */
  label?: string;
  /**
   * Additional context describing which action triggered the tx
   */
  description?: string;
  /**
   * Location or module that initiated the transaction
   */
  context?: string;
};

type Registrar = (
  txHash: string,
  metadata?: PendingTransactionMetadata
) => void;

let registrar: Registrar | null = null;

const log = createScopedLogger("PendingTransactionRegistry");

/**
 * Register a transaction as pending in the global tracker.
 * Non-React modules can call this helper as soon as they get a tx hash.
 */
export function registerPendingTransaction(
  txHash: string,
  metadata?: PendingTransactionMetadata
) {
  if (!txHash) return;
  try {
    registrar?.(txHash, metadata);
  } catch (error) {
    log.warn("Unable to register pending transaction", { txHash, error });
  }
}

/**
 * The provider injects an implementation so non-React code can push events.
 */
export function setPendingTransactionRegistrar(fn: Registrar | null) {
  registrar = fn;
}


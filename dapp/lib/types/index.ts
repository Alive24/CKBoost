// UI-specific type extensions for CKBoost dApp
// This file contains ONLY UI-specific types that are not available from ssri-ckboost
// For blockchain types, import directly from ssri-ckboost/types in your files

// Transaction status for UI display
export interface TransactionStatus {
  hash: string
  status: 'pending' | 'confirmed' | 'failed'
  confirmations: number
  timestamp: number
}

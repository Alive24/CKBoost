/**
 * Transaction wrapper utilities for handling common transaction errors
 * Provides automatic retry with correct fees when minimum fee errors occur
 */

import { ccc } from "@ckb-ccc/core";

/**
 * Parse the required fee from a PoolRejectedTransactionByMinFeeRate error message
 * @param errorMessage The error message from the blockchain
 * @returns The required fee in shannons or null if not found
 */
function parseRequiredFee(errorMessage: string): bigint | null {
  // Pattern: "requiring a transaction fee of at least XXXX shannons"
  const match = errorMessage.match(/requiring a transaction fee of at least (\d+) shannons/);
  if (match && match[1]) {
    return BigInt(match[1]);
  }
  return null;
}

/**
 * Calculate the fee rate needed to achieve a specific total fee
 * @param tx The transaction
 * @param requiredFee The required total fee in shannons
 * @returns The fee rate to use
 */
function calculateFeeRate(tx: ccc.Transaction, requiredFee: bigint): bigint {
  // Get transaction size in bytes
  const txSize = tx.toBytes().length;
  
  // Convert to kiloweight (1 KW = 1000 bytes in CKB)
  // Add a small buffer (10%) to ensure we meet the minimum
  const feeRate = (requiredFee * 1100n * 1000n) / (BigInt(txSize) * 1000n);
  
  // Ensure minimum of 1000 shannons/KW
  return feeRate < 1000n ? 1000n : feeRate;
}

/**
 * Send a transaction with automatic fee retry
 * 
 * This wrapper will:
 * 1. Try to send the transaction
 * 2. If it fails due to low fee, parse the required fee
 * 3. Rebuild the transaction with the correct fee
 * 4. Ask the user to sign again
 * 
 * @param signer The signer to use
 * @param tx The transaction to send
 * @param buildTx Optional function to rebuild the transaction from scratch
 * @returns The transaction hash
 */
export async function sendTransactionWithFeeRetry(
  signer: ccc.Signer,
  tx: ccc.Transaction,
  buildTx?: () => Promise<ccc.Transaction>
): Promise<ccc.Hex> {
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    try {
      console.log(`Transaction send attempt ${attempts}/${maxAttempts}`);
      
      // Try to send the transaction
      const txHash = await signer.sendTransaction(tx);
      console.log("Transaction sent successfully! TxHash:", txHash);
      return txHash;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Transaction send attempt ${attempts} failed:`, errorMessage);
      
      // Check if it's a minimum fee error
      if (errorMessage.includes("PoolRejectedTransactionByMinFeeRate")) {
        console.log("Transaction rejected due to insufficient fee. Attempting to fix...");
        
        // Parse the required fee from the error message
        const requiredFee = parseRequiredFee(errorMessage);
        if (!requiredFee) {
          console.error("Could not parse required fee from error message");
          throw error;
        }
        
        console.log(`Required fee: ${requiredFee} shannons`);
        
        // If we have a buildTx function, rebuild from scratch
        if (buildTx) {
          console.log("Rebuilding transaction from scratch with correct fee...");
          tx = await buildTx();
        }
        
        // Calculate the fee rate needed
        const feeRate = calculateFeeRate(tx, requiredFee);
        console.log(`Calculated fee rate: ${feeRate} shannons/KW`);
        
        // Clear existing fee outputs and rebuild with new fee rate
        // Remove any existing change outputs (usually the last output if it goes back to sender)
        const senderAddress = await signer.getRecommendedAddressObj();
        const senderLockScript = senderAddress.script;
        
        // Filter out change outputs
        tx.outputs = tx.outputs.filter((output, index) => {
          // Keep all outputs except potential change outputs
          // Change outputs typically go back to the sender and have no type script
          const isChange = !output.type && 
            output.lock.codeHash === senderLockScript.codeHash &&
            output.lock.hashType === senderLockScript.hashType &&
            ccc.bytesFrom(output.lock.args) === ccc.bytesFrom(senderLockScript.args);
          
          if (isChange) {
            console.log(`Removing change output at index ${index}`);
          }
          return !isChange;
        });
        
        // Recalculate fees with the new rate
        await tx.completeFeeBy(signer, feeRate);
        
        console.log("Transaction rebuilt with new fee. Requesting signature again...");
        
        // Show user-friendly message
        if (attempts === 1) {
          console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  Transaction Fee Adjustment Required
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The blockchain requires a higher transaction fee.

Original fee was too low. Adjusting to meet minimum requirements...
Required minimum fee: ${requiredFee} shannons

Please sign the transaction again with the corrected fee.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          `);
        }
        
        // Continue to next attempt
        continue;
      }
      
      // If it's not a fee error, throw it
      throw error;
    }
  }
  
  throw new Error(`Failed to send transaction after ${maxAttempts} attempts`);
}

/**
 * Wrapper for protocol deployment with automatic fee retry
 */
export async function deployProtocolWithFeeRetry(
  signer: ccc.Signer,
  protocolDeployFn: () => Promise<ccc.Transaction>
): Promise<ccc.Hex> {
  // Build the initial transaction
  const tx = await protocolDeployFn();
  
  // Send with automatic retry
  return sendTransactionWithFeeRetry(signer, tx, protocolDeployFn);
}

/**
 * Wrapper for any transaction operation with automatic fee retry
 * 
 * Usage:
 * ```typescript
 * const txHash = await executeTransactionWithFeeRetry(
 *   signer,
 *   async () => {
 *     // Build your transaction here
 *     const tx = new ccc.Transaction();
 *     // ... add inputs, outputs, etc ...
 *     await tx.completeInputsByCapacity(signer);
 *     await tx.completeFeeBy(signer);
 *     return tx;
 *   }
 * );
 * ```
 */
export async function executeTransactionWithFeeRetry(
  signer: ccc.Signer,
  buildTx: () => Promise<ccc.Transaction>
): Promise<ccc.Hex> {
  // Build the initial transaction
  const tx = await buildTx();
  
  // Send with automatic retry
  return sendTransactionWithFeeRetry(signer, tx, buildTx);
}

/**
 * Simple wrapper for existing transactions
 * Just replaces signer.sendTransaction with automatic retry
 */
export async function sendTransaction(
  signer: ccc.Signer,
  tx: ccc.Transaction
): Promise<ccc.Hex> {
  return sendTransactionWithFeeRetry(signer, tx);
}
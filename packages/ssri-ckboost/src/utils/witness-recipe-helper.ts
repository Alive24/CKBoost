import { ccc } from '@ckb-ccc/core';

/**
 * Helper functions for working with TransactionRecipe in WitnessArgs
 * 
 * According to CKB convention:
 * - lock: Used by the lock script (typically for signatures)
 * - input_type: Used by the input's type script
 * - output_type: Used by the output's type script
 * 
 * TransactionRecipe is stored in the output_type field by ckb_deterministic contracts.
 */

/**
 * Extracts TransactionRecipe from WitnessArgs output_type field
 */
export function extractRecipeFromWitnessArgs(
  witnessArgs: ccc.WitnessArgs
): ccc.Hex | undefined {
  return witnessArgs.outputType;
}

/**
 * Checks if a witness contains a TransactionRecipe
 */
export function hasTransactionRecipe(witness: ccc.HexLike): boolean {
  try {
    const witnessArgs = ccc.WitnessArgs.fromBytes(witness);
    return !!(witnessArgs.outputType && witnessArgs.outputType !== '0x');
  } catch {
    return false;
  }
}

/**
 * Finds the witness index that contains a TransactionRecipe
 */
export function findRecipeWitnessIndex(witnesses: ccc.HexLike[]): number {
  for (let i = 0; i < witnesses.length; i++) {
    if (hasTransactionRecipe(witnesses[i])) {
      return i;
    }
  }
  return -1;
}

/**
 * Demonstrates the witness structure
 */
export function explainWitnessArgsUsage(): void {
  console.log(`
=== WitnessArgs Structure and TransactionRecipe ===

WitnessArgs is a Molecule table with 3 fields:
1. lock (BytesOpt): Used by lock scripts for signatures
2. input_type (BytesOpt): Used by input's type script  
3. output_type (BytesOpt): Used by output's type script

TransactionRecipe Storage:
- Stored in output_type field by ckb_deterministic contracts
- Preserved automatically by completeFeeBy
- Does not interfere with lock script signatures

Example WitnessArgs with recipe:
{
  lock: "0x<65-byte-signature>",     // Filled by completeFeeBy
  input_type: null,                  // Usually not used
  output_type: "0x<recipe_bytes>"    // TransactionRecipe from contract
}

The contract (via SSRI) generates this structure automatically.
No special handling needed when using completeFeeBy!
  `);
}
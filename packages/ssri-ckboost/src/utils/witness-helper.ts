import { ccc } from '@ckb-ccc/core';

/**
 * Helper functions for working with WitnessArgs and TransactionRecipe
 */

/**
 * Checks if a witness is a standard WitnessArgs
 */
export function isStandardWitness(witness: ccc.HexLike): boolean {
  try {
    ccc.WitnessArgs.fromBytes(witness);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts TransactionRecipe from witness
 * Following the standard: WitnessArgs -> output_type -> TransactionRecipe
 */
export function extractRecipeFromWitness(witness: ccc.HexLike): ccc.Hex | null {
  try {
    // Parse as WitnessArgs
    const witnessArgs = ccc.WitnessArgs.fromBytes(witness);
    
    // Check if output_type field contains data
    if (witnessArgs.outputType && witnessArgs.outputType !== '0x') {
      // Return the recipe data from output_type field
      return witnessArgs.outputType;
    }
    
    return null;
  } catch (e) {
    // Not a standard WitnessArgs
    return null;
  }
}

/**
 * Debug helper to analyze witness structure
 */
export function analyzeWitness(witness: ccc.HexLike): void {
  const bytes = ccc.bytesFrom(witness);
  console.log('\n=== Witness Analysis ===');
  console.log('Hex:', ccc.hexFrom(bytes));
  console.log('Length:', bytes.length, 'bytes');
  
  try {
    // Try standard WitnessArgs
    const witnessArgs = ccc.WitnessArgs.fromBytes(witness);
    console.log('Type: Standard WitnessArgs');
    console.log('Fields:');
    console.log('  lock:', witnessArgs.lock || '(empty)');
    console.log('  inputType:', witnessArgs.inputType || '(empty)');
    console.log('  outputType:', witnessArgs.outputType || '(empty)');
    
    // If output_type contains recipe, try to decode it
    if (witnessArgs.outputType && witnessArgs.outputType !== '0x') {
      console.log('  outputType contains TransactionRecipe');
      try {
        // The recipe is molecule-encoded, but we can show its hex
        console.log('  Recipe hex:', witnessArgs.outputType);
      } catch {}
    }
  } catch (e) {
    console.log('Type: Not a standard WitnessArgs');
    console.log('Error:', e);
  }
  console.log('===================\n');
}
// Address utilities for CKB addresses using CCC library
import { ccc } from "@ckb-ccc/connector-react"

/**
 * Compute lock hash from CKB address using CCC library
 * 
 * Example usage:
 * ```typescript
 * const address = "ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqq9zuyhnp0wmjejcpznmn7srdduvxa5r4xgr7wmxq"
 * const lockHash = await computeLockHashFromAddress(address)
 * console.log(lockHash) // "608e6846ba5e83c969aa93349551db03fd450b92dfd6e1ed55970fa5f4635b6a"
 * ```
 * 
 * @param address - CKB address (testnet starts with 'ckt', mainnet starts with 'ckb')
 * @returns 64-character hex lock hash (without 0x prefix)
 */
export async function computeLockHashFromAddress(address: string): Promise<string> {
  try {
    // Create a client to parse the address
    const client = new ccc.ClientPublicTestnet()
    
    // Parse the address to get the Address object
    const addr = await ccc.Address.fromString(address, client)
    
    // Get the script from the address (this is the lock script)
    const script = addr.script
    
    // Compute the lock hash from the script
    const lockHash = script.hash()
    
    // Return without 0x prefix (just the 64-character hex)
    return lockHash.slice(2)
  } catch (error) {
    console.error("Failed to compute lock hash from address:", error)
    throw new Error(`Invalid CKB address or failed to compute lock hash: ${error}`)
  }
}

/**
 * Compute lock hash with 0x prefix
 * @param address - CKB address
 * @returns Lock hash with 0x prefix
 */
export async function computeLockHashWithPrefix(address: string): Promise<string> {
  const hash = await computeLockHashFromAddress(address)
  return `0x${hash}`
}

/**
 * Validate CKB address format
 * @param address - CKB address to validate
 * @returns true if valid, false otherwise
 */
export function validateCKBAddress(address: string): boolean {
  try {
    // Check basic format
    if (!address || typeof address !== 'string') {
      return false
    }
    
    // CKB addresses should start with 'ckb' (mainnet) or 'ckt' (testnet)
    if (!address.startsWith('ckb') && !address.startsWith('ckt')) {
      return false
    }
    
    // Basic length check - CKB addresses are typically 95+ characters
    if (address.length < 42) {
      return false
    }
    
    return true
  } catch {
    return false
  }
}

/**
 * Format address for display (short form)
 * @param address - Full CKB address
 * @returns Shortened address (first 6 + ... + last 4 characters)
 */
export function formatAddressForDisplay(address: string): string {
  if (!address || address.length < 10) {
    return address
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}
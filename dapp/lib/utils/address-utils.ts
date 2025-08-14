import { ccc } from "@ckb-ccc/core"

/**
 * Convert a CKB address to a lock hash
 */
export async function addressToLockHash(address: string, client: ccc.Client): Promise<string> {
  try {
    const addr = await ccc.Address.fromString(address, client)
    const script = addr.script
    return script.hash()
  } catch (error) {
    console.error("Failed to convert address to lock hash:", error)
    throw new Error("Invalid CKB address")
  }
}

/**
 * Convert a lock script to an address
 */
export async function lockScriptToAddress(script: ccc.Script, client: ccc.Client): Promise<string> {
  const address = await ccc.Address.fromScript(script, client)
  return address.toString()
}

/**
 * Validate if a string is a valid CKB address
 */
export async function isValidAddress(address: string, client: ccc.Client): Promise<boolean> {
  try {
    await ccc.Address.fromString(address, client)
    return true
  } catch {
    return false
  }
}

/**
 * Compute lock hash from CKB address
 */
export async function computeLockHashFromAddress(address: string): Promise<string> {
  const client = new ccc.ClientPublicTestnet()
  try {
    const addr = await ccc.Address.fromString(address, client)
    const lockScript = addr.script
    return lockScript.hash()
  } catch (error) {
    throw new Error(`Invalid CKB address: ${error}`)
  }
}

/**
 * Compute lock hash with 0x prefix
 */
export async function computeLockHashWithPrefix(address: string): Promise<string> {
  const hash = await computeLockHashFromAddress(address)
  return hash.startsWith('0x') ? hash : `0x${hash}`
}

/**
 * Validate CKB address format
 */
export async function validateCKBAddress(address: string): Promise<boolean> {
  if (!address || address.length < 40) return false
  const client = new ccc.ClientPublicTestnet()
  return await isValidAddress(address, client)
}

/**
 * Format address for display (truncate middle)
 */
export function formatAddressForDisplay(address: string, length = 10): string {
  if (!address || address.length <= length * 2) return address
  return `${address.slice(0, length)}...${address.slice(-length)}`
}
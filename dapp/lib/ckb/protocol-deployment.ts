// Protocol Cell Deployment - Deploy new protocol cell to CKB blockchain
// This file handles deploying a new protocol cell when none exists

import { ccc } from "@ckb-ccc/connector-react"
import { SerializeProtocolData } from "../generated"
// Import type definitions for better TypeScript support
// Note: The generated file uses plain objects that match these type shapes
import type { ProtocolDataType } from "../types/protocol"

// Helper function to convert number to bytes
function numToBytes(num: number, length: number): Uint8Array {
  const buffer = new ArrayBuffer(length)
  const view = new DataView(buffer)
  
  if (length === 8) {
    // For 64-bit numbers, use BigInt
    view.setBigUint64(0, BigInt(num), true) // little-endian
  } else if (length === 4) {
    view.setUint32(0, num, true) // little-endian
  } else {
    throw new Error(`Unsupported byte length: ${length}`)
  }
  
  return new Uint8Array(buffer)
}

export interface DeployProtocolCellParams {
  // Initial protocol configuration
  adminLockHashes: string[]
  
  // Script code hashes for the protocol
  scriptCodeHashes: {
    ckbBoostProtocolTypeCodeHash: string
    ckbBoostProtocolLockCodeHash: string
    ckbBoostCampaignTypeCodeHash: string
    ckbBoostCampaignLockCodeHash: string
    ckbBoostUserTypeCodeHash: string
  }
  
  // Initial tipping configuration
  tippingConfig: {
    approvalRequirementThresholds: string[]
    expirationDuration: number
  }
  
  // Optional initial endorsers
  initialEndorsers?: Array<{
    endorserLockHash: string
    endorserName: string
    endorserDescription: string
  }>
}

export interface DeploymentResult {
  txHash: string
  protocolTypeScript: {
    codeHash: string
    hashType: "type" | "data" | "data1"
    args: string
  }
  protocolCellOutPoint: {
    txHash: string
    index: number
  }
}

/**
 * Check if protocol type script is configured in environment
 */
export function isProtocolConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH
}

/**
 * Get protocol deployment template with sensible defaults
 */
export function getProtocolDeploymentTemplate(): DeployProtocolCellParams {
  return {
    adminLockHashes: [], // To be filled by user's lock hash
    scriptCodeHashes: {
      // These would need to be replaced with actual deployed script code hashes
      ckbBoostProtocolTypeCodeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      ckbBoostProtocolLockCodeHash: "0x0000000000000000000000000000000000000000000000000000000000000000", 
      ckbBoostCampaignTypeCodeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      ckbBoostCampaignLockCodeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      ckbBoostUserTypeCodeHash: "0x0000000000000000000000000000000000000000000000000000000000000000"
    },
    tippingConfig: {
      approvalRequirementThresholds: ["10000", "50000", "100000"], // 0.1, 0.5, 1 CKB
      expirationDuration: 7 * 24 * 60 * 60 // 7 days in seconds
    },
    initialEndorsers: []
  }
}

/**
 * Generate initial protocol data for deployment
 */
function generateInitialProtocolData(params: DeployProtocolCellParams): ProtocolDataType {
  // Convert string thresholds to Uint128 ArrayBuffers
  const thresholds = params.tippingConfig.approvalRequirementThresholds.map(threshold => {
    const value = BigInt(threshold)
    const buffer = new ArrayBuffer(16) // 128 bits = 16 bytes
    const view = new DataView(buffer)
    // Write as little-endian
    view.setBigUint64(0, value & BigInt('0xFFFFFFFFFFFFFFFF'), true)
    view.setBigUint64(8, (value >> BigInt(64)) & BigInt('0xFFFFFFFFFFFFFFFF'), true)
    return buffer
  })

  // Convert admin lock hashes to Byte32 ArrayBuffers
  const adminHashes = params.adminLockHashes.map(hash => {
    // Remove 0x prefix if present
    const cleanHash = hash.startsWith('0x') ? hash.slice(2) : hash
    const buffer = new ArrayBuffer(32)
    const view = new Uint8Array(buffer)
    for (let i = 0; i < 32; i++) {
      view[i] = parseInt(cleanHash.substring(i * 2, i * 2 + 2), 16)
    }
    return buffer
  })

  // Convert script code hashes to Byte32 ArrayBuffers
  const convertHashToBytes = (hash: string): ArrayBuffer => {
    const cleanHash = hash.startsWith('0x') ? hash.slice(2) : hash
    const buffer = new ArrayBuffer(32)
    const view = new Uint8Array(buffer)
    for (let i = 0; i < 32; i++) {
      view[i] = parseInt(cleanHash.substring(i * 2, i * 2 + 2), 16)
    }
    return buffer
  }

  // Convert endorser data
  const endorsers = (params.initialEndorsers || []).map(endorser => ({
    endorser_lock_hash: convertHashToBytes(endorser.endorserLockHash),
    endorser_name: new TextEncoder().encode(endorser.endorserName).buffer,
    endorser_description: new TextEncoder().encode(endorser.endorserDescription).buffer
  }))

  const protocolData: ProtocolDataType = {
    campaigns_approved: [],
    tipping_proposals: [],
    tipping_config: {
      approval_requirement_thresholds: thresholds,
      expiration_duration: numToBytes(params.tippingConfig.expirationDuration, 8).buffer
    },
    endorsers_whitelist: endorsers,
    last_updated: numToBytes(Date.now(), 8).buffer,
    protocol_config: {
      admin_lock_hash_vec: adminHashes,
      script_code_hashes: {
        ckb_boost_protocol_type_code_hash: convertHashToBytes(params.scriptCodeHashes.ckbBoostProtocolTypeCodeHash),
        ckb_boost_protocol_lock_code_hash: convertHashToBytes(params.scriptCodeHashes.ckbBoostProtocolLockCodeHash),
        ckb_boost_campaign_type_code_hash: convertHashToBytes(params.scriptCodeHashes.ckbBoostCampaignTypeCodeHash),
        ckb_boost_campaign_lock_code_hash: convertHashToBytes(params.scriptCodeHashes.ckbBoostCampaignLockCodeHash),
        ckb_boost_user_type_code_hash: convertHashToBytes(params.scriptCodeHashes.ckbBoostUserTypeCodeHash),
      }
    }
  }

  return protocolData
}

/**
 * Deploy a new protocol cell to the CKB blockchain
 * @param signer - CCC signer instance
 * @param params - Protocol deployment parameters
 * @returns Deployment result with transaction hash and cell info
 */
export async function deployProtocolCell(
  signer: ccc.Signer,
  params: DeployProtocolCellParams
): Promise<DeploymentResult> {
  try {
    // Validate parameters
    if (!params.adminLockHashes || params.adminLockHashes.length === 0) {
      throw new Error("At least one admin lock hash is required")
    }

    // Generate initial protocol data
    const protocolData = generateInitialProtocolData(params)
    
    // Serialize protocol data using generated Molecule code
    const protocolDataBytes = SerializeProtocolData(protocolData)
    
    // Create protocol type script
    const protocolTypeScript = {
      codeHash: params.scriptCodeHashes.ckbBoostProtocolTypeCodeHash,
      hashType: "type" as const,
      args: "0x" // Could be derived from admin lock hash or random
    }
    
    // Get deployer's address and script
    const deployerAddress = await signer.getRecommendedAddress()
    const deployerScript = (await ccc.Address.fromString(deployerAddress, signer.client)).script
    
    // Calculate minimum capacity needed for the cell
    // Base capacity (61 CKB) + data capacity + type script capacity
    const dataCapacity = ccc.fixedPointFrom(protocolDataBytes.byteLength.toString())
    const baseCapacity = ccc.fixedPointFrom("61") // Minimum cell capacity
    const minCapacity = baseCapacity + dataCapacity + ccc.fixedPointFrom("1") // Extra buffer
    
    // Build deployment transaction
    const tx = ccc.Transaction.from({
      inputs: [],
      outputs: [
        {
          capacity: ccc.fixedPointToString(minCapacity),
          lock: deployerScript,
          type: protocolTypeScript
        }
      ],
      outputsData: ["0x" + Array.from(new Uint8Array(protocolDataBytes)).map(b => b.toString(16).padStart(2, '0')).join('')],
      cellDeps: [
        // TODO: Add necessary cell deps for protocol scripts when available
      ],
      headerDeps: [],
      witnesses: []
    })
    
    // Complete transaction with inputs and fees
    await tx.completeInputsByCapacity(signer)
    await tx.completeFeeBy(signer, 1000) // 1000 shannons/byte fee rate
    
    // Send transaction
    const txHash = await signer.sendTransaction(tx)
    
    return {
      txHash,
      protocolTypeScript,
      protocolCellOutPoint: {
        txHash,
        index: 0 // Protocol cell is the first output
      }
    }
    
  } catch (error) {
    console.error("Failed to deploy protocol cell:", error)
    throw error
  }
}

/**
 * Generate environment configuration for deployed protocol
 */
export function generateEnvConfig(result: DeploymentResult): string {
  return `# Generated CKBoost Protocol Configuration
# Add these to your .env file

NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH=${result.protocolTypeScript.codeHash}
NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE=${result.protocolTypeScript.hashType}
NEXT_PUBLIC_PROTOCOL_TYPE_ARGS=${result.protocolTypeScript.args}

# Protocol Cell Information (for reference)
# Transaction: ${result.txHash}
# Cell OutPoint: ${result.protocolCellOutPoint.txHash}:${result.protocolCellOutPoint.index}
`
}

/**
 * Validate protocol deployment parameters
 */
export function validateDeploymentParams(params: DeployProtocolCellParams): string[] {
  const errors: string[] = []
  
  if (!params.adminLockHashes || params.adminLockHashes.length === 0) {
    errors.push("At least one admin lock hash is required")
  }
  
  params.adminLockHashes.forEach((hash, index) => {
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      errors.push(`Admin lock hash ${index + 1} is not a valid 32-byte hex string`)
    }
  })
  
  // Validate script code hashes
  const scriptFields = [
    'ckbBoostProtocolTypeCodeHash',
    'ckbBoostProtocolLockCodeHash', 
    'ckbBoostCampaignTypeCodeHash',
    'ckbBoostCampaignLockCodeHash',
    'ckbBoostUserTypeCodeHash'
  ] as const
  
  scriptFields.forEach(field => {
    const hash = params.scriptCodeHashes[field]
    if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) {
      errors.push(`${field} is not a valid 32-byte hex string`)
    }
  })
  
  // Validate tipping config
  if (!params.tippingConfig.approvalRequirementThresholds || params.tippingConfig.approvalRequirementThresholds.length === 0) {
    errors.push("At least one approval requirement threshold is required")
  }
  
  params.tippingConfig.approvalRequirementThresholds.forEach((threshold, index) => {
    if (!/^\d+$/.test(threshold)) {
      errors.push(`Approval threshold ${index + 1} must be a valid number`)
    }
  })
  
  if (params.tippingConfig.expirationDuration < 3600) {
    errors.push("Expiration duration must be at least 1 hour (3600 seconds)")
  }
  
  if (params.tippingConfig.expirationDuration > 30 * 24 * 60 * 60) {
    errors.push("Expiration duration must be at most 30 days (2592000 seconds)")
  }
  
  return errors
}
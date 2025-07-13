// Protocol Cell Deployment - Deploy new protocol cell to CKB blockchain
// This file handles deploying a new protocol cell when none exists

import { ccc } from "@ckb-ccc/connector-react"
import { ProtocolData } from "../types/protocol"

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
function generateInitialProtocolData(params: DeployProtocolCellParams): ProtocolData {
  return {
    campaignsApproved: [],
    tippingProposals: [],
    tippingConfig: params.tippingConfig,
    endorsersWhitelist: params.initialEndorsers || [],
    lastUpdated: Date.now(),
    protocolConfig: {
      adminLockHashVec: params.adminLockHashes,
      scriptCodeHashes: params.scriptCodeHashes
    }
  }
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
    
    // TODO: Implement actual Molecule serialization when generated code is available
    // For now, this would need to be replaced with real Molecule serialization
    console.warn("Protocol deployment requires Molecule serialization implementation")
    throw new Error("Protocol deployment not yet implemented - requires Molecule code generation")
    
    // The actual implementation would look like this:
    /*
    const protocolDataBytes = generateProtocolData(protocolData)
    
    // Create protocol type script (this would need to be the actual protocol type script)
    const protocolTypeScript = {
      codeHash: params.scriptCodeHashes.ckbBoostProtocolTypeCodeHash,
      hashType: "type" as const,
      args: "0x" // Could be derived from admin lock hash or random
    }
    
    // Calculate minimum capacity needed for the cell
    const minCapacity = calculateMinCapacity(protocolDataBytes, protocolTypeScript)
    
    // Build deployment transaction
    const tx = ccc.Transaction.from({
      inputs: [],
      outputs: [
        {
          capacity: minCapacity.toString(),
          lock: await signer.getAddressObj().script, // Use deployer's lock
          type: protocolTypeScript
        }
      ],
      outputsData: [protocolDataBytes],
      cellDeps: [
        // Add necessary cell deps for protocol scripts
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
    */
    
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
// Protocol Cell Deployment - Deploy new protocol cell to CKB blockchain
// This file handles deploying a new protocol cell when none exists

import { ccc } from "@ckb-ccc/connector-react"
import { SerializeProtocolData, types } from "ssri-ckboost"
import { deploymentManager, DeploymentManager } from "./deployment-manager"

// Utility function to safely stringify objects with BigInt values
function safeStringify(obj: any, space?: number): string {
  return JSON.stringify(obj, (key, value) => 
    typeof value === 'bigint' ? value.toString() : value, space)
}

/**
 * Get the protocol type code cell outpoint from deployment information
 * @returns The outpoint of the cell containing the protocol code or null
 */
function getProtocolTypeCodeOutPoint(): { outPoint: { txHash: string; index: number } } | null {
  try {
    // Get current network
    const network = DeploymentManager.getCurrentNetwork()
    
    // Get deployment info from deployment manager
    const outPoint = deploymentManager.getContractOutPoint(network, 'protocolType')
    
    if (!outPoint) {
      throw new Error(
        `Protocol type contract not found in deployments.json for ${network}. ` +
        `Please ensure the contract is deployed and recorded in deployments.json`
      )
    }
    
    console.log(`Using protocol type code cell from deployments.json:`, outPoint)
    
    return { outPoint }
  } catch (error) {
    console.error("Failed to get protocol type code outpoint:", error)
    return null
  }
}

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
 * Check protocol configuration status
 * @returns 'none' | 'partial' | 'complete'
 */
export function getProtocolConfigStatus(): 'none' | 'partial' | 'complete' {
  // First check if protocol type contract is deployed
  const network = DeploymentManager.getCurrentNetwork()
  const protocolTypeDeployment = deploymentManager.getCurrentDeployment(network, 'protocolType')
  
  if (!protocolTypeDeployment) {
    return 'none' // No protocol contract deployed
  }
  
  // Then check if protocol cell exists (via args)
  const args = process.env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS
  
  if (!args || args === '') {
    return 'partial' // Protocol contract deployed but no protocol cell
  }
  
  return 'complete' // Both protocol contract and cell are configured
}

/**
 * Get protocol deployment template with sensible defaults
 */
export function getProtocolDeploymentTemplate(): DeployProtocolCellParams {
  return {
    adminLockHashes: [], // To be filled by user's lock hash
    scriptCodeHashes: {
      // These would need to be replaced with actual deployed script code hashes
      ckbBoostProtocolTypeCodeHash: (() => {
        const network = DeploymentManager.getCurrentNetwork()
        const deployment = deploymentManager.getCurrentDeployment(network, 'protocolType')
        return deployment?.codeHash || "0x0000000000000000000000000000000000000000000000000000000000000000"
      })(),
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
function generateInitialProtocolData(params: DeployProtocolCellParams): types.ProtocolDataType {
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
    endorser_name: new TextEncoder().encode(endorser.endorserName).buffer as ArrayBuffer,
    endorser_description: new TextEncoder().encode(endorser.endorserDescription).buffer as ArrayBuffer
  }))

  const protocolData: types.ProtocolDataType = {
    campaigns_approved: [],
    tipping_proposals: [],
    tipping_config: {
      approval_requirement_thresholds: thresholds,
      expiration_duration: numToBytes(params.tippingConfig.expirationDuration, 8).buffer as ArrayBuffer
    },
    endorsers_whitelist: endorsers,
    last_updated: numToBytes(Date.now(), 8).buffer as ArrayBuffer,
    protocol_config: {
      admin_lock_hash_vec: adminHashes,
      script_code_hashes: {
        ckb_boost_protocol_type_code_hash: convertHashToBytes(params.scriptCodeHashes.ckbBoostProtocolTypeCodeHash),
        ckb_boost_protocol_lock_code_hash: convertHashToBytes(params.scriptCodeHashes.ckbBoostProtocolLockCodeHash),
        ckb_boost_campaign_type_code_hash: convertHashToBytes(params.scriptCodeHashes.ckbBoostCampaignTypeCodeHash),
        ckb_boost_campaign_lock_code_hash: convertHashToBytes(params.scriptCodeHashes.ckbBoostCampaignLockCodeHash),
        ckb_boost_user_type_code_hash: convertHashToBytes(params.scriptCodeHashes.ckbBoostUserTypeCodeHash),
        accepted_udt_type_code_hashes: [],
        accepted_dob_type_code_hashes: []
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
    
    // Get protocol type code hash from deployments.json
    const network = DeploymentManager.getCurrentNetwork()
    const protocolTypeDeployment = deploymentManager.getCurrentDeployment(network, 'protocolType')
    
    if (!protocolTypeDeployment) {
      throw new Error("Protocol type contract not found in deployments.json. Deploy the protocol contract first.")
    }
    
    const protocolTypeCodeHash = protocolTypeDeployment.codeHash
    
    // Use Type ID system script
    const typeIdScript = await signer.client.getKnownScript(ccc.KnownScript.TypeId)
    if (!typeIdScript) {
      throw new Error("Type ID system script not found")
    }
    
    // Create type script using Type ID
    const protocolTypeScript = {
      codeHash: typeIdScript.codeHash,
      hashType: typeIdScript.hashType,
      args: "0x" // Will be calculated
    }
    
    // Get deployer's address and script
    const deployerAddress = await signer.getRecommendedAddress()
    const deployerScript = (await ccc.Address.fromString(deployerAddress, signer.client)).script
    
    // Get the outpoint of the cell containing the protocol type script code
    // We need to add it as a cell dependency for the type script to be available
    const protocolTypeCodeCell = await getProtocolTypeCodeOutPoint()
    if (!protocolTypeCodeCell) {
      throw new Error("Protocol type contract code cell not found. Make sure the protocol contract is deployed and deployment information is available.")
    }
    
    // Calculate required capacity for the protocol cell
    // CKB cell structure overhead:
    // - capacity: 8 bytes
    // - lock script: 1 + 32 + 1 + 20 = 54 bytes (code_hash + hash_type + args)  
    // - type script: 1 + 32 + 1 + 32 = 66 bytes (code_hash + hash_type + args for Type ID)
    // - data: actual protocol data size
    const dataSize = protocolDataBytes.byteLength
    const cellOverhead = 8 + 54 + 66 // More accurate overhead calculation
    const requiredBytes = cellOverhead + dataSize
    
    // Convert to CKB capacity (1 CKB = 10^8 Shannon, 1 byte = 10^8 Shannon)
    // Add 20% buffer for safety (Type ID args might change size)
    const requiredCapacity = BigInt(Math.ceil(requiredBytes * 1.2)) * BigInt(100000000)
    
    console.log("Capacity calculation:", {
      dataSize,
      cellOverhead,
      requiredBytes,
      requiredCapacity: requiredCapacity.toString(),
      requiredCKB: (Number(requiredCapacity) / 100000000).toFixed(8)
    })
    
    // Build deployment transaction with explicit capacity
    const tx = ccc.Transaction.from({
      inputs: [],
      outputs: [
        {
          lock: deployerScript,
          type: protocolTypeScript,
          capacity: requiredCapacity
        }
      ],
      outputsData: ["0x" + Array.from(new Uint8Array(protocolDataBytes)).map(b => b.toString(16).padStart(2, '0')).join('')],
      cellDeps: [
        {
          outPoint: protocolTypeCodeCell.outPoint,
          depType: "code" as const
        }
      ],
      headerDeps: [],
      witnesses: []
    })
    
    // Add Type ID system script as cell dependency
    if (typeIdScript.cellDep) {
      tx.cellDeps.push({
        outPoint: typeIdScript.cellDep.outPoint,
        depType: typeIdScript.cellDep.depType
      })
    }
    
    // First, use completeInputsAtLeastOne to get at least one input
    await tx.completeInputsAtLeastOne(signer)
    
    // Now calculate Type ID using the first input
    if (tx.inputs.length > 0) {
      const firstInput = tx.inputs[0]
      
      console.log("Debug first input structure:", {
        firstInput: safeStringify(firstInput, 2),
        hasOutPoint: !!firstInput.outPoint,
        hasPreviousOutput: !!firstInput.previousOutput,
        inputKeys: Object.keys(firstInput)
      })
      
      // The hashTypeId function expects the full CellInput object, not just the OutPoint
      // According to the error, it calls CellInput.from() internally
      
      console.log("Using full input for hashTypeId:", {
        firstInput: safeStringify(firstInput, 2)
      })
      
      // Validate that the input has the required structure
      if (!firstInput) {
        throw new Error("No input available for Type ID calculation")
      }
      
      // Use the full firstInput object with CCC's hashTypeId
      // The function signature is: hashTypeId(input: CellInput, outputIndex: number)
      const typeIdHash = ccc.hashTypeId(firstInput, 0)
      
      console.log("Calculated Type ID:", {
        typeIdHash
      })
      
      // Update type script with calculated Type ID
      tx.outputs[0].type!.args = typeIdHash
      
      // Complete inputs by capacity after setting Type ID
      await tx.completeInputsByCapacity(signer)
      
      // Complete fees and send
      await tx.completeFeeBy(signer, 1000)
      const txHash = await signer.sendTransaction(tx)
      
      return {
        txHash,
        protocolTypeScript: {
          codeHash: tx.outputs[0].type!.codeHash,
          hashType: tx.outputs[0].type!.hashType,
          args: tx.outputs[0].type!.args
        },
        protocolCellOutPoint: {
          txHash,
          index: 0
        }
      }
    } else {
      throw new Error("No inputs found after completeInputsAtLeastOne")
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
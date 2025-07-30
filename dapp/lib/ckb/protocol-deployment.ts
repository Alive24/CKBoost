// Protocol Cell Deployment - Deploy new protocol cell to CKB blockchain
// This file handles deploying a new protocol cell when none exists

import { ccc } from "@ckb-ccc/connector-react"
import { Protocol } from "ssri-ckboost"
import { ssri } from "@ckb-ccc/ssri"
import { deploymentManager, DeploymentManager, DeploymentRecord } from "./deployment-manager"


/**
 * Get the protocol type code cell outpoint from deployment information
 * @returns The outpoint of the cell containing the protocol code or null
 */
function getProtocolTypeCodeOutPoint(): { outPoint: { txHash: string; index: number }, deployment: DeploymentRecord } | null {
  try {
    // Get current network
    const network = DeploymentManager.getCurrentNetwork()
    
    // Get deployment info from deployment manager
    const outPoint = deploymentManager.getContractOutPoint(network, 'ckboostProtocolType')
    const deployment = deploymentManager.getCurrentDeployment(network, 'ckboostProtocolType')
    
    if (!outPoint || !deployment) {
      throw new Error(
        `Protocol type contract not found in deployments.json for ${network}. ` +
        `Please ensure the contract is deployed and recorded in deployments.json`
      )
    }
    
    console.log(`Using protocol type code cell from deployments.json:`, outPoint)
    
    return { outPoint, deployment }
  } catch (error) {
    console.error("Failed to get protocol type code outpoint:", error)
    return null
  }
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
    lockHash: string
    name: string
    description: string
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
  const protocolTypeDeployment = deploymentManager.getCurrentDeployment(network, 'ckboostProtocolType')
  
  if (!protocolTypeDeployment) {
    return 'none' // No protocol contract deployed
  }
  
  // Then check if protocol cell exists (via args)
  const args = process.env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS
  
  if (!args || args === '' || args === '0x') {
    return 'partial' // Protocol contract deployed but no protocol cell
  }
  
  // NOTE: Even if args are set, the actual protocol cell might not exist on blockchain
  // This function returns config status based on environment, not blockchain state
  // The actual cell existence is checked when fetching data
  return 'complete' // Both protocol contract and cell are configured
}

/**
 * Get protocol deployment template with sensible defaults
 */
export function getProtocolDeploymentTemplate(): DeployProtocolCellParams {
  const network = DeploymentManager.getCurrentNetwork()
  const deployment = deploymentManager.getCurrentDeployment(network, 'ckboostProtocolType')
  
  return {
    adminLockHashes: [], // To be filled by user's lock hash
    scriptCodeHashes: {
      // Use the typeHash which is the actual protocol contract code hash
      ckbBoostProtocolTypeCodeHash: deployment?.typeHash || "0x0000000000000000000000000000000000000000000000000000000000000000",
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
 * Deploy a new protocol cell to the CKB blockchain using ssri-ckboost
 * 
 * Flow:
 * 1. SSRI creates a transaction with the protocol data and TransactionRecipe in witness
 * 2. We add capacity inputs from the user's wallet
 * 3. We prepare witnesses for the new inputs (while preserving SSRI's recipe witness)
 * 4. We complete the transaction with fees
 * 5. The wallet signs the transaction (SSRI doesn't sign, it only provides the recipe)
 * 6. We send the signed transaction to the network
 * 
 * @param signer - CCC signer instance
 * @param params - Protocol deployment parameters
 * @returns Deployment result with transaction hash and cell info
 */
export async function deployProtocolCell(
  signer: ccc.Signer,
  params: DeployProtocolCellParams
): Promise<DeploymentResult> {
  try {
    console.log("=== Starting Protocol Cell Deployment ===")
    console.log("Signer info:", {
      isConnected: !!signer,
      hasClient: !!signer.client,
      signerType: signer.constructor.name
    })
    
    // Validate parameters
    if (!params.adminLockHashes || params.adminLockHashes.length === 0) {
      throw new Error("At least one admin lock hash is required")
    }

    // Get protocol type code outpoint from deployments.json
    const protocolTypeCodeCellInfo = getProtocolTypeCodeOutPoint()
    if (!protocolTypeCodeCellInfo) {
      throw new Error("Protocol type contract code cell not found. Make sure the protocol contract is deployed and deployment information is available.")
    }
    
    const { outPoint: protocolTypeCodeCell, deployment } = protocolTypeCodeCellInfo

    // Create initial protocol data using ssri-ckboost Protocol class
    // Note: The Protocol.createProtocolData expects camelCase properties
    console.log("Creating protocol data with params:", {
      adminLockHashes: params.adminLockHashes,
      tippingConfigThresholds: params.tippingConfig.approvalRequirementThresholds,
      endorsersCount: params.initialEndorsers?.length || 0
    })
    
    let protocolData;
    try {
      protocolData = Protocol.createProtocolData({
        campaignsApproved: [],
        tippingProposals: [],
        tippingConfig: {
          approvalRequirementThresholds: params.tippingConfig.approvalRequirementThresholds,
          expirationDuration: params.tippingConfig.expirationDuration
        },
        endorsersWhitelist: params.initialEndorsers || [],
        lastUpdated: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
        protocolConfig: {
          adminLockHashes: params.adminLockHashes,
          scriptCodeHashes: {
            ckbBoostProtocolTypeCodeHash: params.scriptCodeHashes.ckbBoostProtocolTypeCodeHash,
            ckbBoostProtocolLockCodeHash: params.scriptCodeHashes.ckbBoostProtocolLockCodeHash,
            ckbBoostCampaignTypeCodeHash: params.scriptCodeHashes.ckbBoostCampaignTypeCodeHash,
            ckbBoostCampaignLockCodeHash: params.scriptCodeHashes.ckbBoostCampaignLockCodeHash,
            ckbBoostUserTypeCodeHash: params.scriptCodeHashes.ckbBoostUserTypeCodeHash,
            acceptedUdtTypeCodeHashes: [],
            acceptedDobTypeCodeHashes: []
          }
        }
      })
    } catch (createError) {
      console.error("Failed to create protocol data:", createError)
      throw new Error(`Failed to create protocol data: ${createError instanceof Error ? createError.message : String(createError)}`)
    }
    
    if (!protocolData) {
      throw new Error("Protocol.createProtocolData returned undefined")
    }
    
    console.log("Protocol data created successfully:", {
      hasData: !!protocolData,
      dataType: typeof protocolData
    })

    // For new protocol cell creation, we need the actual protocol type script
    // Use the typeHash from deployment as the code hash
    const protocolTypeScript = {
      codeHash: deployment?.typeHash || "0x0000000000000000000000000000000000000000000000000000000000000000",
      hashType: "type" as const,
      args: "0x" // Empty args - SSRI will calculate and fill the Type ID
    }
    
    // Create SSRI executor for protocol operations
    // The executor URL should be configured based on environment
    const executorUrl = process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090"
    const executor = new ssri.ExecutorJsonRpc(executorUrl)
    
    // Create Protocol instance with executor
    // Pass the type script of the protocol cell (with empty args)
    const protocol = new Protocol(protocolTypeCodeCell, protocolTypeScript, {
      executor: executor
    })
    
    // Use the Protocol's updateProtocol method to create the transaction
    // This method will handle all the complex transaction building
    let tx: ccc.Transaction;
    
    console.log("Calling SSRI updateProtocol with executor:", executorUrl)
    console.log("Protocol type script:", protocolTypeScript)
    
    // Only try to log protocol data properties if it exists
    if (protocolData && typeof protocolData === 'object') {
      // Log the entire protocolData to see its structure
      console.log("Full protocol data:", protocolData)
      
      // Try different property access patterns
      const props = Object.keys(protocolData);
      console.log("Protocol data properties:", props)
      
      console.log("Protocol data preview:", {
        adminLockHashes: protocolData.protocol_config?.admin_lock_hash_vec || 'N/A',
        lastUpdated: protocolData.last_updated || 'N/A',
        hasEndorsers: protocolData.endorsers_whitelist?.length > 0 || false
      })
    }
    
    try {
      const response = await protocol.updateProtocol(signer, protocolData)
      tx = response.res
      
      console.log("SSRI response received successfully")
      console.log("Transaction in Hex:")
      console.log(ccc.hexFrom(tx.toBytes()))
    } catch (error) {
      console.error("SSRI updateProtocol failed:", error)
      
      // Check if it's an executor error
      if (error instanceof Error && (error.message.includes('executor') || error.message.includes('fetch'))) {
        // Provide guidance when SSRI executor is not ready
        throw new Error(
          `SSRI executor is not ready or not configured.\n\n` +
          `To deploy a protocol cell, you need:\n` +
          `1. The protocol type contract deployed (found in deployments.json)\n` +
          `2. A running SSRI executor server at: ${executorUrl}\n` +
          `3. Sufficient CKB balance in your wallet\n\n` +
          `Please check:\n` +
          `- Your SSRI executor server is running at ${executorUrl}\n` +
          `- Set NEXT_PUBLIC_SSRI_EXECUTOR_URL env variable if using a different URL\n` +
          `- Your wallet is connected and has sufficient balance\n` +
          `- The protocol type contract is properly deployed\n` +
          `- Try refreshing the page if the issue persists`
        )
      }
      throw error
    }
    
    // Since this is a new deployment, we need to ensure it creates a Type ID cell
    // The transaction from updateProtocol should have the protocol cell as an output
    if (!tx || !tx.outputs || tx.outputs.length === 0) {
      throw new Error("Transaction does not include any outputs")
    }
    
    // For new cell creation, we need to ensure the transaction has inputs for capacity
    // The transaction needs inputs to pay for the new cell
    // Let's add capacity inputs
    await tx.completeInputsByCapacity(signer)
    
    // The fee rate is already in the correct unit (shannon/byte)
    // Ensure minimum of 1000 shannon/KB (1 shannon/byte)
    await tx.completeFeeBy(signer);

    // Convert transaction to hex for debugging
    const txHex = ccc.hexFrom(tx.toBytes())
    
    // Always print transaction hex for debugging
    console.log("=== Transaction Generated ===")
    console.log("Transaction hex:")
    console.log(txHex)
    console.log("\nTo debug this transaction offline, run:")
    console.log(`cd contracts/utils && cargo run -- "${txHex}"`)
    console.log("=============================\n")
    
    // Check if transaction is ready for signing
    if (!tx.inputs || tx.inputs.length === 0) {
      console.error("WARNING: Transaction has no inputs!")
    }
    if (!tx.outputs || tx.outputs.length === 0) {
      console.error("WARNING: Transaction has no outputs!")
    }
    if (!tx.witnesses || tx.witnesses.length === 0) {
      console.error("WARNING: Transaction has no witnesses!")
    }
    
    try {
      // Send the transaction
      console.log("Sending transaction to network...")
      console.log("This should trigger wallet signing...")
      console.log("Signer state before send:", {
        isConnected: !!signer,
        hasClient: !!signer.client,
        signerType: signer.constructor.name,
        addressAvailable: !!(await signer.getRecommendedAddress())
      })
      
      // Log transaction details
      console.log("Transaction summary:", {
        inputsCount: tx.inputs.length,
        outputsCount: tx.outputs.length,
        witnessesCount: tx.witnesses.length,
        cellDepsCount: tx.cellDeps.length,
        hasSignatures: tx.witnesses.some(w => w && w.length > 0)
      })
      
      console.log("About to call signer.sendTransaction...")
      
      // SSRI provides the TransactionRecipe in the witness but doesn't sign the transaction
      // We need to sign the transaction with the wallet
      console.log("Transaction has witness with TransactionRecipe, needs wallet signing...")
      
      // Check witness structure
      if (tx.witnesses && tx.witnesses.length > 0) {
        console.log("Witness count:", tx.witnesses.length)
        for (let i = 0; i < tx.witnesses.length; i++) {
          const witness = tx.witnesses[i]
          console.log(`Witness ${i}:`, {
            length: witness?.length || 0,
            hex: witness ? ccc.hexFrom(witness.slice(0, Math.min(100, witness.length))) + '...' : 'empty'
          })
          
          // Try to parse as WitnessArgs
          try {
            if (witness && witness.length > 0) {
              const witnessArgs = ccc.WitnessArgs.decode(witness)
              console.log(`  WitnessArgs ${i}:`, {
                lock: witnessArgs.lock ? `${witnessArgs.lock.length} bytes` : 'empty',
                inputType: witnessArgs.inputType ? `${witnessArgs.inputType.length} bytes` : 'empty',
                outputType: witnessArgs.outputType ? `${witnessArgs.outputType.length} bytes` : 'empty'
              })
            }
          } catch (e) {
            console.log(`  Not a valid WitnessArgs structure`)
          }
        }
      }
      
      // Sign and send the transaction
      console.log("Requesting wallet to sign transaction...")
      
      try {
        const txHash = await signer.sendTransaction(tx)
        console.log("Transaction sent successfully! TxHash:", txHash)
        return {
          txHash,
          protocolTypeScript: {
            codeHash: "0x",
            hashType: "type" as const,
            args: "0x"
          },
          protocolCellOutPoint: {
            txHash,
            index: 0
          }
        }
      } catch (sendError: any) {
        console.error("Transaction send failed:", sendError)
        
        // Check if it's a ScriptNotFound error
        if (sendError.message?.includes('ScriptNotFound')) {
          const match = sendError.message.match(/code_hash: Byte32\((0x[a-fA-F0-9]+)\)/);
          const missingCodeHash = match ? match[1] : 'unknown';
          
          if (missingCodeHash === '0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8') {
            throw new Error(
              'System script not found: secp256k1_blake160.\n\n' +
              'This is the default lock script that needs to be deployed on your network.\n' +
              'If you are using a local devnet, make sure to deploy system scripts.\n\n' +
              'Possible solutions:\n' +
              '1. Use CKB devnet with pre-deployed system scripts\n' +
              '2. Deploy the secp256k1_blake160 script manually\n' +
              '3. Configure SSRI to use a different lock script'
            );
          } else {
            throw new Error(
              `Script not found on chain: ${missingCodeHash}\n\n` +
              'The transaction references a script that is not deployed on the current network.\n' +
              'Please ensure all required scripts are deployed before attempting this operation.'
            );
          }
        }
        
        // Check if it's a signing error
        if (sendError.message?.includes('sign') || sendError.message?.includes('wallet')) {
          console.error("Wallet signing error. Transaction hex for debugging:")
          console.error(txHex)
          throw new Error(
            `Wallet signing failed: ${sendError.message}\n\n` +
            'Please check:\n' +
            '1. Your wallet is connected and unlocked\n' +
            '2. You have sufficient CKB balance\n' +
            '3. The transaction is properly formatted'
          );
        }
        
        throw sendError
      }
    } catch (sendError) {
      // If transaction fails, print the hex for debugging
      console.error("Transaction failed to send. Transaction hex for debugging:")
      console.error(txHex)
      console.error("\nTo debug this transaction, run:")
      console.error(`cd contracts/utils && cargo run -- "${txHex}"`)
      throw sendError
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
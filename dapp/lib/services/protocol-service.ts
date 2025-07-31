// Protocol Service - High-level protocol operations
// This service provides high-level protocol operations by delegating to the cell layer

import { ccc } from "@ckb-ccc/core"
import { ssri } from "@ckb-ccc/ssri"
import type { ProtocolDataLike, EndorserInfoLike } from "ssri-ckboost/types"
import {
  ProtocolMetrics,
  ProtocolTransaction,
  UpdateProtocolConfigForm,
  UpdateScriptCodeHashesForm,
  UpdateTippingConfigForm,
  AddEndorserForm,
  EditEndorserForm,
  BatchUpdateProtocolForm,
  ProtocolChanges,
  FieldChange
} from "../types/protocol"
import {
  fetchProtocolData,
  fetchProtocolDataByOutPoint,
  fetchProtocolMetrics,
  fetchProtocolTransactions
} from "../ckb/protocol-cells"
import { Protocol } from "ssri-ckboost"
import { deploymentManager, DeploymentManager } from "../ckb/deployment-manager"

/**
 * Protocol service that provides high-level protocol operations
 */
export class ProtocolService {
  private signer?: ccc.Signer
  private protocol?: Protocol

  constructor(signer?: ccc.Signer) {
    this.signer = signer
    
    // Initialize Protocol instance with deployment config
    if (signer) {
      try {
        // Get the protocol type code outpoint and deployment info
        const network = DeploymentManager.getCurrentNetwork()
        const deployment = deploymentManager.getCurrentDeployment(network, 'ckboostProtocolType')
        const outPoint = deploymentManager.getContractOutPoint(network, 'ckboostProtocolType')
        
        if (!deployment || !outPoint) {
          throw new Error("Protocol type contract not found in deployments.json")
        }
        
        // Create the protocol type script
        const protocolTypeScript = {
          codeHash: deployment.typeHash || "0x0000000000000000000000000000000000000000000000000000000000000000",
          hashType: "type" as const,
          args: process.env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS || "0x" // Protocol cell type args
        }
        
        // TODO: Get executor from environment
        const executorUrl = process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090"
        const executor = new ssri.ExecutorJsonRpc(executorUrl)

        this.protocol = new Protocol(outPoint, protocolTypeScript, {
          executor: executor
        })
      } catch (error) {
        console.warn("Failed to initialize Protocol instance:", error)
      }
    }
  }

  /**
   * Helper method to update protocol using the SDK
   */
  private async updateProtocol(updatedData: ProtocolDataLike): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer is required to update protocol")
    }
    
    if (!this.protocol) {
      throw new Error("Protocol instance not initialized. Check deployment configuration.")
    }

    // Create the transaction using the SDK
    const { res: tx } = await this.protocol.updateProtocol(this.signer, updatedData)
    
    // Complete fees and send transaction
    await tx.completeInputsByCapacity(this.signer)
    await tx.completeFeeBy(this.signer)
    const txHash = await this.signer.sendTransaction(tx)
    
    console.log("Protocol updated, tx:", txHash)
    return txHash
  }

  /**
   * Get current protocol data
   * @returns Current ProtocolDataType
   */
  async getProtocolData(): Promise<ProtocolDataLike> {
    try {
      return await fetchProtocolData(this.signer)
    } catch (error) {
      console.warn("Failed to fetch protocol data:", error)
      throw error
    }
  }

  /**
   * Get protocol data by specific outpoint
   * @param outPoint - Specific outpoint to fetch
   * @returns ProtocolDataType from the specified cell
   */
  async getProtocolDataByOutPoint(outPoint: { txHash: ccc.Hex; index: ccc.Num }): Promise<ProtocolDataLike> {
    if (!this.signer) {
      throw new Error("Signer required for fetching by outpoint")
    }
    try {
      return await fetchProtocolDataByOutPoint(this.signer, outPoint)
    } catch (error) {
      console.warn("Failed to fetch protocol data by outpoint:", error)
      throw error
    }
  }

  /**
   * Get protocol metrics
   * @returns Protocol metrics
   */
  async getProtocolMetrics(): Promise<ProtocolMetrics> {
    try {
      return await fetchProtocolMetrics(this.signer)
    } catch (error) {
      console.warn("Failed to fetch protocol metrics:", error)
      throw error
    }
  }

  /**
   * Get protocol transaction history
   * @param limit - Maximum number of transactions to fetch
   * @returns Array of protocol transactions
   */
  async getProtocolTransactions(limit: number = 50): Promise<ProtocolTransaction[]> {
    try {
      return await fetchProtocolTransactions(this.signer, limit)
    } catch (error) {
      console.warn("Failed to fetch protocol transactions:", error)
      throw error
    }
  }

  /**
   * Update protocol configuration
   * @param form - Protocol config form data
   * @returns Transaction hash
   */
  async updateProtocolConfig(form: UpdateProtocolConfigForm): Promise<string> {
    try {
      const currentData = await this.getProtocolData()
      
      // Since ProtocolDataType is now SDK type, we need to handle it properly
      // This is a simplified update - in production, you'd need to serialize properly
      // Convert admin lock hashes to ArrayBuffer
      const adminLockHashVec = form.adminLockHashes.map(hash => {
        const bytes = ccc.bytesFrom(hash, "hex");
        const buffer = new ArrayBuffer(32);
        new Uint8Array(buffer).set(bytes);
        return buffer;
      });
      
      // Convert timestamp to ArrayBuffer
      const timestampBytes = ccc.numLeToBytes(Math.floor(Date.now() / 1000), 8);
      const timestampBuffer = new ArrayBuffer(8);
      new Uint8Array(timestampBuffer).set(timestampBytes);
      
      const updatedData: any = {
        ...currentData,
        protocol_config: {
          ...currentData.protocol_config,
          admin_lock_hash_vec: adminLockHashVec
        },
        last_updated: timestampBuffer
      }

      return await this.updateProtocol(updatedData)
    } catch (error) {
      console.error("Failed to update protocol config:", error)
      throw error
    }
  }

  /**
   * Update script code hashes
   * @param form - Script code hashes form data
   * @returns Transaction hash
   */
  async updateScriptCodeHashes(_form: UpdateScriptCodeHashesForm): Promise<string> {
    try {
      const currentData = await this.getProtocolData()
      
      // TODO: Update when schema supports these fields
      // For now, we can only update the accepted code hashes
      const updatedData: ProtocolDataLike = {
        ...currentData,
        protocol_config: {
          ...currentData.protocol_config,
          script_code_hashes: {
            ...currentData.protocol_config.script_code_hashes,
            accepted_udt_type_code_hashes: [],
            accepted_dob_type_code_hashes: []
          }
        },
        last_updated: BigInt(Date.now())
      }

      return await this.updateProtocol(updatedData)
    } catch (error) {
      console.error("Failed to update script code hashes:", error)
      throw error
    }
  }

  /**
   * Update tipping configuration
   * @param form - Tipping config form data
   * @returns Transaction hash
   */
  async updateTippingConfig(form: UpdateTippingConfigForm): Promise<string> {
    try {
      const currentData = await this.getProtocolData()
      
      const updatedData: ProtocolDataLike = {
        ...currentData,
        tipping_config: {
          ...currentData.tipping_config,
          approval_requirement_thresholds: form.approvalRequirementThresholds.map(threshold => 
            BigInt(threshold)
          ),
          expiration_duration: BigInt(form.expirationDuration)
        },
        last_updated: BigInt(Date.now())
      }

      return await this.updateProtocol(updatedData)
    } catch (error) {
      console.error("Failed to update tipping config:", error)
      throw error
    }
  }

  /**
   * Add a new endorser
   * @param form - Add endorser form data
   * @returns Transaction hash
   */
  async addEndorser(form: AddEndorserForm): Promise<string> {
    try {
      const currentData = await this.getProtocolData()
      
      // Compute lock hash
      let lockHashHex: ccc.Hex
      if (form.endorserLockHash) {
        // Use the provided lock hash directly
        lockHashHex = form.endorserLockHash as ccc.Hex;
      } else {
        // Fallback: compute lock hash from script using CCC
        const cccScript = ccc.Script.from({
          codeHash: form.endorserLockScript.codeHash,
          hashType: form.endorserLockScript.hashType,
          args: form.endorserLockScript.args
        })
        lockHashHex = cccScript.hash();
      }
      
      // Create new endorser
      // Convert strings to hex for the new type system
      const nameHex = ccc.hexFrom(ccc.bytesFrom(form.endorserName, "utf8"));
      const descHex = ccc.hexFrom(ccc.bytesFrom(form.endorserDescription, "utf8"));
      
      const newEndorser: EndorserInfoLike = {
        endorser_lock_hash: lockHashHex,
        endorser_name: nameHex,
        endorser_description: descHex,
        website: ccc.hexFrom(ccc.bytesFrom(form.website || "", "utf8")),
        social_links: (form.socialLinks || []).map(link => ccc.hexFrom(ccc.bytesFrom(link, "utf8"))),
        verified: form.verified || 0
      }

      const updatedData: ProtocolDataLike = {
        ...currentData,
        endorsers_whitelist: [...currentData.endorsers_whitelist, newEndorser],
        last_updated: BigInt(Date.now())
      }

      return await this.updateProtocol(updatedData)
    } catch (error) {
      console.error("Failed to add endorser:", error)
      throw error
    }
  }

  /**
   * Edit an existing endorser
   * @param form - Edit endorser form data
   * @returns Transaction hash
   */
  async editEndorser(form: EditEndorserForm): Promise<string> {
    try {
      const currentData = await this.getProtocolData()
      
      if (form.index < 0 || form.index >= currentData.endorsers_whitelist.length) {
        throw new Error("Invalid endorser index")
      }

      // Compute lock hash
      let lockHashHex: ccc.Hex
      if (form.endorserLockHash) {
        // Use the provided lock hash directly
        lockHashHex = form.endorserLockHash as ccc.Hex;
      } else {
        // Fallback: compute lock hash from script using CCC
        const cccScript = ccc.Script.from({
          codeHash: form.endorserLockScript.codeHash,
          hashType: form.endorserLockScript.hashType,
          args: form.endorserLockScript.args
        })
        lockHashHex = cccScript.hash();
      }
      
      // Convert strings to hex for the new type system
      const nameHex = ccc.hexFrom(ccc.bytesFrom(form.endorserName, "utf8"));
      const descHex = ccc.hexFrom(ccc.bytesFrom(form.endorserDescription, "utf8"));
      
      const updatedEndorsers = [...currentData.endorsers_whitelist]
      updatedEndorsers[Number(form.index)] = {
        endorser_lock_hash: lockHashHex,
        endorser_name: nameHex,
        endorser_description: descHex,
        website: ccc.hexFrom(ccc.bytesFrom(form.website || "", "utf8")),
        social_links: (form.socialLinks || []).map(link => ccc.hexFrom(ccc.bytesFrom(link, "utf8"))),
        verified: form.verified || 0
      }

      const updatedData: ProtocolDataLike = {
        ...currentData,
        endorsers_whitelist: updatedEndorsers,
        last_updated: BigInt(Date.now())
      }

      return await this.updateProtocol(updatedData)
    } catch (error) {
      console.error("Failed to edit endorser:", error)
      throw error
    }
  }

  /**
   * Remove an endorser by index
   * @param index - Index of endorser to remove
   * @returns Transaction hash
   */
  async removeEndorser(index: number): Promise<string> {
    try {
      const currentData = await this.getProtocolData()
      
      if (index < 0 || index >= currentData.endorsers_whitelist.length) {
        throw new Error("Invalid endorser index")
      }

      const updatedEndorsers = currentData.endorsers_whitelist.filter((_, i) => i !== index)

      const updatedData: ProtocolDataLike = {
        ...currentData,
        endorsers_whitelist: updatedEndorsers,
        last_updated: BigInt(Date.now())
      }

      return await this.updateProtocol(updatedData)
    } catch (error) {
      console.error("Failed to remove endorser:", error)
      throw error
    }
  }

  /**
   * Batch update protocol with multiple changes
   * @param form - Batch update form data
   * @returns Transaction hash
   */
  async batchUpdateProtocol(form: BatchUpdateProtocolForm): Promise<string> {
    try {
      const currentData = await this.getProtocolData()
      let updatedData = { ...currentData }

      // Update protocol config if provided
      if (form.protocolConfig) {
        updatedData.protocol_config = {
          ...updatedData.protocol_config,
          admin_lock_hash_vec: form.protocolConfig.adminLockHashes.map(hash => 
            hash as ccc.Hex
          )
        }
      }

      // Update script code hashes if provided
      // TODO: Update when schema supports these fields
      if (form.scriptCodeHashes) {
        updatedData.protocol_config = {
          ...updatedData.protocol_config,
          script_code_hashes: {
            ...currentData.protocol_config.script_code_hashes,
            accepted_udt_type_code_hashes: [],
            accepted_dob_type_code_hashes: []
          }
        }
      }

      // Update tipping config if provided
      if (form.tippingConfig) {
        updatedData.tipping_config = {
          ...updatedData.tipping_config,
          approval_requirement_thresholds: form.tippingConfig.approvalRequirementThresholds.map(threshold => 
            BigInt(Number(threshold))
          ),
          expiration_duration: BigInt(form.tippingConfig.expirationDuration)
        }
      }

      // Handle endorser operations
      if (form.endorserOperations) {
        let endorsers = [...updatedData.endorsers_whitelist]

        // Remove endorsers (process in reverse order to maintain indices)
        if (form.endorserOperations.remove) {
          const sortedIndices = form.endorserOperations.remove.sort((a, b) => Number(b) - Number(a))
          for (const index of sortedIndices) {
            if (index >= 0 && index < endorsers.length) {
              endorsers.splice(Number(index), 1)
            }
          }
        }

        // Edit endorsers
        if (form.endorserOperations.edit) {
          for (const edit of form.endorserOperations.edit) {
            if (Number(edit.index) >= 0 && Number(edit.index) < endorsers.length) {
              // Compute lock hash
              let lockHashHex: ccc.Hex
              if (edit.endorserLockHash) {
                // Use the provided lock hash directly
                lockHashHex = edit.endorserLockHash as ccc.Hex;
              } else {
                // Fallback: compute lock hash from script using CCC
                const cccScript = ccc.Script.from({
                  codeHash: edit.endorserLockScript.codeHash,
                  hashType: edit.endorserLockScript.hashType,
                  args: edit.endorserLockScript.args
                })
                lockHashHex = cccScript.hash();
              }
              
              // Convert strings to hex for the new type system
              const nameHex = ccc.hexFrom(ccc.bytesFrom(edit.endorserName, "utf8"));
              const descHex = ccc.hexFrom(ccc.bytesFrom(edit.endorserDescription, "utf8"));
              
              endorsers[Number(edit.index)] = {
                endorser_lock_hash: lockHashHex,
                endorser_name: nameHex,
                endorser_description: descHex,
                website: ccc.hexFrom(ccc.bytesFrom(edit.website || "", "utf8")),
                social_links: (edit.socialLinks || []).map(link => ccc.hexFrom(ccc.bytesFrom(link, "utf8"))),
                verified: edit.verified || 0
              }
            }
          }
        }

        // Add new endorsers
        if (form.endorserOperations.add) {
          for (const add of form.endorserOperations.add) {
            // Compute lock hash
            let lockHashHex: ccc.Hex
            if (add.endorserLockHash) {
              // Use the provided lock hash directly
              lockHashHex = add.endorserLockHash as ccc.Hex;
            } else {
              // Fallback: compute lock hash from script using CCC
              const cccScript = ccc.Script.from({
                codeHash: add.endorserLockScript.codeHash,
                hashType: add.endorserLockScript.hashType,
                args: add.endorserLockScript.args
              })
              lockHashHex = cccScript.hash();
            }
            
            // Convert strings to hex for the new type system
            const nameHex = ccc.hexFrom(ccc.bytesFrom(add.endorserName, "utf8"));
            const descHex = ccc.hexFrom(ccc.bytesFrom(add.endorserDescription, "utf8"));
            
            endorsers.push({
              endorser_lock_hash: lockHashHex,
              endorser_name: nameHex,
              endorser_description: descHex,
              website: ccc.hexFrom(ccc.bytesFrom(add.website || "", "utf8")),
              social_links: (add.socialLinks || []).map(link => ccc.hexFrom(ccc.bytesFrom(link, "utf8"))),
              verified: add.verified || 0
            })
          }
        }

        updatedData.endorsers_whitelist = endorsers
      }

      updatedData.last_updated = BigInt(Date.now())

      return await this.updateProtocol(updatedData)
    } catch (error) {
      console.error("Failed to batch update protocol:", error)
      throw error
    }
  }

  /**
   * Calculate changes between current and new data
   */
  calculateChanges(currentData: ProtocolDataLike, formData: Partial<{
    adminLockHashes: string[]
    scriptCodeHashes: any
    tippingConfig: any
    endorsers: EndorserInfoLike[]
  }>): ProtocolChanges {
    const changes: ProtocolChanges = {
      protocolConfig: {
        adminLockHashes: this.createFieldChange(
          'protocol_config.admin_lock_hash_vec',
          currentData.protocol_config.admin_lock_hash_vec,
          formData.adminLockHashes || currentData.protocol_config.admin_lock_hash_vec
        )
      },
      scriptCodeHashes: {
        ckbBoostProtocolTypeCodeHash: this.createFieldChange(
          'protocol_config.script_code_hashes.ckb_boost_protocol_type_code_hash',
          currentData.protocol_config.script_code_hashes.ckb_boost_protocol_type_code_hash,
          formData.scriptCodeHashes?.ckbBoostProtocolTypeCodeHash || currentData.protocol_config.script_code_hashes.ckb_boost_protocol_type_code_hash
        ),
        ckbBoostProtocolLockCodeHash: this.createFieldChange(
          'protocol_config.script_code_hashes.ckb_boost_protocol_lock_code_hash',
          currentData.protocol_config.script_code_hashes.ckb_boost_protocol_lock_code_hash,
          formData.scriptCodeHashes?.ckbBoostProtocolLockCodeHash || currentData.protocol_config.script_code_hashes.ckb_boost_protocol_lock_code_hash
        ),
        ckbBoostCampaignTypeCodeHash: this.createFieldChange(
          'protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash',
          currentData.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash,
          formData.scriptCodeHashes?.ckbBoostCampaignTypeCodeHash || currentData.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash
        ),
        ckbBoostCampaignLockCodeHash: this.createFieldChange(
          'protocol_config.script_code_hashes.ckb_boost_campaign_lock_code_hash',
          currentData.protocol_config.script_code_hashes.ckb_boost_campaign_lock_code_hash,
          formData.scriptCodeHashes?.ckbBoostCampaignLockCodeHash || currentData.protocol_config.script_code_hashes.ckb_boost_campaign_lock_code_hash
        ),
        ckbBoostUserTypeCodeHash: this.createFieldChange(
          'protocol_config.script_code_hashes.ckb_boost_user_type_code_hash',
          currentData.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash,
          formData.scriptCodeHashes?.ckbBoostUserTypeCodeHash || currentData.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash
        )
      },
      tippingConfig: {
        approvalRequirementThresholds: this.createFieldChange(
          'tipping_config.approval_requirement_thresholds',
          currentData.tipping_config.approval_requirement_thresholds,
          formData.tippingConfig?.approvalRequirementThresholds || currentData.tipping_config.approval_requirement_thresholds
        ),
        expirationDuration: this.createFieldChange(
          'tipping_config.expiration_duration',
          currentData.tipping_config.expiration_duration,
          formData.tippingConfig?.expirationDuration || currentData.tipping_config.expiration_duration
        )
      },
      endorsers: {
        added: [],
        updated: [],
        removed: []
      }
    }

    return changes
  }

  private createFieldChange<T>(fieldPath: string, oldValue: T, newValue: T): FieldChange<T> {
    return {
      fieldPath,
      oldValue,
      newValue,
      hasChanged: JSON.stringify(oldValue) !== JSON.stringify(newValue)
    }
  }

  /**
   * Get default protocol data for initialization
   * @returns Default protocol data from the cell layer
   */
  async getDefaultProtocolData(): Promise<ProtocolDataLike> {
    // Cannot fetch protocol data without a signer
    throw new Error(
      "Cannot fetch protocol data without a connected wallet. " +
      "Please connect your wallet to view protocol data."
    )
  }

  /**
   * Get endorsers list
   */
  static async getEndorsers(signer?: ccc.Signer): Promise<EndorserInfoLike[]> {
    try {
      const data = await fetchProtocolData(signer)
      return data.endorsers_whitelist
    } catch (error) {
      console.warn("Failed to fetch endorsers:", error)
      throw error
    }
  }
}

// Utility functions
export const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString()
}

export const formatLockHash = (hash: string, length: number = 10): string => {
  return hash.length > length ? `${hash.slice(0, length)}...` : hash
}

export const getCampaignStatusText = (status: number): string => {
  switch (status) {
    case 0: return "Draft"
    case 1: return "Pending Approval"
    case 2: return "Approved"
    case 3: return "Rejected"
    case 4: return "Active"
    case 5: return "Completed"
    case 6: return "Cancelled"
    default: return "Unknown"
  }
}

export const getQuestStatusText = (status: number): string => {
  switch (status) {
    case 0: return "Draft"
    case 1: return "Active"
    case 2: return "Completed"
    case 3: return "Cancelled"
    default: return "Unknown"
  }
}
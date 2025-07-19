// Protocol Service - High-level protocol operations
// This service provides high-level protocol operations by delegating to the cell layer

import { ccc } from "@ckb-ccc/connector-react"
import { ProtocolData, EndorserInfo } from "../types"
import { 
  hexToBuffer, 
  stringToBuffer, 
  numberToUint64,
  bufferToHex,
  bufferToString
} from "../utils/type-converters"
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
  fetchProtocolTransactions,
  updateProtocolCell
} from "../ckb/protocol-cells"

/**
 * Protocol service that provides high-level protocol operations
 */
export class ProtocolService {
  private signer?: ccc.Signer

  constructor(signer?: ccc.Signer) {
    this.signer = signer
  }

  /**
   * Get current protocol data
   * @returns Current ProtocolData
   */
  async getProtocolData(): Promise<ProtocolData> {
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
   * @returns ProtocolData from the specified cell
   */
  async getProtocolDataByOutPoint(outPoint: { txHash: string; index: number }): Promise<ProtocolData> {
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
      
      // Since ProtocolData is now SDK type, we need to handle it properly
      // This is a simplified update - in production, you'd need to serialize properly
      const updatedData: any = {
        ...currentData,
        protocol_config: {
          ...currentData.protocol_config,
          admin_lock_hash_vec: form.adminLockHashes.map(hash => hexToBuffer(hash))
        },
        last_updated: numberToUint64(Math.floor(Date.now() / 1000))
      }

      return await updateProtocolCell(this.signer, updatedData)
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
  async updateScriptCodeHashes(form: UpdateScriptCodeHashesForm): Promise<string> {
    try {
      const currentData = await this.getProtocolData()
      
      // TODO: Update when schema supports these fields
      // For now, we can only update the accepted code hashes
      const updatedData: ProtocolData = {
        ...currentData,
        protocol_config: {
          ...currentData.protocol_config,
          script_code_hashes: {
            ...currentData.protocol_config.script_code_hashes,
            accepted_udt_type_code_hashes: [],
            accepted_dob_type_code_hashes: []
          }
        },
        last_updated: numberToUint64(Math.floor(Date.now() / 1000))
      }

      return await updateProtocolCell(this.signer, updatedData)
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
      
      const updatedData: ProtocolData = {
        ...currentData,
        tipping_config: {
          ...currentData.tipping_config,
          approval_requirement_thresholds: form.approvalRequirementThresholds.map(threshold => numberToUint64(Number(threshold))),
          expiration_duration: numberToUint64(form.expirationDuration)
        },
        last_updated: numberToUint64(Math.floor(Date.now() / 1000))
      }

      return await updateProtocolCell(this.signer, updatedData)
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
      
      // Create new endorser
      const newEndorser: EndorserInfo = {
        endorser_lock_hash: hexToBuffer(form.endorserLockScript.codeHash + form.endorserLockScript.hashType + form.endorserLockScript.args),
        endorser_name: stringToBuffer(form.endorserName),
        endorser_description: stringToBuffer(form.endorserDescription),
        // endorser_address: stringToBuffer(form.endorserAddress) // Field not in type
      }

      const updatedData: ProtocolData = {
        ...currentData,
        endorsers_whitelist: [...currentData.endorsers_whitelist, newEndorser],
        last_updated: numberToUint64(Math.floor(Date.now() / 1000))
      }

      return await updateProtocolCell(this.signer, updatedData)
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

      const updatedEndorsers = [...currentData.endorsers_whitelist]
      updatedEndorsers[form.index] = {
        endorser_lock_hash: hexToBuffer(form.endorserLockScript.codeHash + form.endorserLockScript.hashType + form.endorserLockScript.args),
        endorser_name: stringToBuffer(form.endorserName),
        endorser_description: stringToBuffer(form.endorserDescription),
        // endorser_address: stringToBuffer(form.endorserAddress) // Field not in type
      }

      const updatedData: ProtocolData = {
        ...currentData,
        endorsers_whitelist: updatedEndorsers,
        last_updated: numberToUint64(Math.floor(Date.now() / 1000))
      }

      return await updateProtocolCell(this.signer, updatedData)
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

      const updatedData: ProtocolData = {
        ...currentData,
        endorsers_whitelist: updatedEndorsers,
        last_updated: numberToUint64(Math.floor(Date.now() / 1000))
      }

      return await updateProtocolCell(this.signer, updatedData)
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
          admin_lock_hash_vec: form.protocolConfig.adminLockHashes.map(hash => hexToBuffer(hash))
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
          approval_requirement_thresholds: form.tippingConfig.approvalRequirementThresholds.map(threshold => numberToUint64(Number(threshold))),
          expiration_duration: numberToUint64(form.tippingConfig.expirationDuration)
        }
      }

      // Handle endorser operations
      if (form.endorserOperations) {
        let endorsers = [...updatedData.endorsers_whitelist]

        // Remove endorsers (process in reverse order to maintain indices)
        if (form.endorserOperations.remove) {
          const sortedIndices = form.endorserOperations.remove.sort((a, b) => b - a)
          for (const index of sortedIndices) {
            if (index >= 0 && index < endorsers.length) {
              endorsers.splice(index, 1)
            }
          }
        }

        // Edit endorsers
        if (form.endorserOperations.edit) {
          for (const edit of form.endorserOperations.edit) {
            if (edit.index >= 0 && edit.index < endorsers.length) {
              endorsers[edit.index] = {
                endorser_lock_hash: hexToBuffer(edit.endorserLockScript.codeHash + edit.endorserLockScript.hashType + edit.endorserLockScript.args),
                endorser_name: stringToBuffer(edit.endorserName),
                endorser_description: stringToBuffer(edit.endorserDescription),
                // endorser_address: stringToBuffer(edit.endorserAddress) // Field not in type
              }
            }
          }
        }

        // Add new endorsers
        if (form.endorserOperations.add) {
          for (const add of form.endorserOperations.add) {
            endorsers.push({
              endorser_lock_hash: hexToBuffer(add.endorserLockScript.codeHash + add.endorserLockScript.hashType + add.endorserLockScript.args),
              endorser_name: stringToBuffer(add.endorserName),
              endorser_description: stringToBuffer(add.endorserDescription),
              // endorser_address: stringToBuffer(add.endorserAddress) // Field not in type
            })
          }
        }

        updatedData.endorsers_whitelist = endorsers
      }

      updatedData.last_updated = numberToUint64(Math.floor(Date.now() / 1000))

      return await updateProtocolCell(this.signer, updatedData)
    } catch (error) {
      console.error("Failed to batch update protocol:", error)
      throw error
    }
  }

  /**
   * Calculate changes between current and new data
   */
  calculateChanges(currentData: ProtocolData, formData: Partial<{
    adminLockHashes: string[]
    scriptCodeHashes: any
    tippingConfig: any
    endorsers: EndorserInfo[]
  }>): ProtocolChanges {
    const changes: ProtocolChanges = {
      protocolConfig: {
        adminLockHashes: this.createFieldChange(
          'protocol_config.admin_lock_hash_vec',
          currentData.protocol_config.admin_lock_hash_vec.map(buf => bufferToHex(buf)),
          formData.adminLockHashes || currentData.protocol_config.admin_lock_hash_vec.map(buf => bufferToHex(buf))
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
  async getDefaultProtocolData(): Promise<ProtocolData> {
    try {
      // Fetch protocol data without signer to get default/mock data
      return await fetchProtocolData()
    } catch (error) {
      console.error("Failed to get default protocol data:", error)
      throw error
    }
  }

  /**
   * Get endorsers list
   */
  static async getEndorsers(signer?: ccc.Signer): Promise<EndorserInfo[]> {
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
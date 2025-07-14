// Protocol Service - High-level protocol operations
// This service provides high-level protocol operations by delegating to the cell layer

import { ccc } from "@ckb-ccc/connector-react"
import { ProtocolData, EndorserInfo } from "../types"
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
      
      const updatedData: ProtocolData = {
        ...currentData,
        protocolConfig: {
          ...currentData.protocolConfig,
          adminLockHashVec: form.adminLockHashes
        },
        lastUpdated: Date.now()
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
      
      const updatedData: ProtocolData = {
        ...currentData,
        protocolConfig: {
          ...currentData.protocolConfig,
          scriptCodeHashes: {
            ckbBoostProtocolTypeCodeHash: form.ckbBoostProtocolTypeCodeHash,
            ckbBoostProtocolLockCodeHash: form.ckbBoostProtocolLockCodeHash,
            ckbBoostCampaignTypeCodeHash: form.ckbBoostCampaignTypeCodeHash,
            ckbBoostCampaignLockCodeHash: form.ckbBoostCampaignLockCodeHash,
            ckbBoostUserTypeCodeHash: form.ckbBoostUserTypeCodeHash
          }
        },
        lastUpdated: Date.now()
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
        tippingConfig: {
          approvalRequirementThresholds: form.approvalRequirementThresholds,
          expirationDuration: form.expirationDuration
        },
        lastUpdated: Date.now()
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
        endorserLockHash: form.endorserLockScript.codeHash + form.endorserLockScript.hashType + form.endorserLockScript.args,
        endorserName: form.endorserName,
        endorserDescription: form.endorserDescription,
        endorserAddress: form.endorserAddress
      }

      const updatedData: ProtocolData = {
        ...currentData,
        endorsersWhitelist: [...currentData.endorsersWhitelist, newEndorser],
        lastUpdated: Date.now()
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
      
      if (form.index < 0 || form.index >= currentData.endorsersWhitelist.length) {
        throw new Error("Invalid endorser index")
      }

      const updatedEndorsers = [...currentData.endorsersWhitelist]
      updatedEndorsers[form.index] = {
        endorserLockHash: form.endorserLockScript.codeHash + form.endorserLockScript.hashType + form.endorserLockScript.args,
        endorserName: form.endorserName,
        endorserDescription: form.endorserDescription,
        endorserAddress: form.endorserAddress
      }

      const updatedData: ProtocolData = {
        ...currentData,
        endorsersWhitelist: updatedEndorsers,
        lastUpdated: Date.now()
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
      
      if (index < 0 || index >= currentData.endorsersWhitelist.length) {
        throw new Error("Invalid endorser index")
      }

      const updatedEndorsers = currentData.endorsersWhitelist.filter((_, i) => i !== index)

      const updatedData: ProtocolData = {
        ...currentData,
        endorsersWhitelist: updatedEndorsers,
        lastUpdated: Date.now()
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
        updatedData.protocolConfig = {
          ...updatedData.protocolConfig,
          adminLockHashVec: form.protocolConfig.adminLockHashes
        }
      }

      // Update script code hashes if provided
      if (form.scriptCodeHashes) {
        updatedData.protocolConfig = {
          ...updatedData.protocolConfig,
          scriptCodeHashes: form.scriptCodeHashes
        }
      }

      // Update tipping config if provided
      if (form.tippingConfig) {
        updatedData.tippingConfig = form.tippingConfig
      }

      // Handle endorser operations
      if (form.endorserOperations) {
        let endorsers = [...updatedData.endorsersWhitelist]

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
                endorserLockHash: edit.endorserLockScript.codeHash + edit.endorserLockScript.hashType + edit.endorserLockScript.args,
                endorserName: edit.endorserName,
                endorserDescription: edit.endorserDescription,
                endorserAddress: edit.endorserAddress
              }
            }
          }
        }

        // Add new endorsers
        if (form.endorserOperations.add) {
          for (const add of form.endorserOperations.add) {
            endorsers.push({
              endorserLockHash: add.endorserLockScript.codeHash + add.endorserLockScript.hashType + add.endorserLockScript.args,
              endorserName: add.endorserName,
              endorserDescription: add.endorserDescription,
              endorserAddress: add.endorserAddress
            })
          }
        }

        updatedData.endorsersWhitelist = endorsers
      }

      updatedData.lastUpdated = Date.now()

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
          'protocolConfig.adminLockHashVec',
          currentData.protocolConfig.adminLockHashVec,
          formData.adminLockHashes || currentData.protocolConfig.adminLockHashVec
        )
      },
      scriptCodeHashes: {
        ckbBoostProtocolTypeCodeHash: this.createFieldChange(
          'protocolConfig.scriptCodeHashes.ckbBoostProtocolTypeCodeHash',
          currentData.protocolConfig.scriptCodeHashes.ckbBoostProtocolTypeCodeHash,
          formData.scriptCodeHashes?.ckbBoostProtocolTypeCodeHash || currentData.protocolConfig.scriptCodeHashes.ckbBoostProtocolTypeCodeHash
        ),
        ckbBoostProtocolLockCodeHash: this.createFieldChange(
          'protocolConfig.scriptCodeHashes.ckbBoostProtocolLockCodeHash',
          currentData.protocolConfig.scriptCodeHashes.ckbBoostProtocolLockCodeHash,
          formData.scriptCodeHashes?.ckbBoostProtocolLockCodeHash || currentData.protocolConfig.scriptCodeHashes.ckbBoostProtocolLockCodeHash
        ),
        ckbBoostCampaignTypeCodeHash: this.createFieldChange(
          'protocolConfig.scriptCodeHashes.ckbBoostCampaignTypeCodeHash',
          currentData.protocolConfig.scriptCodeHashes.ckbBoostCampaignTypeCodeHash,
          formData.scriptCodeHashes?.ckbBoostCampaignTypeCodeHash || currentData.protocolConfig.scriptCodeHashes.ckbBoostCampaignTypeCodeHash
        ),
        ckbBoostCampaignLockCodeHash: this.createFieldChange(
          'protocolConfig.scriptCodeHashes.ckbBoostCampaignLockCodeHash',
          currentData.protocolConfig.scriptCodeHashes.ckbBoostCampaignLockCodeHash,
          formData.scriptCodeHashes?.ckbBoostCampaignLockCodeHash || currentData.protocolConfig.scriptCodeHashes.ckbBoostCampaignLockCodeHash
        ),
        ckbBoostUserTypeCodeHash: this.createFieldChange(
          'protocolConfig.scriptCodeHashes.ckbBoostUserTypeCodeHash',
          currentData.protocolConfig.scriptCodeHashes.ckbBoostUserTypeCodeHash,
          formData.scriptCodeHashes?.ckbBoostUserTypeCodeHash || currentData.protocolConfig.scriptCodeHashes.ckbBoostUserTypeCodeHash
        )
      },
      tippingConfig: {
        approvalRequirementThresholds: this.createFieldChange(
          'tippingConfig.approvalRequirementThresholds',
          currentData.tippingConfig.approvalRequirementThresholds,
          formData.tippingConfig?.approvalRequirementThresholds || currentData.tippingConfig.approvalRequirementThresholds
        ),
        expirationDuration: this.createFieldChange(
          'tippingConfig.expirationDuration',
          currentData.tippingConfig.expirationDuration,
          formData.tippingConfig?.expirationDuration || currentData.tippingConfig.expirationDuration
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
      return data.endorsersWhitelist
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
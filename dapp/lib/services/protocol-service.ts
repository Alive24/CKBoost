// Protocol Service - Abstracts data fetching logic
// This service decides whether to use mock data or real CKB blockchain data

import { ccc } from "@ckb-ccc/connector-react"
import {
  ProtocolData,
  ProtocolMetrics,
  ProtocolTransaction,
  UpdateProtocolConfigForm,
  UpdateScriptCodeHashesForm,
  UpdateTippingConfigForm,
  AddEndorserForm,
  EditEndorserForm,
  EndorserInfo,
  BatchUpdateProtocolForm,
  ProtocolChanges,
  FieldChange
} from "../types/protocol"
import { getMockProtocolData, getMockEndorsers, getMockTippingProposals, getMockApprovedCampaigns } from "../mock/mock-protocol"
import {
  fetchProtocolData,
  fetchProtocolMetrics,
  fetchProtocolTransactions,
  updateProtocolCell,
  generateProtocolData
} from "../ckb/protocol-cells"

// Configuration - Set to true when ready to use real CKB data
const USE_REAL_CKB_DATA = false

/**
 * Protocol service that abstracts data source (mock vs real CKB)
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
    if (USE_REAL_CKB_DATA && this.signer) {
      try {
        return await fetchProtocolData(this.signer)
      } catch (error) {
        console.warn("Failed to fetch real CKB protocol data, falling back to mock:", error)
        return getMockProtocolData()
      }
    }
    
    // Use mock data
    return getMockProtocolData()
  }

  /**
   * Get protocol metrics
   * @returns Protocol metrics
   */
  async getProtocolMetrics(): Promise<ProtocolMetrics> {
    if (USE_REAL_CKB_DATA && this.signer) {
      try {
        return await fetchProtocolMetrics(this.signer)
      } catch (error) {
        console.warn("Failed to fetch real protocol metrics, falling back to mock:", error)
        return this.getMockMetrics()
      }
    }

    // Use mock metrics
    return this.getMockMetrics()
  }

  /**
   * Get protocol transaction history
   * @param limit - Maximum number of transactions to fetch
   * @returns Array of protocol transactions
   */
  async getProtocolTransactions(limit: number = 50): Promise<ProtocolTransaction[]> {
    if (USE_REAL_CKB_DATA && this.signer) {
      try {
        return await fetchProtocolTransactions(this.signer, limit)
      } catch (error) {
        console.warn("Failed to fetch real protocol transactions, returning empty:", error)
        return []
      }
    }

    // Return empty array for mock data
    return []
  }

  /**
   * Update protocol configuration
   * @param form - Protocol configuration form data
   * @returns Transaction hash (mock: returns fake hash)
   */
  async updateProtocolConfig(form: UpdateProtocolConfigForm): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer required to update protocol configuration")
    }

    if (USE_REAL_CKB_DATA) {
      try {
        // Get current protocol data
        const currentData = await this.getProtocolData()
        
        // Update the protocol config
        const updatedData: ProtocolData = {
          ...currentData,
          protocolConfig: {
            ...currentData.protocolConfig,
            adminLockHashVec: form.adminLockHashes
          },
          lastUpdated: Date.now()
        }

        // Update on blockchain
        return await updateProtocolCell(this.signer, updatedData)
      } catch (error) {
        console.error("Failed to update protocol config on blockchain:", error)
        throw error
      }
    }

    // Mock implementation
    console.log("Mock: Updating protocol config with:", form)
    await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate network delay
    return "0x" + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join("")
  }

  /**
   * Update script code hashes
   * @param form - Script code hashes form data
   * @returns Transaction hash (mock: returns fake hash)
   */
  async updateScriptCodeHashes(form: UpdateScriptCodeHashesForm): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer required to update script code hashes")
    }

    if (USE_REAL_CKB_DATA) {
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
        console.error("Failed to update script code hashes on blockchain:", error)
        throw error
      }
    }

    // Mock implementation
    console.log("Mock: Updating script code hashes with:", form)
    await new Promise(resolve => setTimeout(resolve, 1000))
    return "0x" + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join("")
  }

  /**
   * Update tipping configuration
   * @param form - Tipping configuration form data
   * @returns Transaction hash (mock: returns fake hash)
   */
  async updateTippingConfig(form: UpdateTippingConfigForm): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer required to update tipping configuration")
    }

    if (USE_REAL_CKB_DATA) {
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
        console.error("Failed to update tipping config on blockchain:", error)
        throw error
      }
    }

    // Mock implementation
    console.log("Mock: Updating tipping config with:", form)
    await new Promise(resolve => setTimeout(resolve, 1000))
    return "0x" + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join("")
  }

  /**
   * Add endorser to whitelist
   * @param form - Endorser form data
   * @returns Transaction hash (mock: returns fake hash)
   */
  async addEndorser(form: AddEndorserForm): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer required to add endorser")
    }

    if (USE_REAL_CKB_DATA) {
      try {
        const currentData = await this.getProtocolData()
        
        // Create new endorser info
        const newEndorser: EndorserInfo = {
          endorserAddress: form.endorserAddress,
          endorserLockScript: form.endorserLockScript,
          endorserName: form.endorserName,
          endorserDescription: form.endorserDescription
        }

        // Add new endorser if not already present (check by address)
        const endorsers = currentData.endorsersWhitelist
        const exists = endorsers.some(e => e.endorserAddress === form.endorserAddress)
        
        if (!exists) {
          endorsers.push(newEndorser)
        }

        const updatedData: ProtocolData = {
          ...currentData,
          endorsersWhitelist: endorsers,
          lastUpdated: Date.now()
        }

        return await updateProtocolCell(this.signer, updatedData)
      } catch (error) {
        console.error("Failed to add endorser on blockchain:", error)
        throw error
      }
    }

    // Mock implementation
    console.log("Mock: Adding endorser with:", form)
    await new Promise(resolve => setTimeout(resolve, 1000))
    return "0x" + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join("")
  }

  /**
   * Edit existing endorser
   * @param form - Edit endorser form data (includes index)
   * @returns Transaction hash (mock: returns fake hash)
   */
  async editEndorser(form: EditEndorserForm): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer required to edit endorser")
    }

    if (USE_REAL_CKB_DATA) {
      try {
        const currentData = await this.getProtocolData()
        
        // Update endorser at specified index
        const endorsers = [...currentData.endorsersWhitelist]
        if (form.index >= 0 && form.index < endorsers.length) {
          endorsers[form.index] = {
            endorserAddress: form.endorserAddress,
            endorserLockScript: form.endorserLockScript,
            endorserName: form.endorserName,
            endorserDescription: form.endorserDescription
          }
        } else {
          throw new Error(`Invalid endorser index: ${form.index}`)
        }

        const updatedData: ProtocolData = {
          ...currentData,
          endorsersWhitelist: endorsers,
          lastUpdated: Date.now()
        }

        return await updateProtocolCell(this.signer, updatedData)
      } catch (error) {
        console.error("Failed to edit endorser on blockchain:", error)
        throw error
      }
    }

    // Mock implementation
    console.log("Mock: Editing endorser with:", form)
    await new Promise(resolve => setTimeout(resolve, 1000))
    return "0x" + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join("")
  }

  /**
   * Remove endorser from whitelist
   * @param index - Index of endorser to remove
   * @returns Transaction hash (mock: returns fake hash)
   */
  async removeEndorser(index: number): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer required to remove endorser")
    }

    if (USE_REAL_CKB_DATA) {
      try {
        const currentData = await this.getProtocolData()
        
        // Remove endorser at specified index
        const endorsers = [...currentData.endorsersWhitelist]
        if (index >= 0 && index < endorsers.length) {
          endorsers.splice(index, 1)
        } else {
          throw new Error(`Invalid endorser index: ${index}`)
        }

        const updatedData: ProtocolData = {
          ...currentData,
          endorsersWhitelist: endorsers,
          lastUpdated: Date.now()
        }

        return await updateProtocolCell(this.signer, updatedData)
      } catch (error) {
        console.error("Failed to remove endorser on blockchain:", error)
        throw error
      }
    }

    // Mock implementation
    console.log("Mock: Removing endorser at index:", index)
    await new Promise(resolve => setTimeout(resolve, 1000))
    return "0x" + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join("")
  }

  /**
   * Batch update protocol data with change tracking
   * @param form - Batch update form data
   * @returns Transaction hash (mock: returns fake hash)
   */
  async batchUpdateProtocol(form: BatchUpdateProtocolForm): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer required to update protocol")
    }

    if (USE_REAL_CKB_DATA) {
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
            scriptCodeHashes: {
              ckbBoostProtocolTypeCodeHash: form.scriptCodeHashes.ckbBoostProtocolTypeCodeHash,
              ckbBoostProtocolLockCodeHash: form.scriptCodeHashes.ckbBoostProtocolLockCodeHash,
              ckbBoostCampaignTypeCodeHash: form.scriptCodeHashes.ckbBoostCampaignTypeCodeHash,
              ckbBoostCampaignLockCodeHash: form.scriptCodeHashes.ckbBoostCampaignLockCodeHash,
              ckbBoostUserTypeCodeHash: form.scriptCodeHashes.ckbBoostUserTypeCodeHash
            }
          }
        }

        // Update tipping config if provided
        if (form.tippingConfig) {
          updatedData.tippingConfig = {
            approvalRequirementThresholds: form.tippingConfig.approvalRequirementThresholds,
            expirationDuration: form.tippingConfig.expirationDuration
          }
        }

        // Handle endorser operations if provided
        if (form.endorserOperations) {
          let endorsers = [...updatedData.endorsersWhitelist]

          // Remove endorsers (process in reverse order to maintain indices)
          if (form.endorserOperations.remove) {
            form.endorserOperations.remove.sort((a, b) => b - a).forEach(index => {
              if (index >= 0 && index < endorsers.length) {
                endorsers.splice(index, 1)
              }
            })
          }

          // Edit endorsers
          if (form.endorserOperations.edit) {
            form.endorserOperations.edit.forEach(editForm => {
              if (editForm.index >= 0 && editForm.index < endorsers.length) {
                endorsers[editForm.index] = {
                  endorserAddress: editForm.endorserAddress,
                  endorserLockScript: editForm.endorserLockScript,
                  endorserName: editForm.endorserName,
                  endorserDescription: editForm.endorserDescription
                }
              }
            })
          }

          // Add new endorsers
          if (form.endorserOperations.add) {
            form.endorserOperations.add.forEach(addForm => {
              const newEndorser: EndorserInfo = {
                endorserAddress: addForm.endorserAddress,
                endorserLockScript: addForm.endorserLockScript,
                endorserName: addForm.endorserName,
                endorserDescription: addForm.endorserDescription
              }
              
              // Check if endorser already exists
              const exists = endorsers.some(e => e.endorserAddress === addForm.endorserAddress)
              if (!exists) {
                endorsers.push(newEndorser)
              }
            })
          }

          updatedData.endorsersWhitelist = endorsers
        }

        // Update timestamp
        updatedData.lastUpdated = Date.now()

        return await updateProtocolCell(this.signer, updatedData)
      } catch (error) {
        console.error("Failed to batch update protocol on blockchain:", error)
        throw error
      }
    }

    // Mock implementation
    console.log("Mock: Batch updating protocol with:", form)
    await new Promise(resolve => setTimeout(resolve, 2000)) // Slightly longer delay for batch operation
    return "0x" + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join("")
  }

  /**
   * Calculate changes between current data and new form data
   * @param currentData - Current protocol data
   * @param formData - New form data
   * @returns Protocol changes object
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
          'adminLockHashes',
          currentData.protocolConfig.adminLockHashVec,
          formData.adminLockHashes || currentData.protocolConfig.adminLockHashVec
        )
      },
      scriptCodeHashes: {
        ckbBoostProtocolTypeCodeHash: this.createFieldChange(
          'ckbBoostProtocolTypeCodeHash',
          currentData.protocolConfig.scriptCodeHashes.ckbBoostProtocolTypeCodeHash,
          formData.scriptCodeHashes?.ckbBoostProtocolTypeCodeHash || currentData.protocolConfig.scriptCodeHashes.ckbBoostProtocolTypeCodeHash
        ),
        ckbBoostProtocolLockCodeHash: this.createFieldChange(
          'ckbBoostProtocolLockCodeHash',
          currentData.protocolConfig.scriptCodeHashes.ckbBoostProtocolLockCodeHash,
          formData.scriptCodeHashes?.ckbBoostProtocolLockCodeHash || currentData.protocolConfig.scriptCodeHashes.ckbBoostProtocolLockCodeHash
        ),
        ckbBoostCampaignTypeCodeHash: this.createFieldChange(
          'ckbBoostCampaignTypeCodeHash',
          currentData.protocolConfig.scriptCodeHashes.ckbBoostCampaignTypeCodeHash,
          formData.scriptCodeHashes?.ckbBoostCampaignTypeCodeHash || currentData.protocolConfig.scriptCodeHashes.ckbBoostCampaignTypeCodeHash
        ),
        ckbBoostCampaignLockCodeHash: this.createFieldChange(
          'ckbBoostCampaignLockCodeHash',
          currentData.protocolConfig.scriptCodeHashes.ckbBoostCampaignLockCodeHash,
          formData.scriptCodeHashes?.ckbBoostCampaignLockCodeHash || currentData.protocolConfig.scriptCodeHashes.ckbBoostCampaignLockCodeHash
        ),
        ckbBoostUserTypeCodeHash: this.createFieldChange(
          'ckbBoostUserTypeCodeHash',
          currentData.protocolConfig.scriptCodeHashes.ckbBoostUserTypeCodeHash,
          formData.scriptCodeHashes?.ckbBoostUserTypeCodeHash || currentData.protocolConfig.scriptCodeHashes.ckbBoostUserTypeCodeHash
        )
      },
      tippingConfig: {
        approvalRequirementThresholds: this.createFieldChange(
          'approvalRequirementThresholds',
          currentData.tippingConfig.approvalRequirementThresholds,
          formData.tippingConfig?.approvalRequirementThresholds || currentData.tippingConfig.approvalRequirementThresholds
        ),
        expirationDuration: this.createFieldChange(
          'expirationDuration',
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

  /**
   * Helper method to create field change objects
   */
  private createFieldChange<T>(fieldPath: string, oldValue: T, newValue: T): FieldChange<T> {
    return {
      fieldPath,
      oldValue,
      newValue,
      hasChanged: JSON.stringify(oldValue) !== JSON.stringify(newValue)
    }
  }

  /**
   * Get default protocol data (useful for initialization)
   * @returns Default ProtocolData
   */
  getDefaultProtocolData(): ProtocolData {
    return getMockProtocolData()
  }

  /**
   * Get mock metrics for fallback
   * @returns Mock protocol metrics
   */
  private getMockMetrics(): ProtocolMetrics {
    const data = getMockProtocolData()
    
    return {
      totalCampaigns: data.campaignsApproved.length,
      activeCampaigns: data.campaignsApproved.filter(c => c.status === 4).length,
      totalTippingProposals: data.tippingProposals.length,
      pendingTippingProposals: data.tippingProposals.filter(p => !p.tippingTransactionHash).length,
      totalEndorsers: data.endorsersWhitelist.length,
      lastUpdated: new Date(data.lastUpdated).toISOString()
    }
  }

  /**
   * Static method to get endorsers (for external use)
   * @param signer - Optional CCC signer
   * @returns Array of endorsers
   */
  static async getEndorsers(signer?: ccc.Signer): Promise<EndorserInfo[]> {
    if (USE_REAL_CKB_DATA && signer) {
      try {
        const data = await fetchProtocolData(signer)
        return data.endorsersWhitelist
      } catch (error) {
        console.warn("Failed to fetch real endorsers, falling back to mock:", error)
        return getMockEndorsers()
      }
    }
    
    return getMockEndorsers()
  }

  /**
   * Static method to check if using real CKB data
   * @returns Boolean indicating if real CKB data is enabled
   */
  static isUsingRealData(): boolean {
    return USE_REAL_CKB_DATA
  }

  /**
   * Static method to toggle data source (for development)
   * Note: In production, this should be controlled by environment variables
   */
  static toggleDataSource(): boolean {
    // This would typically be read-only in production
    console.warn("Data source toggle is for development only")
    return USE_REAL_CKB_DATA
  }
}

// Export utility functions for external use
export const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString()
}

export const formatLockHash = (hash: string, length: number = 10): string => {
  return hash.slice(0, length) + "..."
}

export const getCampaignStatusText = (status: number): string => {
  const statusMap = {
    0: "Created",
    1: "Funding", 
    2: "Reviewing",
    3: "Approved",
    4: "Active",
    5: "Completed"
  }
  return statusMap[status as keyof typeof statusMap] || "Unknown"
}

export const getQuestStatusText = (status: number): string => {
  const statusMap = {
    0: "Created",
    1: "Active", 
    2: "Completed",
    3: "Cancelled"
  }
  return statusMap[status as keyof typeof statusMap] || "Unknown"
}

// Export singleton instance for convenience
export const protocolService = new ProtocolService()
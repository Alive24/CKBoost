// Protocol cell management service for CKB blockchain integration
// This service handles protocol-level operations and ProtocolData management

import { ccc } from "@ckb-ccc/connector-react"
import {
  ProtocolData,
  ProtocolCell,
  ProtocolTransaction,
  ProtocolMetrics,
  UpdateProtocolConfigForm,
  ApproveCampaignForm,
  UpdateTippingConfigForm,
  UpdateScriptCodeHashesForm,
  AddEndorserForm,
  Script,
  ProtocolConfig,
  TippingConfig,
  CampaignData,
  ScriptCodeHashes,
  EndorserInfo
} from "@/lib/types/protocol"

// Get protocol type script from environment variables
const getProtocolTypeScript = (): Script => {
  const codeHash = process.env.NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH
  const hashType = process.env.NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE as "type" | "data" | "data1"
  const args = process.env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS || "0x"

  if (!codeHash) {
    // For development, use placeholder
    console.warn("NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH not configured, using placeholder")
    return {
      codeHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      hashType: "type",
      args: "0x"
    }
  }

  return {
    codeHash,
    hashType: hashType || "type",
    args
  }
}

export class ProtocolService {
  private signer?: ccc.Signer
  private protocolTypeScript: Script

  constructor(signer?: ccc.Signer) {
    this.signer = signer
    this.protocolTypeScript = getProtocolTypeScript()
  }

  /**
   * Fetch the current protocol cell from CKB blockchain
   */
  async getProtocolCell(): Promise<ProtocolCell | null> {
    if (!this.signer) {
      throw new Error("Signer required to fetch protocol cell")
    }

    try {
      const client = this.signer.client

      // Search for protocol cell by type script
      const cells = await client.findCells({
        script: this.protocolTypeScript,
        scriptType: "type",
        order: "desc", // Get latest cell
        limit: "0x1"
      })

      if (cells.length === 0) {
        return null
      }

      const cell = cells[0]
      return {
        outPoint: {
          txHash: cell.outPoint.txHash,
          index: parseInt(cell.outPoint.index, 16)
        },
        output: {
          capacity: cell.output.capacity,
          lock: cell.output.lock,
          type: cell.output.type
        },
        data: cell.outputData
      }
    } catch (error) {
      console.error("Failed to fetch protocol cell:", error)
      throw new Error("Failed to fetch protocol data from blockchain")
    }
  }

  /**
   * Parse ProtocolData from cell data using Molecule schema
   */
  parseProtocolData(cellData: string): ProtocolData {
    try {
      // TODO: Implement actual Molecule parsing when generated code is available
      // For now, return a default structure
      
      if (cellData === "0x" || !cellData || cellData.length < 4) {
        // Return default empty protocol data
        return this.getDefaultProtocolData()
      }

      // Placeholder parsing - replace with actual Molecule deserialization
      console.warn("Using placeholder ProtocolData parsing - implement with generated Molecule code")
      
      return this.getDefaultProtocolData()
    } catch (error) {
      console.error("Failed to parse ProtocolData:", error)
      throw new Error("Invalid protocol data format")
    }
  }

  /**
   * Generate ProtocolData Molecule bytes from data structure
   */
  generateProtocolData(data: ProtocolData): string {
    try {
      // TODO: Implement actual Molecule serialization when generated code is available
      // For now, return placeholder
      
      console.warn("Using placeholder ProtocolData generation - implement with generated Molecule code")
      
      // Return placeholder hex data
      return "0x" + Buffer.from(JSON.stringify(data)).toString('hex')
    } catch (error) {
      console.error("Failed to generate ProtocolData:", error)
      throw new Error("Failed to serialize protocol data")
    }
  }

  /**
   * Get current protocol data
   */
  async getProtocolData(): Promise<ProtocolData> {
    const cell = await this.getProtocolCell()
    if (!cell) {
      return this.getDefaultProtocolData()
    }
    return this.parseProtocolData(cell.data)
  }

  /**
   * Update protocol configuration
   */
  async updateProtocolConfig(form: UpdateProtocolConfigForm): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer required to update protocol configuration")
    }

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

      // Generate new protocol data
      const newData = this.generateProtocolData(updatedData)

      // Build and send transaction
      const tx = await this.buildUpdateTransaction(newData)
      const txHash = await this.signer.sendTransaction(tx)
      
      console.log("Protocol configuration updated, tx:", txHash)
      return txHash
    } catch (error) {
      console.error("Failed to update protocol configuration:", error)
      throw error
    }
  }

  /**
   * Update script code hashes
   */
  async updateScriptCodeHashes(form: UpdateScriptCodeHashesForm): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer required to update script code hashes")
    }

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

      const newData = this.generateProtocolData(updatedData)
      const tx = await this.buildUpdateTransaction(newData)
      const txHash = await this.signer.sendTransaction(tx)
      
      console.log("Script code hashes updated, tx:", txHash)
      return txHash
    } catch (error) {
      console.error("Failed to update script code hashes:", error)
      throw error
    }
  }

  /**
   * Update tipping configuration
   */
  async updateTippingConfig(form: UpdateTippingConfigForm): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer required to update tipping configuration")
    }

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

      const newData = this.generateProtocolData(updatedData)
      const tx = await this.buildUpdateTransaction(newData)
      const txHash = await this.signer.sendTransaction(tx)
      
      console.log("Tipping configuration updated, tx:", txHash)
      return txHash
    } catch (error) {
      console.error("Failed to update tipping configuration:", error)
      throw error
    }
  }

  /**
   * Add endorser to whitelist
   */
  async addEndorser(form: AddEndorserForm): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer required to add endorser")
    }

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

      const newData = this.generateProtocolData(updatedData)
      const tx = await this.buildUpdateTransaction(newData)
      const txHash = await this.signer.sendTransaction(tx)
      
      console.log("Endorser added, tx:", txHash)
      return txHash
    } catch (error) {
      console.error("Failed to add endorser:", error)
      throw error
    }
  }

  /**
   * Get protocol metrics
   */
  async getProtocolMetrics(): Promise<ProtocolMetrics> {
    try {
      const data = await this.getProtocolData()
      
      return {
        totalCampaigns: data.campaignsApproved.length,
        activeCampaigns: data.campaignsApproved.filter(c => c.status === 4).length,
        totalTippingProposals: data.tippingProposals.length,
        pendingTippingProposals: data.tippingProposals.filter(p => !p.tippingTransactionHash).length,
        totalEndorsers: data.endorsersWhitelist.length,
        lastUpdated: new Date(data.lastUpdated).toISOString()
      }
    } catch (error) {
      console.error("Failed to get protocol metrics:", error)
      // Return default metrics on error
      return {
        totalCampaigns: 0,
        activeCampaigns: 0,
        totalTippingProposals: 0,
        pendingTippingProposals: 0,
        totalEndorsers: 0,
        lastUpdated: new Date().toISOString()
      }
    }
  }

  /**
   * Get protocol transactions
   */
  async getProtocolTransactions(limit: number = 50): Promise<ProtocolTransaction[]> {
    // In a real implementation, this would query blockchain transaction history
    // For now, return empty array - implement when needed
    return []
  }

  // Private helper methods

  getDefaultProtocolData(): ProtocolData {
    return {
      campaignsApproved: [],
      tippingProposals: [],
      tippingConfig: {
        approvalRequirementThresholds: ["10000", "50000", "100000"],
        expirationDuration: 7 * 24 * 60 * 60 // 7 days in seconds
      },
      endorsersWhitelist: [],
      lastUpdated: Date.now(),
      protocolConfig: {
        adminLockHashVec: [],
        scriptCodeHashes: {
          ckbBoostProtocolTypeCodeHash: this.protocolTypeScript.codeHash,
          ckbBoostProtocolLockCodeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
          ckbBoostCampaignTypeCodeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
          ckbBoostCampaignLockCodeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
          ckbBoostUserTypeCodeHash: "0x0000000000000000000000000000000000000000000000000000000000000000"
        }
      }
    }
  }

  private async buildUpdateTransaction(newData: string): Promise<ccc.Transaction> {
    if (!this.signer) {
      throw new Error("Signer required to build transaction")
    }

    try {
      // Get current protocol cell
      const currentCell = await this.getProtocolCell()
      if (!currentCell) {
        throw new Error("Protocol cell not found")
      }

      // Build transaction to update protocol cell
      const tx = ccc.Transaction.from({
        inputs: [
          {
            previousOutput: {
              txHash: currentCell.outPoint.txHash,
              index: currentCell.outPoint.index
            },
            since: "0x0"
          }
        ],
        outputs: [
          {
            capacity: currentCell.output.capacity,
            lock: currentCell.output.lock,
            type: currentCell.output.type
          }
        ],
        outputsData: [newData],
        cellDeps: [],
        headerDeps: [],
        witnesses: []
      })

      // Complete transaction (add capacity, fees, etc.)
      await tx.completeInputsByCapacity(this.signer)
      await tx.completeFeeBy(this.signer, 1000) // 1000 shannons/byte fee rate

      return tx
    } catch (error) {
      console.error("Failed to build update transaction:", error)
      throw error
    }
  }
}

// Export singleton instance
export const protocolService = new ProtocolService()

// Export utility functions
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
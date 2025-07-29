// Deployment Manager - Manages deployment records for CKB contracts
// This module handles reading and updating deployment information

import deploymentsData from '../../../deployments.json'

export type Network = 'testnet' | 'mainnet'

export interface TypeScript {
  codeHash: string
  hashType: 'type' | 'data' | 'data1'
  args: string
}

export interface DeploymentRecord {
  transactionHash: string
  index: number
  deployedAt: string
  contractName: string
  deployerAddress?: string
  dataHash?: string
  contractSize?: number
  tag?: string
  isUpgrade?: boolean
  previousDeployment?: {
    transactionHash: string
    index: number
    deployedAt: string
    tag?: string
  }
  typeScript?: TypeScript
  isTypeId?: boolean
  typeHash?: string
  // Legacy fields for backward compatibility
  codeHash?: string
  hashType?: 'type' | 'data' | 'data1'
}

export interface DeploymentHistory {
  current: {
    testnet: {
      ckboostProtocolType: DeploymentRecord | null
      // Add other contract types as needed
    }
    mainnet: {
      ckboostProtocolType?: DeploymentRecord | null
      protocolType?: DeploymentRecord | null // Legacy field name
      // Add other contract types as needed
    }
  }
  history: {
    testnet: DeploymentRecord[]
    mainnet: DeploymentRecord[]
  }
}

export class DeploymentManager {
  private data: DeploymentHistory

  constructor() {
    // Load deployment data from JSON file
    this.data = deploymentsData as DeploymentHistory
  }

  /**
   * Get the current deployment for a specific contract on a network
   */
  getCurrentDeployment(network: Network, contractType: 'ckboostProtocolType'): DeploymentRecord | null {
    const networkData = this.data.current[network]
    
    // For mainnet, check both the new and legacy field names
    if (network === 'mainnet') {
      const mainnetData = networkData as typeof this.data.current.mainnet
      return mainnetData.ckboostProtocolType || mainnetData.protocolType || null
    }
    
    return networkData[contractType] || null
  }

  /**
   * Get the outpoint for a deployed contract
   */
  getContractOutPoint(network: Network, contractType: 'ckboostProtocolType'): { txHash: string; index: number } | null {
    const deployment = this.getCurrentDeployment(network, contractType)
    if (!deployment) return null
    
    return {
      txHash: deployment.transactionHash,
      index: deployment.index
    }
  }

  /**
   * Get the type script for a deployed contract
   */
  getContractTypeScript(network: Network, contractType: 'ckboostProtocolType'): TypeScript | null {
    const deployment = this.getCurrentDeployment(network, contractType)
    if (!deployment) return null
    
    // Use the typeScript field if available (new format)
    if (deployment.typeScript) {
      return deployment.typeScript
    }
    
    // Fallback to legacy fields
    if (deployment.codeHash && deployment.hashType) {
      return {
        codeHash: deployment.codeHash,
        hashType: deployment.hashType,
        args: '0x' // Default args for legacy format
      }
    }
    
    return null
  }

  /**
   * Get deployment history for a network
   */
  getHistory(network: Network): DeploymentRecord[] {
    return this.data.history[network] || []
  }

  /**
   * Add a new deployment (this would need to be called after successful deployment)
   * Note: In a browser environment, this would need to be handled differently
   * as we can't write to files directly
   */
  addDeployment(network: Network, contractType: 'ckboostProtocolType', deployment: DeploymentRecord): void {
    // Update current deployment
    this.data.current[network][contractType] = deployment
    
    // Add to history
    if (!this.data.history[network]) {
      this.data.history[network] = []
    }
    this.data.history[network].push(deployment)
    
    // In a real implementation, you'd want to persist this
    // For now, we'll just log it
    console.log('New deployment added:', deployment)
    console.log('To persist, update deployments.json with:', JSON.stringify(this.data, null, 2))
  }

  /**
   * Get the current network based on environment
   */
  static getCurrentNetwork(): Network {
    // You can determine this from environment variables or CKB client
    const isMainnet = process.env.NEXT_PUBLIC_CKB_NETWORK === 'mainnet'
    return isMainnet ? 'mainnet' : 'testnet'
  }
}

// Export singleton instance
export const deploymentManager = new DeploymentManager()
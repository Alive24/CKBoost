"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { ccc } from "@ckb-ccc/connector-react"
import { 
  ProtocolData, 
  EndorserInfo,
  TippingProposalData,
  CampaignData
} from '../types'
import {
  ProtocolMetrics, 
  ProtocolTransaction,
  UpdateProtocolConfigForm,
  UpdateScriptCodeHashesForm,
  UpdateTippingConfigForm,
  AddEndorserForm,
  EditEndorserForm,
  BatchUpdateProtocolForm,
  ProtocolChanges
} from '../types/protocol'
import { ProtocolService } from '../services/protocol-service'
import { bufferToHex } from '../utils/type-converters'

// Types for protocol provider
interface ProtocolContextType {
  // Protocol data
  protocolData: ProtocolData | null
  metrics: ProtocolMetrics | null
  transactions: ProtocolTransaction[]
  isLoading: boolean
  error: string | null
  
  // Protocol operations
  refreshProtocolData: () => Promise<void>
  updateProtocolConfig: (form: UpdateProtocolConfigForm) => Promise<string>
  updateScriptCodeHashes: (form: UpdateScriptCodeHashesForm) => Promise<string>
  updateTippingConfig: (form: UpdateTippingConfigForm) => Promise<string>
  addEndorser: (form: AddEndorserForm) => Promise<string>
  editEndorser: (form: EditEndorserForm) => Promise<string>
  removeEndorser: (index: number) => Promise<string>
  batchUpdateProtocol: (form: BatchUpdateProtocolForm) => Promise<string>
  calculateChanges: (formData: any) => ProtocolChanges
  
  // Helper getters
  getEndorser: (address: string) => EndorserInfo | undefined
  getTippingProposal: (index: number) => TippingProposalData | undefined
  getApprovedCampaign: (id: string) => CampaignData | undefined
  
  // User-specific data
  userAddress: string | null
  userBalance: string | null
  isWalletConnected: boolean
  isAdmin: boolean
}

// Create context
const ProtocolContext = createContext<ProtocolContextType | undefined>(undefined)

// Provider component
export function ProtocolProvider({ children }: { children: ReactNode }) {
  // Protocol data state
  const [protocolData, setProtocolData] = useState<ProtocolData | null>(null)
  const [metrics, setMetrics] = useState<ProtocolMetrics | null>(null)
  const [transactions, setTransactions] = useState<ProtocolTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // User state
  const [userAddress, setUserAddress] = useState<string | null>(null)
  const [userBalance, setUserBalance] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  // CCC hooks
  const signer = ccc.useSigner()

  // Wallet connection state
  const isWalletConnected = !!signer

  // Initialize protocol data
  useEffect(() => {
    const initializeProtocol = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        // Use protocol service to get data (mock or real CKB)
        const service = new ProtocolService(signer)
        
        const [data, metricsData, transactionsData] = await Promise.all([
          service.getProtocolData(),
          service.getProtocolMetrics(),
          service.getProtocolTransactions()
        ])
        
        setProtocolData(data)
        setMetrics(metricsData)
        setTransactions(transactionsData)
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load protocol data')
        console.error('Failed to initialize protocol data:', err)
        
        // Try to load default data as fallback
        try {
          const service = new ProtocolService()
          const defaultData = await service.getDefaultProtocolData()
          setProtocolData(defaultData)
        } catch (fallbackErr) {
          console.error('Failed to load fallback data:', fallbackErr)
        }
      } finally {
        setIsLoading(false)
      }
    }

    initializeProtocol()
  }, [signer])

  // Update user info when wallet connects
  useEffect(() => {
    if (!signer) {
      setUserAddress(null)
      setUserBalance(null)
      setIsAdmin(false)
      return
    }

    const updateUserInfo = async () => {
      try {
        // Get user address
        const addr = await signer.getRecommendedAddress()
        setUserAddress(addr)

        // Get user balance
        const balance = await signer.getBalance()
        setUserBalance(ccc.fixedPointToString(balance))

        // Check if user is admin
        if (protocolData) {
          // Convert address to lock hash for admin check
          // This is a simplified check - in practice you'd need to derive the lock hash properly
          const userLockHash = addr // Simplified - would need proper conversion
          const isUserAdmin = protocolData.protocol_config.admin_lock_hash_vec.some(
            (adminHash: any) => {
              const hashHex = typeof adminHash === 'string' ? adminHash : bufferToHex(adminHash)
              return hashHex.toLowerCase().includes(userLockHash.toLowerCase())
            }
          )
          setIsAdmin(isUserAdmin)
        }

      } catch (err) {
        console.error('Failed to update user info:', err)
      }
    }

    updateUserInfo()
  }, [signer, protocolData])

  // Protocol operations
  const refreshProtocolData = async (): Promise<void> => {
    try {
      setIsLoading(true)
      setError(null)
      
      const service = new ProtocolService(signer)
      const [data, metricsData, transactionsData] = await Promise.all([
        service.getProtocolData(),
        service.getProtocolMetrics(),
        service.getProtocolTransactions()
      ])
      
      setProtocolData(data)
      setMetrics(metricsData)
      setTransactions(transactionsData)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh protocol data')
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const updateProtocolConfig = async (form: UpdateProtocolConfigForm): Promise<string> => {
    if (!signer) {
      throw new Error("Wallet connection required")
    }

    try {
      const service = new ProtocolService(signer)
      const txHash = await service.updateProtocolConfig(form)
      
      // Refresh data after successful update
      await refreshProtocolData()
      
      return txHash
    } catch (err) {
      console.error('Failed to update protocol config:', err)
      throw err
    }
  }

  const updateScriptCodeHashes = async (form: UpdateScriptCodeHashesForm): Promise<string> => {
    if (!signer) {
      throw new Error("Wallet connection required")
    }

    try {
      const service = new ProtocolService(signer)
      const txHash = await service.updateScriptCodeHashes(form)
      
      // Refresh data after successful update
      await refreshProtocolData()
      
      return txHash
    } catch (err) {
      console.error('Failed to update script code hashes:', err)
      throw err
    }
  }

  const updateTippingConfig = async (form: UpdateTippingConfigForm): Promise<string> => {
    if (!signer) {
      throw new Error("Wallet connection required")
    }

    try {
      const service = new ProtocolService(signer)
      const txHash = await service.updateTippingConfig(form)
      
      // Refresh data after successful update
      await refreshProtocolData()
      
      return txHash
    } catch (err) {
      console.error('Failed to update tipping config:', err)
      throw err
    }
  }

  const addEndorser = async (form: AddEndorserForm): Promise<string> => {
    if (!signer) {
      throw new Error("Wallet connection required")
    }

    try {
      const service = new ProtocolService(signer)
      const txHash = await service.addEndorser(form)
      
      // Refresh data after successful update
      await refreshProtocolData()
      
      return txHash
    } catch (err) {
      console.error('Failed to add endorser:', err)
      throw err
    }
  }

  const editEndorser = async (form: EditEndorserForm): Promise<string> => {
    if (!signer) {
      throw new Error("Wallet connection required")
    }

    try {
      const service = new ProtocolService(signer)
      const txHash = await service.editEndorser(form)
      
      // Refresh data after successful update
      await refreshProtocolData()
      
      return txHash
    } catch (err) {
      console.error('Failed to edit endorser:', err)
      throw err
    }
  }

  const removeEndorser = async (index: number): Promise<string> => {
    if (!signer) {
      throw new Error("Wallet connection required")
    }

    try {
      const service = new ProtocolService(signer)
      const txHash = await service.removeEndorser(index)
      
      // Refresh data after successful update
      await refreshProtocolData()
      
      return txHash
    } catch (err) {
      console.error('Failed to remove endorser:', err)
      throw err
    }
  }

  const batchUpdateProtocol = async (form: BatchUpdateProtocolForm): Promise<string> => {
    if (!signer) {
      throw new Error("Wallet connection required")
    }

    try {
      const service = new ProtocolService(signer)
      const txHash = await service.batchUpdateProtocol(form)
      
      // Refresh data after successful update
      await refreshProtocolData()
      
      return txHash
    } catch (err) {
      console.error('Failed to batch update protocol:', err)
      throw err
    }
  }

  const calculateChanges = (formData: any): ProtocolChanges => {
    if (!protocolData) {
      throw new Error("Protocol data not available")
    }

    const service = new ProtocolService(signer)
    return service.calculateChanges(protocolData, formData)
  }

  // Helper functions
  const getEndorser = (address: string): EndorserInfo | undefined => {
    return protocolData?.endorsers_whitelist.find((e: any) => e.endorserAddress === address)
  }

  const getTippingProposal = (index: number): TippingProposalData | undefined => {
    return protocolData?.tipping_proposals[index]
  }

  const getApprovedCampaign = (id: string): CampaignData | undefined => {
    return protocolData?.campaigns_approved.find((c: any) => c.id === id)
  }

  const value: ProtocolContextType = {
    // Protocol data
    protocolData,
    metrics,
    transactions,
    isLoading,
    error,
    
    // Protocol operations
    refreshProtocolData,
    updateProtocolConfig,
    updateScriptCodeHashes,
    updateTippingConfig,
    addEndorser,
    editEndorser,
    removeEndorser,
    batchUpdateProtocol,
    calculateChanges,
    
    // Helper getters
    getEndorser,
    getTippingProposal,
    getApprovedCampaign,
    
    // User-specific data
    userAddress,
    userBalance,
    isWalletConnected,
    isAdmin,
  }

  return (
    <ProtocolContext.Provider value={value}>
      {children}
    </ProtocolContext.Provider>
  )
}

// Hook to use protocol context
export function useProtocol() {
  const context = useContext(ProtocolContext)
  if (context === undefined) {
    throw new Error('useProtocol must be used within a ProtocolProvider')
  }
  return context
}

// Helper hook for admin-specific operations
export function useProtocolAdmin() {
  const context = useProtocol()
  
  if (!context.isWalletConnected) {
    throw new Error('Wallet connection required for admin operations')
  }
  
  if (!context.isAdmin) {
    throw new Error('Admin privileges required for this operation')
  }
  
  return {
    updateProtocolConfig: context.updateProtocolConfig,
    updateScriptCodeHashes: context.updateScriptCodeHashes,
    updateTippingConfig: context.updateTippingConfig,
    addEndorser: context.addEndorser,
    refreshProtocolData: context.refreshProtocolData,
    protocolData: context.protocolData,
    metrics: context.metrics,
    isLoading: context.isLoading,
    error: context.error
  }
}

// Helper hook for endorser-specific data
export function useEndorser(address?: string) {
  const { getEndorser, protocolData, isLoading } = useProtocol()
  
  const endorser = address ? getEndorser(address) : undefined
  const allEndorsers = protocolData?.endorsers_whitelist || []
  
  return {
    endorser,
    allEndorsers,
    isLoading,
    exists: !!endorser,
    totalEndorsers: allEndorsers.length
  }
}

// Helper hook for tipping proposal data
export function useTippingProposals() {
  const { protocolData, isLoading } = useProtocol()
  
  const proposals = protocolData?.tipping_proposals || []
  const pendingProposals = proposals.filter((p: any) => !p.tippingTransactionHash)
  const completedProposals = proposals.filter((p: any) => !!p.tippingTransactionHash)
  
  return {
    proposals,
    pendingProposals,
    completedProposals,
    isLoading,
    totalProposals: proposals.length,
    pendingCount: pendingProposals.length,
    completedCount: completedProposals.length
  }
}
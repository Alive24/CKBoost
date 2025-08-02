"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { ccc, mol } from "@ckb-ccc/connector-react"
import type { CampaignDataLike, UserProgressDataLike } from "ssri-ckboost/types"
import { CampaignService } from '../services/campaign-service'
import { type MockCampaignData } from '../ckb/campaign-cells'
import { hexToString, getCampaignStatus, calculateCampaignTotalRewards, decodeVerificationRequirements, getDifficultyString, getTimeEstimateString, formatTimestamp } from '../types'

// Types for campaign provider
interface CampaignContextType {
  campaigns: CampaignDataLike[]
  featuredCampaigns: ccc.Hex[]
  isLoading: boolean
  error: string | null
  
  // Campaign operations
  getCampaignByTypeHash: (typeHash: string) => CampaignDataLike | undefined
  getUserProgress: (campaignTypeHash: string) => UserProgressDataLike | undefined
  refreshCampaigns: () => Promise<void>
  
  // User-specific data
  userAddress: string | null
  userBalance: string | null
  isWalletConnected: boolean
}

// Create context
const CampaignContext = createContext<CampaignContextType | undefined>(undefined)

// Provider component
export function CampaignProvider({ children }: { children: ReactNode }) {
  // Campaign data state
  const [campaigns, setCampaigns] = useState<CampaignDataLike[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // User state
  const [userAddress, setUserAddress] = useState<string | null>(null)
  const [userBalance, setUserBalance] = useState<string | null>(null)
  const [userProgress, setUserProgress] = useState<Map<string, UserProgressDataLike>>(new Map())

  // CCC hooks
  const signer = ccc.useSigner()

  // Wallet connection state
  const isWalletConnected = !!signer

  // Initialize campaigns data
  useEffect(() => {
    const initializeCampaigns = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        // Use campaign service to get data (mock or real CKB)
        const allCampaigns = await CampaignService.getAllCampaigns(signer)
        // Convert to UI format
        setCampaigns(allCampaigns)
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load campaigns')
      } finally {
        setIsLoading(false)
      }
    }

    initializeCampaigns()
  }, [signer])

  // Update user info when wallet connects
  useEffect(() => {
    if (!signer) {
      setUserAddress(null)
      setUserBalance(null)
      setUserProgress(new Map())
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

        // Get user progress from CKB or mock data
        const progress = await CampaignService.getUserProgress(addr, signer)
        setUserProgress(progress)

      } catch (err) {
        console.error('Failed to update user info:', err)
      }
    }

    updateUserInfo()
  }, [signer])

  // Helper functions
  const getCampaignByTypeHash = (typeHash: ccc.Hex): CampaignDataLike | undefined => {
    return campaigns.find(c => c.metadata.typeHash === typeHash)
  }

  const getUserProgress = (campaignTypeHash: string): UserProgressDataLike | undefined => {
    return userProgress.get(campaignTypeHash)
  }

  const refreshCampaigns = async (): Promise<void> => {
    try {
      setIsLoading(true)
      setError(null)
      
      // Refresh from service
      const allCampaigns = await CampaignService.getAllCampaigns(signer)
      // Convert to UI format
      const uiCampaigns = allCampaigns.map(mockCampaignToUIFormat)
      setCampaigns(uiCampaigns)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh campaigns')
    } finally {
      setIsLoading(false)
    }
  }

  // Featured campaigns (first 4)
  const featuredCampaigns = campaigns.slice(0, 4)

  const value: CampaignContextType = {
    campaigns,
    featuredCampaigns,
    isLoading,
    error,
    getCampaignByTypeHash,
    getUserProgress,
    refreshCampaigns,
    userAddress,
    userBalance,
    isWalletConnected,
  }

  return (
    <CampaignContext.Provider value={value}>
      {children}
    </CampaignContext.Provider>
  )
}

// Hook to use campaign context
export function useCampaigns() {
  const context = useContext(CampaignContext)
  if (context === undefined) {
    throw new Error('useCampaigns must be used within a CampaignProvider')
  }
  return context
}

// Helper hook for campaign-specific data
export function useCampaign(typeHash: string) {
  const { getCampaignByTypeHash, getUserProgress, isLoading } = useCampaigns()
  
  const campaign = getCampaignByTypeHash(typeHash)
  const userProgress = getUserProgress(typeHash)
  
  return {
    campaign,
    userProgress,
    isLoading,
    exists: !!campaign
  }
}
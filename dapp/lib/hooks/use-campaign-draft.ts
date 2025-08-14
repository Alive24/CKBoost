import { useState, useEffect, useCallback } from 'react'
import { CampaignData, type CampaignDataLike } from 'ssri-ckboost/types'
import { ccc } from '@ckb-ccc/connector-react'

const DRAFT_KEY_PREFIX = 'ckboost_campaign_draft_'
const DRAFTS_LIST_KEY = 'ckboost_campaign_drafts'

export function useCampaignDraft(campaignTypeId?: string) {
  const draftKey = campaignTypeId 
    ? `${DRAFT_KEY_PREFIX}${campaignTypeId}` 
    : `${DRAFT_KEY_PREFIX}new`

  const [draft, setDraft] = useState<CampaignDataLike | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load draft from local storage
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(draftKey)
      if (savedDraft) {
        // Decode the saved hex string back to CampaignDataLike
        const bytes = ccc.bytesFrom(savedDraft)
        const campaignData = CampaignData.decode(bytes)
        setDraft(campaignData)
      }
    } catch (error) {
      console.error('Failed to load draft:', error)
    } finally {
      setIsLoading(false)
    }
  }, [draftKey])

  // Save draft to local storage
  const saveDraft = useCallback((draftData: CampaignDataLike) => {
    try {
      // Encode the campaign data to hex string for storage
      const encoded = CampaignData.encode(draftData)
      const hexString = ccc.hexFrom(encoded)
      localStorage.setItem(draftKey, hexString)
      
      // Update drafts list
      const draftsList = getDraftsList()
      const draftInfo = {
        key: draftKey,
        title: extractTitle(draftData),
        lastSaved: Date.now(),
        campaignTypeId: campaignTypeId || null
      }
      
      const existingIndex = draftsList.findIndex(d => d.key === draftKey)
      if (existingIndex >= 0) {
        draftsList[existingIndex] = draftInfo
      } else {
        draftsList.push(draftInfo)
      }
      
      localStorage.setItem(DRAFTS_LIST_KEY, JSON.stringify(draftsList))
      setDraft(draftData)
      
      return true
    } catch (error) {
      console.error('Failed to save draft:', error)
      return false
    }
  }, [draftKey, campaignTypeId])

  // Delete draft
  const deleteDraft = useCallback(() => {
    try {
      localStorage.removeItem(draftKey)
      
      // Update drafts list
      const draftsList = getDraftsList()
      const filtered = draftsList.filter(d => d.key !== draftKey)
      localStorage.setItem(DRAFTS_LIST_KEY, JSON.stringify(filtered))
      
      setDraft(null)
      return true
    } catch (error) {
      console.error('Failed to delete draft:', error)
      return false
    }
  }, [draftKey])

  // Auto-save functionality
  const autoSave = useCallback((draftData: CampaignDataLike) => {
    // Debounced auto-save logic could be added here
    return saveDraft(draftData)
  }, [saveDraft])

  return {
    draft,
    isLoading,
    saveDraft,
    deleteDraft,
    autoSave
  }
}

// Get list of all drafts
export function getDraftsList(): Array<{
  key: string
  title: string
  lastSaved: number
  campaignTypeId: string | null
}> {
  try {
    const saved = localStorage.getItem(DRAFTS_LIST_KEY)
    return saved ? JSON.parse(saved) : []
  } catch {
    return []
  }
}

// Helper to extract title from CampaignDataLike
function extractTitle(data: CampaignDataLike): string {
  try {
    // Decode the title from the metadata
    const titleBytes = data.metadata.title
    const titleHex = ccc.hexFrom(titleBytes)
    const titleString = new TextDecoder().decode(ccc.bytesFrom(titleHex))
    return titleString || 'Untitled Campaign'
  } catch {
    return 'Untitled Campaign'
  }
}
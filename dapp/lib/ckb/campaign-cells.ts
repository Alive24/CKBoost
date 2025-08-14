// CKB Blockchain Integration - Campaign Cell Operations
// This file contains functions to interact with CKB blockchain for campaign data

import { ccc } from "@ckb-ccc/core"
import { cccA } from "@ckb-ccc/core/advanced";
import type { UserSubmissionRecordLike, ConnectedTypeIDLike } from "ssri-ckboost/types"
import { ConnectedTypeID } from "ssri-ckboost/types"
import { debug } from "@/lib/utils/debug"
import { fetchProtocolCell } from "./protocol-cells"

// Development flag - set to true to use blockchain, false to use mock data
const USE_BLOCKCHAIN = true // Set to true when blockchain is available

/**
 * Fetch all campaign cells from CKB blockchain or return mock data
 * @param signer - CCC signer instance (optional when using mock data)
 * @returns Array of campaigns from blockchain or mock data
 */
export async function fetchCampaignCells(signer?: ccc.Signer): Promise<ccc.Cell[]> {
  if (!signer) {
    throw new Error("Signer required when USE_BLOCKCHAIN is true")
  }

  try {
    // TODO: Implement actual CKB cell fetching
    // const client = signer.client
    
    // Search for campaign cells by type script
    // const campaignCells = await client.findCells({
    //   script: CAMPAIGN_TYPE_SCRIPT,
    //   scriptType: "type"
    // })

    // Parse campaign data from cells
    // const campaigns = campaignCells.map(cell => parseCampaignCell(cell))
    
    // For now, return empty array - replace with actual implementation
    return []
  } catch (error) {
    console.error("Failed to fetch campaign cells:", error)
    throw new Error("Failed to fetch campaigns from blockchain")
  }
}

/**
 * Fetch a specific campaign by type ID (O(1) lookup)
 * @param typeId - Campaign type ID from ConnectedTypeID args
 * @param campaignCodeHash - Campaign type code hash from protocol
 * @param signer - CCC signer instance
 * @returns Campaign data or undefined if not found
 */
export async function fetchCampaignByTypeId(
  typeId: ccc.Hex,
  campaignCodeHash: ccc.Hex,
  signer: ccc.Signer
): Promise<ccc.Cell | undefined> {
  if (!signer) {
    throw new Error("Signer required for fetchCampaignByTypeId")
  }

  try {
    debug.group('fetchCampaignByTypeId')
    debug.log('Searching for campaign with type ID:', typeId)
    debug.log('Campaign code hash:', campaignCodeHash)
    
    const client = signer.client
    
    // First, get the protocol cell to find the connected type hash
    const protocolCell = await fetchProtocolCell(signer)
    if (!protocolCell || !protocolCell.cellOutput.type) {
      debug.error("Protocol cell not found or has no type script")
      debug.groupEnd()
      return undefined
    }
    
    const protocolTypeHash = protocolCell.cellOutput.type.hash()
    debug.log('Protocol type hash:', protocolTypeHash)
    
    // Construct the ConnectedTypeID args
    const connectedTypeId: ConnectedTypeIDLike = {
      type_id: typeId,
      connected_key: protocolTypeHash
    }
    
    // Encode the ConnectedTypeID args
    const encodedArgs = ConnectedTypeID.encode(connectedTypeId)
    const argsHex = ccc.hexFrom(encodedArgs)
    
    debug.log('Constructed ConnectedTypeID args:', argsHex)
    
    // Create exact search key for the campaign with these specific args
    const searchKey: cccA.ClientCollectableSearchKeyLike = {
      script: {
        codeHash: campaignCodeHash,
        hashType: "type" as const,
        args: argsHex
      },
      scriptType: "type",
      scriptSearchMode: "exact"
    }
    
    debug.log('Searching with exact args match')
    
    // This should return at most one cell (O(1) lookup)
    for await (const cell of client.findCells(searchKey)) {
      debug.log('✅ Found campaign cell with type ID:', typeId)
      debug.groupEnd()
      return cell
    }
    
    debug.warn('No campaign found with type ID:', typeId)
    debug.groupEnd()
    return undefined
    
  } catch (error) {
    debug.error(`Failed to fetch campaign by type ID ${typeId}:`, error)
    debug.groupEnd()
    return undefined
  }
}



/**
 * Fetch user progress for all campaigns or return empty map for mock data
 * @param userAddress - User's CKB address
 * @param signer - CCC signer instance (optional when using mock data)
 * @returns Map of campaign type hash to user progress
 */
export async function fetchUserSubmissionRecords(_userAddress: string, signer?: ccc.Signer): Promise<Map<string, UserSubmissionRecordLike>> {
  if (!USE_BLOCKCHAIN) {
    // Return empty map for mock data - user progress is not mocked
    console.log("User progress not available in mock mode")
    return new Map()
  }

  if (!signer) {
    return new Map()
  }

  try {
    // TODO: Implement user progress cell fetching
    // const client = signer.client
    
    // Search for user progress cells by lock script
    // const userLockScript = addressToScript(userAddress)
    // const progressCells = await client.findCells({
    //   script: userLockScript,
    //   scriptType: "lock",
    //   filter: {
    //     script: USER_PROGRESS_TYPE_SCRIPT
    //   }
    // })

    // Parse progress data from cells
    // const progressMap = new Map<string, UserProgress>()
    // progressCells.forEach(cell => {
    //   const progress = parseUserProgressCell(cell)
    //   progressMap.set(progress.campaignTypeId, progress)
    // })
    
    // return progressMap
    
    return new Map()
    
  } catch (error) {
    console.error("Failed to fetch user progress:", error)
    return new Map()
  }
}

/**
 * Fetch all campaign cells owned by the current user
 * @param signer - CCC signer instance with user's lock script
 * @param campaignCodeHash - Campaign type code hash from protocol data
 * @returns Array of campaign cells owned by the user
 */
export async function fetchCampaignsOwnedByUser(
  signer: ccc.Signer,
  campaignCodeHash: ccc.Hex
): Promise<ccc.Cell[]> {
  debug.group('fetchCampaignsOwnedByUser')
  debug.log('Input parameters:', {
    campaignCodeHash,
    signerPresent: !!signer
  })

  if (!signer) {
    debug.error("Signer is required to fetch campaigns")
    debug.groupEnd()
    throw new Error("Signer is required to fetch campaigns")
  }

  try {
    const client = signer.client
    const { script: userLockScript } = await signer.getRecommendedAddressObj()
    
    debug.log('User lock script:', {
      codeHash: userLockScript.codeHash,
      hashType: userLockScript.hashType,
      args: userLockScript.args
    })
    
    // Search for campaign cells locked by the user's lock script
    debug.log('Searching for campaign cells owned by user...')
    debug.time('Campaign cell search')
    
    // First, search for all cells locked by the user
    const searchKey = {
      script: userLockScript,
      scriptType: "lock" as const,
      scriptSearchMode: "exact" as const
    }
    
    debug.log('Search parameters:', searchKey)
    
    // Collect cells that are campaigns (have the campaign type script)
    const campaignCells: ccc.Cell[] = []
    try {
      for await (const cell of client.findCells(searchKey)) {
        // Check if this cell has the campaign type script
        if (cell.cellOutput.type && 
            cell.cellOutput.type.codeHash === campaignCodeHash &&
            cell.cellOutput.type.hashType === "type") {
          debug.log('Found campaign cell owned by user:', {
            typeHash: cell.cellOutput.type.hash(),
            capacity: cell.cellOutput.capacity
          })
          campaignCells.push(cell)
        }
        if (campaignCells.length >= 100) break // Limit to 100 campaigns
      }
    } catch (iterError) {
      debug.warn('Error iterating cells:', iterError)
    }
    
    debug.timeEnd('Campaign cell search')
    debug.info(`✨ Found ${campaignCells.length} campaigns owned by user`)
    debug.groupEnd()
    return campaignCells
    
  } catch (error) {
    debug.error("Failed to fetch user's campaigns:", error)
    debug.groupEnd()
    return []
  }
}

/**
 * Fetch all campaign cells connected to a specific protocol
 * @param signer - CCC signer instance
 * @param campaignCodeHash - Campaign type code hash from protocol data
 * @param protocolTypeHash - Protocol type hash to filter campaigns
 * @returns Array of campaign cells connected to the protocol
 */
/**
 * Extract type_id from a campaign cell's ConnectedTypeID args
 * @param cell - Campaign cell with ConnectedTypeID args
 * @returns Type ID or undefined if extraction fails
 */
export function extractTypeIdFromCampaignCell(cell: ccc.Cell): ccc.Hex | undefined {
  try {
    if (!cell.cellOutput.type || !cell.cellOutput.type.args) {
      return undefined
    }
    
    const argsBytes = ccc.bytesFrom(cell.cellOutput.type.args)
    const connectedTypeId = ConnectedTypeID.decode(argsBytes) as ConnectedTypeIDLike
    
    return connectedTypeId.type_id as ccc.Hex
  } catch (error) {
    debug.warn("Failed to extract type_id from campaign cell:", error)
    return undefined
  }
}


/**
 * Check if a campaign is approved by comparing with campaigns_approved list
 * Only uses type_id for campaign approval checks
 * @param campaignTypeId - Campaign type ID
 * @param approvedList - List of approved campaign type IDs
 * @returns Boolean indicating if campaign is approved
 */
export function isCampaignApproved(
  campaignTypeId: ccc.Hex | undefined,
  approvedList: ccc.Hex[] | undefined
): boolean {
  if (!campaignTypeId || !approvedList || approvedList.length === 0) {
    return false
  }
  
  return approvedList.some((identifier: ccc.Hex) => {
    // Check if it matches the type_id
    const matches = identifier.toLowerCase() === campaignTypeId.toLowerCase()
    
    if (matches) {
      debug.log('Campaign is approved:', {
        campaignTypeId,
        identifier
      })
    }
    
    return matches
  })
}

export async function fetchCampaignsConnectedToProtocol(
  signer: ccc.Signer,
  campaignCodeHash: ccc.Hex,
  protocolTypeHash: ccc.Hex
): Promise<ccc.Cell[]> {
  debug.group('fetchCampaignsConnectedToProtocol')
  debug.log('Input parameters:', {
    campaignCodeHash,
    protocolTypeHash,
    signerPresent: !!signer
  })

  if (!signer) {
    debug.error("Signer is required to fetch campaigns")
    debug.groupEnd()
    throw new Error("Signer is required to fetch campaigns")
  }

  try {
    const client = signer.client
    debug.log('CKB Client initialized:', !!client)
    
    // Search for all campaign cells by code hash
    debug.log('Searching for campaign cells with code hash:', campaignCodeHash)
    debug.time('Campaign cell search')
    
    // Create a proper search key for campaigns with this code hash
    const searchKey = {
      script: {
        codeHash: campaignCodeHash,
        hashType: "type" as const,
        args: "0x" // Empty args to match all campaigns
      },
      scriptType: "type" as const,
      scriptSearchMode: "prefix" as const
    }
    
    debug.log('Search parameters:', searchKey)
    
    // Use the async iterator to collect cells
    const campaignCells: ccc.Cell[] = []
    try {
      for await (const cell of client.findCells(searchKey)) {
        campaignCells.push(cell)
        if (campaignCells.length >= 100) break // Limit to 100 campaigns
      }
    } catch (iterError) {
      debug.warn('Error iterating cells:', iterError)
    }
    
    debug.timeEnd('Campaign cell search')
    debug.log(`Found ${campaignCells.length} total campaign cells`)
    
    // Filter campaigns connected to our protocol
    const connectedCampaigns: ccc.Cell[] = []
    
    for (const cell of campaignCells) {
      try {
        // Parse the campaign type args as ConnectedTypeID
        if (cell.cellOutput.type && cell.cellOutput.type.args) {
          debug.log('Parsing campaign cell:', {
            typeHash: cell.cellOutput.type?.hash(),
            args: cell.cellOutput.type.args
          })
          
          const argsBytes = ccc.bytesFrom(cell.cellOutput.type.args)
          const connectedTypeId = ConnectedTypeID.decode(argsBytes) as ConnectedTypeIDLike
          
          debug.log('Parsed ConnectedTypeID:', {
            type_id: connectedTypeId.type_id,
            connected_key: connectedTypeId.connected_key
          })
          
          // Check if this campaign is connected to our protocol
          if (connectedTypeId.connected_key === protocolTypeHash) {
            debug.log('✅ Campaign is connected to our protocol')
            connectedCampaigns.push(cell)
          } else {
            debug.log('❌ Campaign is connected to different protocol:', connectedTypeId.connected_key)
          }
        } else {
          debug.warn('Campaign cell has no type script or args')
        }
      } catch (parseError) {
        debug.warn("Failed to parse campaign args:", parseError)
        // Continue to next campaign if parsing fails
      }
    }
    
    debug.info(`✨ Found ${connectedCampaigns.length} campaigns connected to protocol ${protocolTypeHash}`)
    debug.groupEnd()
    return connectedCampaigns
    
  } catch (error) {
    debug.error("Failed to fetch campaigns connected to protocol:", error)
    debug.groupEnd()
    return []
  }
}
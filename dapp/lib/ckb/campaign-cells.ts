// CKB Blockchain Integration - Campaign Cell Operations
// This file contains functions to interact with CKB blockchain for campaign data

import { ccc } from "@ckb-ccc/connector-react"
import { cccA } from "@ckb-ccc/connector-react/advanced";
import type { UserSubmissionRecordLike, ConnectedTypeIDLike } from "ssri-ckboost/types"
import { ConnectedTypeID } from "ssri-ckboost/types"
import { debug } from "@/lib/utils/debug"

// Development flag - set to true to use blockchain, false to use mock data
const USE_BLOCKCHAIN = true // Set to true when blockchain is available



/**
 * Fetch a specific campaign by type ID (O(1) lookup)
 * @param typeId - Campaign type ID from ConnectedTypeID args
 * @param campaignCodeHash - Campaign type code hash from protocol
 * @param client - CCC client instance
 * @param protocolCell - Protocol cell from context
 * @returns Campaign data or undefined if not found
 */
export async function fetchCampaignByTypeId(
  typeId: ccc.Hex,
  campaignCodeHash: ccc.Hex,
  client: ccc.Client,
  protocolCell: ccc.Cell
): Promise<ccc.Cell | undefined> {
  if (!client) {
    throw new Error("Client required for fetchCampaignByTypeId")
  }

  try {
    debug.group('fetchCampaignByTypeId')
    debug.log('Searching for campaign with type ID:', typeId)
    debug.log('Campaign code hash:', campaignCodeHash)
    
    // Use the protocol cell passed as parameter
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
 * Fetch all campaign cells owned by the current user
 * @param client - CCC client instance
 * @param userLockScript - User's lock script
 * @param campaignCodeHash - Campaign type code hash from protocol data
 * @returns Array of campaign cells owned by the user
 */
export async function fetchCampaignsOwnedByUser(
  client: ccc.Client,
  userLockScript: ccc.Script,
  campaignCodeHash: ccc.Hex
): Promise<ccc.Cell[]> {
  debug.group('fetchCampaignsOwnedByUser')
  debug.log('Input parameters:', {
    campaignCodeHash,
    clientPresent: !!client,
    userLockScript
  })

  if (!client) {
    debug.error("Client is required to fetch campaigns")
    debug.groupEnd()
    throw new Error("Client is required to fetch campaigns")
  }

  try {
    
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
  client: ccc.Client,
  campaignCodeHash: ccc.Hex,
  protocolTypeHash: ccc.Hex
): Promise<ccc.Cell[]> {
  debug.group('fetchCampaignsConnectedToProtocol')
  debug.log('Input parameters:', {
    campaignCodeHash,
    protocolTypeHash,
    clientPresent: !!client
  })

  if (!client) {
    debug.error("Client is required to fetch campaigns")
    debug.groupEnd()
    throw new Error("Client is required to fetch campaigns")
  }

  try {
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
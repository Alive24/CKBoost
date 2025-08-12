// CKB Blockchain Integration - Campaign Cell Operations
// This file contains functions to interact with CKB blockchain for campaign data

import { ccc } from "@ckb-ccc/core"
import { cccA } from "@ckb-ccc/core/advanced";
import type { UserSubmissionRecordLike, ConnectedTypeIDLike } from "ssri-ckboost/types"
import { ConnectedTypeID, ProtocolData } from "ssri-ckboost/types"
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
 * Fetch a specific campaign by type hash from CKB blockchain or return mock data
 * @param typeHash - Campaign type script hash
 * @param signer - CCC signer instance (optional when using mock data)
 * @returns Campaign data or undefined if not found
 */
export async function fetchCampaignByTypeHash(typeHash: ccc.Hex, signer?: ccc.Signer): Promise<ccc.Cell | undefined> {
  if (!signer) {
    throw new Error("Signer required when USE_BLOCKCHAIN is true")
  }

  try {
    debug.group('fetchCampaignByTypeHash')
    debug.log('Searching for campaign with type hash:', typeHash)
    
    const client = signer.client
    
    // First, we need to get the protocol cell to find the campaign code hash
    const protocolCell = await fetchProtocolCell(signer)
    if (!protocolCell) {
      debug.error("Protocol cell not found")
      debug.groupEnd()
      return undefined
    }
    
    // Parse protocol data to get campaign code hash
    const protocolData = ProtocolData.decode(protocolCell.outputData)
    const campaignCodeHash = protocolData.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash
    
    debug.log('Campaign code hash from protocol:', campaignCodeHash)
    
    // Now search for campaigns with this code hash
    const searchKey: cccA.ClientCollectableSearchKeyLike = {
      script: {
        codeHash: campaignCodeHash,
        hashType: "type" as const,
        args: "0x" // Empty args to match all campaigns
      },
      scriptType: "type",
      scriptSearchMode: "prefix"
    }
    
    debug.log('Searching for campaigns with code hash:', campaignCodeHash)
    
    // Iterate through campaign cells and find the one with matching type hash
    for await (const cell of client.findCells(searchKey)) {
      if (cell.cellOutput.type) {
        const cellTypeHash = cell.cellOutput.type.hash()
        debug.log('Checking cell with type hash:', cellTypeHash)
        if (cellTypeHash === typeHash) {
          debug.log('✅ Found campaign cell with matching type hash')
          debug.groupEnd()
          return cell
        }
      }
    }
    
    debug.warn('No campaign found with type hash:', typeHash)
    debug.groupEnd()
    return undefined
    
  } catch (error) {
    debug.error(`Failed to fetch campaign ${typeHash}:`, error)
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
    //   progressMap.set(progress.campaignTypeHash, progress)
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
            connected_type_hash: connectedTypeId.connected_type_hash
          })
          
          // Check if this campaign is connected to our protocol
          if (connectedTypeId.connected_type_hash === protocolTypeHash) {
            debug.log('✅ Campaign is connected to our protocol')
            connectedCampaigns.push(cell)
          } else {
            debug.log('❌ Campaign is connected to different protocol:', connectedTypeId.connected_type_hash)
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
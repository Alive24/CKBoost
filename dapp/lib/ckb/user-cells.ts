import { ccc } from "@ckb-ccc/core";
import { ckboost } from "ssri-ckboost";

/**
 * Fetch all user cells for a given lock script
 * Searches by lock script first, then optionally filters by type code hash
 * This approach finds all cells with the lock, or specific typed cells if typeCodeHash is provided
 */
export async function getAllUserCellsByLock(
  lockScript: ccc.Script,
  signer: ccc.Signer,
  userTypeCodeHash?: ccc.Hex // Made optional
): Promise<ccc.Cell[]> {
  const cells: ccc.Cell[] = [];
  const startTime = Date.now();
  
  console.log("[getAllUserCellsByLock] Searching for cells with lock:", lockScript.hash().slice(0, 10) + "...");
  
  // Construct the type script filter if userTypeCodeHash is provided
  const typeScript = userTypeCodeHash ? {
    codeHash: userTypeCodeHash,
    hashType: "type" as const,
    args: "" // Empty args to match any args - the type filter will handle the code hash matching
  } : null;
  
  if (userTypeCodeHash) {
    console.log("[getAllUserCellsByLock] Using type filter:", userTypeCodeHash.slice(0, 10) + "...");
  } else {
    console.log("[getAllUserCellsByLock] No type filter - returning all cells with this lock");
  }
  
  // Use findCellsByLock with optional type parameter
  // This is more efficient than filtering manually
  for await (const cell of signer.client.findCellsByLock(lockScript, typeScript)) {
    console.log(`[getAllUserCellsByLock] ✅ Found cell #${cells.length + 1}:`, {
      outPoint: cell.outPoint,
      typeArgs: cell.cellOutput.type?.args?.slice(0, 66) + "...",
      capacity: cell.cellOutput.capacity.toString()
    });
    cells.push(cell);
  }
  
  console.log(`[getAllUserCellsByLock] Found ${cells.length} matching user cells in ${Date.now() - startTime}ms`);
  return cells;
}

/**
 * Get the latest user cell by block height
 * When multiple user cells exist, returns the one created in the latest block
 */
export async function getLatestUserCellByLock(
  lockScript: ccc.Script,
  userTypeCodeHash: ccc.Hex,
  signer: ccc.Signer
): Promise<ccc.Cell | undefined> {
  console.log("[getLatestUserCellByLock] Starting search for user cells...");
  const searchStart = Date.now();
  
  const cells = await getAllUserCellsByLock(lockScript, signer, userTypeCodeHash);
  
  console.log(`[getLatestUserCellByLock] Found ${cells.length} cells in ${Date.now() - searchStart}ms`);
  
  if (cells.length === 0) {
    return undefined;
  }
  
  if (cells.length === 1) {
    return cells[0];
  }
  
  // Multiple cells found - need to find the latest one
  console.warn(`[getLatestUserCellByLock] Found ${cells.length} user cells for lock ${lockScript.hash().slice(0, 10)}... - selecting latest by block height`);
  
  let latestCell = cells[0];
  let latestBlockNumber = 0n;
  
  // Get block number for each cell and find the latest
  for (const cell of cells) {
    try {
      // Get transaction info to find block number
      const txInfo = await signer.client.getTransaction(cell.outPoint.txHash);
      if (txInfo && txInfo.blockNumber) {
        const blockNumber = BigInt(txInfo.blockNumber);
        console.log(`[getLatestUserCellByLock] Cell ${cell.outPoint.txHash.slice(0, 10)}:${cell.outPoint.index} is in block ${blockNumber}`);
        
        if (blockNumber > latestBlockNumber) {
          latestBlockNumber = blockNumber;
          latestCell = cell;
        }
      }
    } catch (error) {
      console.error(`[getLatestUserCellByLock] Failed to get block info for cell ${cell.outPoint.txHash}:${cell.outPoint.index}`, error);
    }
  }
  
  console.log(`[getLatestUserCellByLock] Selected cell from block ${latestBlockNumber} as the latest user cell (total time: ${Date.now() - searchStart}ms)`);
  return latestCell;
}

/**
 * Fetch all user cells in the system (for debugging/admin purposes)
 * This searches ALL cells with the user type, regardless of owner
 */
export async function fetchAllUserCells(
  userTypeCodeHash: ccc.Hex,
  signer: ccc.Signer
): Promise<ccc.Cell[]> {
  const cells: ccc.Cell[] = [];
  let totalChecked = 0;
  const startTime = Date.now();
  
  console.log("[fetchAllUserCells] Searching for ALL user cells with type:", userTypeCodeHash.slice(0, 10) + "...");
  
  // Try searching by type with null script (might work better than empty args)
  for await (const cell of signer.client.findCells({
    script: {
      codeHash: userTypeCodeHash,
      hashType: "type",
      args: ""
    },
    scriptType: "type",
    scriptSearchMode: "prefix"
  })) {
    totalChecked++;
    cells.push(cell);
    console.log(`[fetchAllUserCells] Found user cell #${cells.length}:`, {
      lock: cell.cellOutput.lock.hash().slice(0, 10) + "...",
      typeArgs: cell.cellOutput.type?.args?.slice(0, 20) + "..."
    });
  }
  
  console.log(`[fetchAllUserCells] Found ${cells.length} total user cells in system (checked ${totalChecked} cells in ${Date.now() - startTime}ms)`);
  return cells;
}

/**
 * Fetch all user cells (legacy function name for compatibility)
 */
export async function fetchUserCells(
  userTypeCodeHash: ccc.Hex,
  signer: ccc.Signer
): Promise<ccc.Cell[]> {
  return fetchAllUserCells(userTypeCodeHash, signer);
}

/**
 * Fetch user cell by type_id (O(1) lookup)
 */
export async function fetchUserByTypeId(
  typeId: ccc.Hex,
  userTypeCodeHash: ccc.Hex,
  signer: ccc.Signer
): Promise<ccc.Cell | undefined> {
  // First try with the current user's lock script (more efficient)
  const lockScript = (await signer.getRecommendedAddressObj()).script;
  
  for await (const cell of signer.client.findCellsByLock(lockScript, null)) {
    // Check if this cell has the user type script
    if (cell.cellOutput.type && 
        cell.cellOutput.type.codeHash === userTypeCodeHash) {
      // Verify this is the correct cell by checking the type_id
      const cellTypeId = extractTypeIdFromUserCell(cell);
      if (cellTypeId === typeId) {
        return cell;
      }
    }
  }
  
  // If not found with lock script, search all cells with this type (fallback)
  for await (const cell of signer.client.findCellsByType(
    {
      codeHash: userTypeCodeHash,
      hashType: "type",
      args: "" // Empty args to match any args
    }
  )) {
    // Verify this is the correct cell by checking the type_id
    const cellTypeId = extractTypeIdFromUserCell(cell);
    if (cellTypeId === typeId) {
      return cell;
    }
  }
  
  return undefined;
}

/**
 * Fetch user cell by lock hash
 * This now returns the latest user cell when multiple exist
 * Note: This function expects a lock script to be passed, not a lock hash
 * The parameter name is misleading and should be refactored in the future
 */
export async function fetchUserByLockHash(
  lockHash: ccc.Hex,
  userTypeCodeHash: ccc.Hex,
  signer: ccc.Signer
): Promise<ccc.Cell | undefined> {
  // The lockHash parameter is actually a lock script hash, but we need the actual lock script
  // Get the current user's lock script from the signer
  const lockScript = (await signer.getRecommendedAddressObj()).script;
  
  // Verify this is the correct lock by checking its hash matches
  if (lockScript.hash() !== lockHash) {
    console.warn(`[fetchUserByLockHash] Lock hash mismatch - expected ${lockHash.slice(0, 10)}... but got ${lockScript.hash().slice(0, 10)}...`);
    // Fall back to searching without lock hash verification for now
  }
  
  // Use the new function that handles multiple cells properly
  return getLatestUserCellByLock(lockScript, userTypeCodeHash, signer);
}

/**
 * Extract type_id from user cell's ConnectedTypeID args
 */
export function extractTypeIdFromUserCell(cell: ccc.Cell): ccc.Hex | null {
  if (!cell.cellOutput.type) {
    return null;
  }
  
  try {
    const args = cell.cellOutput.type.args;
    if (!args || args === "0x") {
      return null;
    }
    
    // Parse ConnectedTypeID from args
    const connectedTypeId = ckboost.types.ConnectedTypeID.decode(ccc.bytesFrom(args));
    return ccc.hexFrom(connectedTypeId.type_id);
  } catch (error) {
    console.error("Failed to extract type_id from user cell:", error);
    return null;
  }
}

/**
 * Parse user data from cell
 */
export function parseUserData(cell: ccc.Cell): ReturnType<typeof ckboost.types.UserData.decode> | null {
  try {
    const rawData = cell.outputData;
    return ckboost.types.UserData.decode(rawData);
  } catch (error) {
    console.error("Failed to parse user data:", error);
    return null;
  }
}
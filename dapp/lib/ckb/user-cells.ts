import { ccc } from "@ckb-ccc/core";
import { ckboost } from "ssri-ckboost";

/**
 * Fetch all user cells
 */
export async function fetchUserCells(
  userTypeCodeHash: ccc.Hex,
  signer: ccc.Signer
): Promise<ccc.Cell[]> {
  const cells: ccc.Cell[] = [];
  
  for await (const cell of signer.client.findCellsByType(
    {
      codeHash: userTypeCodeHash,
      hashType: "type",
      args: ""
    }
  )) {
    cells.push(cell);
  }
  
  return cells;
}

/**
 * Fetch user cell by type_id (O(1) lookup)
 */
export async function fetchUserByTypeId(
  typeId: ccc.Hex,
  userTypeCodeHash: ccc.Hex,
  signer: ccc.Signer
): Promise<ccc.Cell | undefined> {
  // Search for cells with this type code hash
  for await (const cell of signer.client.findCellsByType(
    {
      codeHash: userTypeCodeHash,
      hashType: "type",
      args: ""
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
 */
export async function fetchUserByLockHash(
  lockHash: ccc.Hex,
  userTypeCodeHash: ccc.Hex,
  signer: ccc.Signer
): Promise<ccc.Cell | undefined> {
  for await (const cell of signer.client.findCellsByLock(
    ccc.Script.from({
      codeHash: lockHash,
      hashType: "type",
      args: ""
    }),
    null
  )) {
    // Check if this cell has the user type script
    if (cell.cellOutput.type && 
        cell.cellOutput.type.codeHash === userTypeCodeHash) {
      return cell;
    }
  }
  
  return undefined;
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
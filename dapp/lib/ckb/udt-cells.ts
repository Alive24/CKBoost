import { ccc } from "@ckb-ccc/connector-react";
import { debug } from "../utils/debug";
import { ConnectedTypeID } from "ssri-ckboost/types";

/**
 * Fetch UDT cells locked with campaign-lock for a specific campaign
 */
export async function fetchUDTCellsByCampaignLock(
  campaignTypeId: ccc.Hex,
  campaignLockCodeHash: ccc.Hex,
  campaignTypeCodeHash: ccc.Hex,
  protocolCellTypeHash: ccc.Hex,
  signer: ccc.Signer
): Promise<ccc.Cell[]> {
  debug.log("Fetching UDT cells for campaign", campaignTypeId);

  try {
    // First, we need to construct the campaign type script to get its hash
    // The campaign cell type script has ConnectedTypeID args: [type_id (32 bytes) + connected_key (32 bytes)]
    // We need to find the campaign cell first to get its complete type script
    const campaignConnectedTypeId = ConnectedTypeID.encode({
      type_id: campaignTypeId,
      connected_key: protocolCellTypeHash,
    });
    
    const campaignTypeScript = ccc.Script.from({
      codeHash: campaignTypeCodeHash,
      hashType: "type" as ccc.HashType,
      args: campaignConnectedTypeId, // This is actually the ConnectedTypeID containing the type_id
    });
    
    // Get the type hash of the campaign cell's type script
    const campaignTypeHash = campaignTypeScript.hash();
    
    // Create the campaign-lock script using the campaign type hash as args
    const campaignLockScript = ccc.Script.from({
      codeHash: campaignLockCodeHash,
      hashType: "type" as ccc.HashType,
      args: campaignTypeHash,
    });

    // Find all cells with this lock script
    const collector = signer.client.findCells({
      script: campaignLockScript,
      scriptType: "lock",
      scriptSearchMode: "exact",
    });

    const udtCells: ccc.Cell[] = [];
    for await (const cell of collector) {
      // Only include cells that have a type script (UDT cells)
      if (cell.cellOutput.type) {
        udtCells.push(cell);
      }
    }

    debug.log(`Found ${udtCells.length} UDT cells for campaign`);
    return udtCells;
  } catch (error) {
    debug.error("Failed to fetch UDT cells:", error);
    throw error;
  }
}

/**
 * Fetch UDT cells by type script (specific UDT type)
 */
export async function fetchUDTCellsByType(
  udtTypeScript: ccc.ScriptLike,
  signer: ccc.Signer
): Promise<ccc.Cell[]> {
  const script = ccc.Script.from(udtTypeScript);
  debug.log("Fetching UDT cells by type", script.codeHash);

  try {
    const collector = signer.client.findCells({
      script,
      scriptType: "type",
      scriptSearchMode: "exact",
    });

    const cells: ccc.Cell[] = [];
    for await (const cell of collector) {
      cells.push(cell);
    }

    debug.log(`Found ${cells.length} cells for UDT type`);
    return cells;
  } catch (error) {
    debug.error("Failed to fetch UDT cells by type:", error);
    throw error;
  }
}

/**
 * Calculate total UDT balance from cells
 */
export function calculateUDTBalance(cells: ccc.Cell[]): bigint {
  let total = 0n;
  
  for (const cell of cells) {
    if (cell.outputData && cell.outputData.length >= 16) {
      const amount = ccc.numFromBytes(cell.outputData.slice(0, 16));
      total += amount;
    }
  }
  
  return total;
}

/**
 * Group UDT cells by their type script hash
 */
export function groupUDTCellsByType(cells: ccc.Cell[]): Map<string, ccc.Cell[]> {
  const grouped = new Map<string, ccc.Cell[]>();
  
  for (const cell of cells) {
    const typeHash = cell.cellOutput.type?.hash();
    if (typeHash) {
      const group = grouped.get(typeHash) || [];
      group.push(cell);
      grouped.set(typeHash, group);
    }
  }
  
  return grouped;
}

/**
 * Find UDT cells with sufficient balance for a transfer
 */
export async function findSufficientUDTCells(
  udtTypeScript: ccc.ScriptLike,
  requiredAmount: bigint,
  ownerLockScript: ccc.ScriptLike,
  signer: ccc.Signer
): Promise<ccc.Cell[]> {
  const udtScript = ccc.Script.from(udtTypeScript);
  const lockScript = ccc.Script.from(ownerLockScript);
  
  debug.log("Finding sufficient UDT cells", {
    udtType: udtScript.codeHash,
    requiredAmount: requiredAmount.toString(),
    owner: lockScript.hash(),
  });

  try {
    // Find cells with both the UDT type and owner lock
    const collector = signer.client.findCells({
      script: udtScript,
      scriptType: "type",
      scriptSearchMode: "exact",
    });

    const selectedCells: ccc.Cell[] = [];
    let collectedAmount = 0n;

    for await (const cell of collector) {
      // Check if cell has the correct lock script
      if (cell.cellOutput.lock.hash() === lockScript.hash()) {
        selectedCells.push(cell);
        const amount = ccc.numFromBytes(cell.outputData.slice(0, 16));
        collectedAmount += amount;

        if (collectedAmount >= requiredAmount) {
          break;
        }
      }
    }

    if (collectedAmount < requiredAmount) {
      throw new Error(
        `Insufficient UDT balance. Required: ${requiredAmount}, Available: ${collectedAmount}`
      );
    }

    debug.log(`Selected ${selectedCells.length} cells with total amount ${collectedAmount}`);
    return selectedCells;
  } catch (error) {
    debug.error("Failed to find sufficient UDT cells:", error);
    throw error;
  }
}

/**
 * Get UDT metadata (name, symbol, decimals) if available
 */
export async function getUDTMetadata(
  udtTypeScript: ccc.ScriptLike,
  _signer: ccc.Signer
): Promise<{
  name?: string;
  symbol?: string;
  decimals?: number;
}> {
  try {
    // This would use the UDT SSRI trait to fetch metadata
    // For now, return placeholder data
    // TODO: Integrate with @ckb-ccc/udt package for real metadata
    
    const script = ccc.Script.from(udtTypeScript);
    const typeHash = script.hash();
    
    // Common known tokens (placeholder mapping)
    const knownUDTs: Record<string, { name: string; symbol: string; decimals: number }> = {
      // Add known token type hashes here
    };
    
    if (knownUDTs[typeHash]) {
      return knownUDTs[typeHash];
    }
    
    // Default unknown token
    return {
      name: "Unknown Token",
      symbol: "???",
      decimals: 8,
    };
  } catch (error) {
    debug.error("Failed to get UDT metadata:", error);
    return {};
  }
}
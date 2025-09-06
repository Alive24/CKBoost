import { ccc } from "@ckb-ccc/connector-react";
import { deploymentManager } from "./deployment-manager";
import { debug } from "@/lib/utils/debug";

/**
 * Fetch the Points UDT balance for a user
 * @param client - CCC client instance
 * @param userLockScript - User's lock script
 * @param protocolTypeHash - Protocol type hash (used as UDT args)
 * @returns Points balance as bigint
 */
export async function fetchUserPointsBalance(
  client: ccc.Client,
  userLockScript: ccc.Script,
  protocolTypeHash: ccc.Hex
): Promise<bigint> {
  try {
    const network = deploymentManager.getCurrentNetwork();
    const pointsUdtCodeHash = deploymentManager.getContractCodeHash(network, "ckboostPointsUdt");
    
    if (!pointsUdtCodeHash) {
      debug.warn("Points UDT contract not deployed");
      return BigInt(0);
    }

    // Create the Points UDT type script
    const pointsUdtTypeScript = ccc.Script.from({
      codeHash: pointsUdtCodeHash,
      hashType: "type",
      args: protocolTypeHash // Points UDT uses protocol type hash as args
    });

    debug.log("Searching for Points UDT cells:", {
      udtTypeHash: pointsUdtTypeScript.hash().slice(0, 10) + "...",
      userLockHash: userLockScript.hash().slice(0, 10) + "..."
    });

    // Search for cells with this UDT type script and user's lock script
    let totalBalance = BigInt(0);
    
    const searchKey = {
      script: userLockScript,
      scriptType: "lock" as const,
      scriptSearchMode: "exact" as const,
      filter: {
        script: pointsUdtTypeScript
      }
    };

    for await (const cell of client.findCells(searchKey)) {
      // UDT amount is stored in the first 16 bytes (u128) of cell data
      if (cell.outputData && cell.outputData.length >= 16) {
        const amountBytes = ccc.bytesFrom(cell.outputData.slice(0, 34)); // "0x" + 32 hex chars = 16 bytes
        const amount = ccc.numLeFromBytes(amountBytes);
        totalBalance += amount;
        
        debug.log("Found Points UDT cell with balance:", amount.toString());
      }
    }

    debug.log("Total Points balance:", totalBalance.toString());
    return totalBalance;
  } catch (error) {
    debug.error("Failed to fetch Points balance:", error);
    return BigInt(0);
  }
}

/**
 * Format Points balance for display
 * Points are stored as u128 with 8 decimal places
 * @param balance - Balance as bigint
 * @returns Formatted string
 */
export function formatPointsBalance(balance: bigint): string {
  // Points have 0 decimal places
  const decimals = 0;
  const divisor = BigInt(10 ** decimals);
  
  const wholePart = balance / divisor;
  const fractionalPart = balance % divisor;
  
  // Format with commas for thousands
  const wholeStr = wholePart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  
  // If there's a fractional part, show up to 2 decimal places
  if (fractionalPart > 0) {
    const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
    const significantDecimals = fractionalStr.slice(0, 2);
    return `${wholeStr}.${significantDecimals}`;
  }
  
  return wholeStr;
}
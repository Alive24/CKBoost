// CKB Protocol Cells - Blockchain data integration
// This file handles fetching protocol data from CKB blockchain

import { ccc } from "@ckb-ccc/connector-react";
import {
  ProtocolTransaction,
} from "../types/protocol";
import { deploymentManager } from "./deployment-manager";

// Import type definitions from our types file (currently unused but may be needed for future Molecule parsing)
// Get protocol type script from deployments.json
const getProtocolTypeScript = () => {
  const network = deploymentManager.getCurrentNetwork();
  const deployment = deploymentManager.getCurrentDeployment(network, 'ckboostProtocolType');
  
  if (!deployment || !deployment.typeHash) {
    throw new Error(`Protocol type contract not found in deployments.json for ${network}`);
  }

  // For protocol cells, we need to use the actual protocol contract code hash (typeHash)
  // not the Type ID script code hash
  const protocolTypeScript = {
    codeHash: deployment.typeHash,
    hashType: "type" as const,
    args: process.env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS || "0x" // Empty args to search for any protocol cell
  };

  return protocolTypeScript;
};

/**
 * Fetch protocol cell by specific outpoint
 * @param client - CCC client instance
 * @param outPoint - Specific outpoint to fetch
 * @returns Protocol cell or null if not found
 */
export async function fetchProtocolCellByOutPoint(
  client: ccc.Client,
  outPoint: { txHash: ccc.Hex; index: ccc.Num }
): Promise<ccc.Cell | null> {
  try {
    // Fetch the specific cell by outpoint
    const cell = await client.getCellLive(outPoint);
    
    if (!cell) {
      return null;
    }
    
    return cell;
  } catch (error) {
    console.error("Failed to fetch protocol cell by outpoint:", error);
    throw new Error("Failed to fetch protocol cell by outpoint. The cell may not exist or has been consumed.");
  }
}

/**
 * Fetch protocol cell from CKB blockchain
 * @param client - CCC client instance
 * @returns Protocol cell or null if not found
 */
export async function fetchProtocolCell(
  client: ccc.Client
): Promise<ccc.Cell | null> {

  try {
    // Check if client is properly initialized
    if (!client) {
      throw new Error("Client is not initialized.");
    }
    
    // Get protocol type script
    let protocolTypeScript;
    try {
      protocolTypeScript = getProtocolTypeScript();
    } catch (error) {
      throw new Error(
        `Protocol contract not found in deployments.json. ` +
        `Please ensure the CKBoost protocol contract is deployed on-chain first using the deployment scripts. ` +
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    console.log("Searching for protocol cell with type script:", {
      codeHash: protocolTypeScript.codeHash,
      hashType: protocolTypeScript.hashType,
      args: protocolTypeScript.args
    });

    // Search for protocol cell by type script
    const cellsGenerator = client.findCells({
      script: protocolTypeScript,
      scriptType: "type",
      scriptSearchMode: "exact",
    });

    // Get first cell from async generator
    const firstCell = await cellsGenerator.next();
    console.log("Cell search result:", { done: firstCell.done, hasValue: !!firstCell.value });
    
    if (firstCell.done || !firstCell.value) {
      console.warn("No protocol cell found on blockchain with the configured type script");
      // Provide more specific guidance based on the type script args
      if (protocolTypeScript.args === "0x") {
        throw new Error(
          "No protocol cell exists on the blockchain yet. " +
          "Please deploy a new protocol cell using the Protocol Management interface."
        );
      } else {
        throw new Error(
          `No protocol cell found with type script args: ${protocolTypeScript.args}. ` +
          "The protocol cell may have been consumed or the configuration may be incorrect."
        );
      }
    }

    const cell = firstCell.value;
    return cell;
  } catch (error) {
    console.error("Failed to fetch protocol cell:", error);
    
    // Re-throw with the original error message if it's already descriptive
    if (error instanceof Error && (
      error.message.includes("Signer") || 
      error.message.includes("protocol") ||
      error.message.includes("deploy")
    )) {
      throw error;
    }
    
    // Otherwise, provide a generic error
    throw new Error(
      `Failed to fetch protocol data from blockchain: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}



/**
 * Get protocol transaction history
 * @param client - CCC client instance
 * @param limit - Maximum number of transactions to fetch
 * @returns Array of protocol transactions
 */
export async function fetchProtocolTransactions(
  client: ccc.Client,
  limit: number = 50
): Promise<ProtocolTransaction[]> {

  try {
    // TODO: Implement real transaction history fetching
    // This would involve querying the CKB indexer for transactions that modified the protocol cell
    console.log(client, limit)
    console.warn("Protocol transaction history fetching not yet implemented");
    return [];
  } catch (error) {
    console.error("Failed to fetch protocol transactions:", error);
    throw error;
  }
}


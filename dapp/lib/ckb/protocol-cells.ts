// CKB Protocol Cells - Blockchain data integration
// This file handles fetching protocol data from CKB blockchain

import { ccc } from "@ckb-ccc/connector-react";
import { ProtocolData } from "../types";
import {
  ProtocolCell,
  ProtocolMetrics,
  ProtocolTransaction,
} from "../types/protocol";
import { deploymentManager, DeploymentManager } from "./deployment-manager";
import { SerializeProtocolData, types } from "ssri-ckboost";

/**
 * Get the protocol type code cell outpoint from deployment information
 * @returns The outpoint of the cell containing the protocol code or null
 */
function getProtocolTypeCodeOutPoint(): { outPoint: { txHash: ccc.Hex; index: ccc.Num } } | null {
  try {
    // Get current network
    const network = DeploymentManager.getCurrentNetwork()
    
    // Get deployment info from deployment manager
    const outPoint = deploymentManager.getContractOutPoint(network, 'ckboostProtocolType')
    
    if (!outPoint) {
      throw new Error(
        `Protocol type contract not found in deployments.json for ${network}. ` +
        `Please ensure the contract is deployed and recorded in deployments.json`
      )
    }
    
    console.log(`Using protocol type code cell from deployments.json:`, outPoint)
    
    return { outPoint }
  } catch (error) {
    console.error("Failed to get protocol type code outpoint:", error)
    return null
  }
}
// Import type definitions from our types file (currently unused but may be needed for future Molecule parsing)
// Get protocol type script from deployments.json
const getProtocolTypeScript = () => {
  const network = DeploymentManager.getCurrentNetwork();
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
 * @param signer - CCC signer instance
 * @param outPoint - Specific outpoint to fetch
 * @returns Protocol cell or null if not found
 */
export async function fetchProtocolCellByOutPoint(
  signer: ccc.Signer,
  outPoint: { txHash: ccc.Hex; index: ccc.Num }
): Promise<ProtocolCell | null> {
  try {
    const client = signer.client;
    
    // Fetch the specific cell by outpoint
    const cell = await client.getCellLive(outPoint);
    
    if (!cell) {
      return null;
    }
    
    return {
      outPoint: {
        txHash: cell.outPoint.txHash,
        index: cell.outPoint.index,
      },
      output: {
        capacity: cell.cellOutput.capacity.toString(),
        lock: cell.cellOutput.lock,
        type: cell.cellOutput.type || null,
      },
      data: cell.outputData || "0x",
    };
  } catch (error) {
    console.error("Failed to fetch protocol cell by outpoint:", error);
    throw new Error("Failed to fetch protocol cell by outpoint. The cell may not exist or has been consumed.");
  }
}

/**
 * Fetch protocol cell from CKB blockchain
 * @param signer - CCC signer instance
 * @returns Protocol cell or null if not found
 */
export async function fetchProtocolCell(
  signer?: ccc.Signer
): Promise<ProtocolCell | null> {

  try {
    // Check if signer is properly initialized
    if (!signer) {
      throw new Error("Signer is not initialized. Please connect your wallet first.");
    }
    
    if (!signer.client) {
      throw new Error("Signer client is not initialized. Please ensure your wallet is properly connected.");
    }

    const client = signer.client;
    
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
    return {
      outPoint: {
        txHash: cell.outPoint.txHash,
        index: cell.outPoint.index,
      },
      output: {
        capacity: cell.cellOutput.capacity.toString(),
        lock: cell.cellOutput.lock,
        type: cell.cellOutput.type || null,
      },
      data: cell.outputData || "0x",
    };
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
 * Parse ProtocolData from cell data using Molecule schema
 * @param cellData - Hex-encoded cell data
 * @returns Parsed ProtocolData
 */
export function parseProtocolData(cellData: string): ProtocolData {
  try {
    // For empty or minimal protocol cells, return default structure
    // This allows the app to function while the protocol cell is being deployed
    if (cellData === "0x" || !cellData || cellData.length < 10) {
      console.log("Protocol cell is empty or minimal, returning default structure");
      
      // Create default values using the new type system
      // For Uint64Type - use bigint
      const defaultTimestamp = BigInt(Date.now());
      
      // For Byte32Type - use ccc.Hex
      const defaultByte32: ccc.Hex = "0x" + "00".repeat(32) as ccc.Hex;
      
      // Return a default ProtocolData structure that matches the SDK type
      const defaultProtocolData: ProtocolData = {
        campaigns_approved: [],
        tipping_proposals: [],
        tipping_config: {
          approval_requirement_thresholds: [], // Empty Uint128Vec
          expiration_duration: defaultTimestamp // Uint64 as bigint
        },
        endorsers_whitelist: [],
        last_updated: defaultTimestamp, // Uint64 as bigint
        protocol_config: {
          admin_lock_hash_vec: [],
          script_code_hashes: {
            ckb_boost_protocol_type_code_hash: defaultByte32,
            ckb_boost_protocol_lock_code_hash: defaultByte32,
            ckb_boost_campaign_type_code_hash: defaultByte32,
            ckb_boost_campaign_lock_code_hash: defaultByte32,
            ckb_boost_user_type_code_hash: defaultByte32,
            accepted_udt_type_code_hashes: [],
            accepted_dob_type_code_hashes: []
          }
        }
      };
      
      return defaultProtocolData;
    }

    // Parse actual protocol data using molecule codec
    console.log("Parsing protocol data from cell:", cellData);
    
    try {
      // Convert hex string to bytes for molecule parsing
      const cellDataBytes = ccc.bytesFrom(cellData);
      console.log("Cell data bytes length:", cellDataBytes.length);
      
      // Decode using the generated ProtocolData codec from types namespace
      const protocolData = types.ProtocolData.decode(cellDataBytes);
      
      console.log("Successfully parsed protocol data");
      
      // Return the decoded data - cast through unknown to handle type differences
      // The decoded data has the correct structure but some fields may have different types (bigint vs number)
      // This is acceptable since the consuming code should handle these type variations
      return protocolData as unknown as ProtocolData;
    } catch (parseError) {
      console.error("Failed to parse protocol data:", parseError);
      console.error("Cell data that failed to parse:", cellData);
      
      // If we have non-empty cell data but can't parse it, the cell is corrupted
      // Throw an error to trigger redeployment
      throw new Error(
        "Protocol cell data is corrupted or incompatible. " +
        "Please redeploy the protocol cell using the Protocol Management interface."
      );
    }
  } catch (error) {
    console.error("Failed to parse ProtocolData:", error);
    throw error;
  }
}

/**
 * Generate ProtocolData Molecule bytes from data structure
 * @param data - ProtocolData to serialize
 * @returns Hex-encoded Molecule data
 */
export function generateProtocolData(data: ProtocolData): string {
  try {
    // Use proper Molecule serialization
    const protocolDataBytes = SerializeProtocolData(data);
    return "0x" + Array.from(new Uint8Array(protocolDataBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error("Failed to generate ProtocolData with Molecule serialization:", error);
    throw new Error("Failed to serialize protocol data. Please ensure the data structure is valid.");
  }
}

/**
 * Fetch protocol data by specific outpoint
 * @param signer - CCC signer instance
 * @param outPoint - Specific outpoint to fetch
 * @returns ProtocolData from the specified cell
 */
export async function fetchProtocolDataByOutPoint(
  signer: ccc.Signer,
  outPoint: { txHash: ccc.Hex; index: ccc.Num }
): Promise<ProtocolData> {
  const cell = await fetchProtocolCellByOutPoint(signer, outPoint);
  if (!cell) {
    throw new Error("Protocol cell not found at specified outpoint. Please ensure the outpoint is correct or deploy a new protocol cell using the Protocol Management interface.");
  }
  return parseProtocolData(cell.data);
}

/**
 * Fetch current protocol data from blockchain
 * @param signer - CCC signer instance
 * @returns Current ProtocolData
 */
export async function fetchProtocolData(
  signer?: ccc.Signer
): Promise<ProtocolData> {
  const cell = await fetchProtocolCell(signer);
  if (!cell) {
    const protocolTypeScript = getProtocolTypeScript();
    const errorMessage = `Protocol cell not found on blockchain.\n\nSearched for cell with type script:\n- Code Hash: ${protocolTypeScript.codeHash}\n- Hash Type: ${protocolTypeScript.hashType}\n- Args: ${protocolTypeScript.args}\n\nPlease deploy a new protocol cell using the Protocol Management interface.`;
    throw new Error(errorMessage);
  }
  return parseProtocolData(cell.data);
}

/**
 * Get protocol metrics from blockchain data
 * @param signer - CCC signer instance
 * @returns Protocol metrics
 */
export async function fetchProtocolMetrics(
  signer?: ccc.Signer
): Promise<ProtocolMetrics> {
  try {
    const data = await fetchProtocolData(signer);

    // Convert timestamp and validate
    let timestamp: number;
    try {
      // The new type system uses bigint for Uint64
      // Convert bigint timestamp to seconds
      if (data.last_updated && typeof data.last_updated === 'bigint') {
        // Assume the bigint is in milliseconds if it's a reasonable JavaScript timestamp
        const timestampBigInt = data.last_updated;
        
        // Check if it looks like milliseconds (> year 2000 in ms)
        if (timestampBigInt > 946684800000n) {
          timestamp = Number(timestampBigInt / 1000n);
        } else {
          // Otherwise assume it's already in seconds
          timestamp = Number(timestampBigInt);
        }
      } else {
        timestamp = Math.floor(Date.now() / 1000);
      }
      
      // Validate timestamp is reasonable (between year 2020 and 2100)
      const minTimestamp = 1577836800; // Jan 1, 2020
      const maxTimestamp = 4102444800; // Jan 1, 2100
      
      if (timestamp < minTimestamp || timestamp > maxTimestamp) {
        console.warn(`Invalid timestamp value: ${timestamp}, using current time`);
        timestamp = Math.floor(Date.now() / 1000);
      }
    } catch (error) {
      console.error('Error converting timestamp:', error);
      timestamp = Math.floor(Date.now() / 1000);
    }

    return {
      totalCampaigns: BigInt(data.campaigns_approved.length),
      activeCampaigns: BigInt(data.campaigns_approved.filter((c: any) => c.status === 4)
        .length),
      totalTippingProposals: BigInt(data.tipping_proposals.length),
      pendingTippingProposals: BigInt(data.tipping_proposals.filter(
        (p: any) => !p.tipping_transaction_hash
      ).length),
      totalEndorsers: BigInt(data.endorsers_whitelist.length),
      lastUpdated: new Date(timestamp * 1000).toISOString(),
    };
  } catch (error) {
    console.error("Failed to fetch protocol metrics:", error);
    throw error;
  }
}

/**
 * Get protocol transaction history
 * @param signer - CCC signer instance
 * @param limit - Maximum number of transactions to fetch
 * @returns Array of protocol transactions
 */
export async function fetchProtocolTransactions(
  _signer?: ccc.Signer,
  _limit: number = 50
): Promise<ProtocolTransaction[]> {

  try {
    // TODO: Implement real transaction history fetching
    // This would involve querying the CKB indexer for transactions that modified the protocol cell

    console.warn("Protocol transaction history fetching not yet implemented");
    return [];
  } catch (error) {
    console.error("Failed to fetch protocol transactions:", error);
    throw error;
  }
}

/**
 * Update protocol cell with new data
 * @param signer - CCC signer instance
 * @param newData - New ProtocolData to store
 * @returns Transaction hash
 */
export async function updateProtocolCell(
  signer: ccc.Signer | undefined,
  newData: ProtocolData
): Promise<string> {

  try {
    if (!signer) {
      throw new Error("Signer is required to update protocol cell");
    }

    // Get current protocol cell
    const currentCell = await fetchProtocolCell(signer);
    if (!currentCell) {
      throw new Error("Protocol cell not found on blockchain. Please deploy a new protocol cell using the Protocol Management interface.");
    }

    // Generate new protocol data
    const newCellData = generateProtocolData(newData);

    // Get the outpoint of the cell containing the protocol type script code
    const protocolTypeCodeCell = getProtocolTypeCodeOutPoint()
    if (!protocolTypeCodeCell) {
      throw new Error("Protocol type contract code cell not found. Make sure deployment information is available.")
    }

    // Build transaction to update protocol cell
    // Don't specify capacity - let CCC calculate it based on the actual data size
    const tx = ccc.Transaction.from({
      inputs: [
        {
          previousOutput: {
            txHash: currentCell.outPoint.txHash,
            index: currentCell.outPoint.index,
          },
          since: "0x0",
        },
      ],
      outputs: [
        {
          lock: currentCell.output.lock,
          type: currentCell.output.type,
        },
      ],
      outputsData: [newCellData],
      cellDeps: [],
      headerDeps: [],
      witnesses: [],
    });

    // Add protocol type code cell dependency
    tx.cellDeps.push(ccc.CellDep.from({
      outPoint: protocolTypeCodeCell.outPoint,
      depType: "code",
    }));

    // Add Type ID system script as a cell dependency if the protocol uses Type ID
    if (currentCell.output.type?.hashType === "type") {
      const typeIdScript = await signer.client.getKnownScript(ccc.KnownScript.TypeId);
      if (typeIdScript && typeIdScript.cellDeps && typeIdScript.cellDeps.length > 0) {
        // The cellDeps from getKnownScript are CellDepInfo objects
        // which contain the actual CellDep in their cellDep property
        for (const cellDepInfo of typeIdScript.cellDeps) {
          tx.cellDeps.push(cellDepInfo.cellDep);
        }
      }
    }
    
    // Complete transaction (add capacity, fees, etc.)
    await tx.completeInputsByCapacity(signer);
    await tx.completeFeeBy(signer, 1000); // 1000 shannon/byte fee rate

    // Send transaction
    const txHash = await signer.sendTransaction(tx);

    console.log("Protocol cell updated, tx:", txHash);
    return txHash;
  } catch (error) {
    console.error("Failed to update protocol cell:", error);
    throw error;
  }
}

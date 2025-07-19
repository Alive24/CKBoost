// CKB Protocol Cells - Blockchain data integration with development mocking
// This file handles fetching protocol data from CKB blockchain with fallback to mock data

import { ccc } from "@ckb-ccc/connector-react";
import { ProtocolData } from "../types";
import {
  ProtocolCell,
  ProtocolMetrics,
  ProtocolTransaction,
} from "../types/protocol";
import { getMockProtocolData } from "../mock/mock-protocol";
import { 
  bufferToNumber
} from "../utils/type-converters";
// Import type definitions from our types file (currently unused but may be needed for future Molecule parsing)
// import type {
//   ProtocolDataType,
//   EndorserInfoType,
//   TippingConfigType,
//   ProtocolConfigType,
//   ScriptCodeHashesType
// } from "../types/molecule"


// Development flag - set to true to use blockchain, false to use mock data
const USE_BLOCKCHAIN = false; // Set to true when blockchain is available

// Get protocol type script from environment variables
const getProtocolTypeScript = () => {
  const codeHash = process.env.NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH;
  const hashType = process.env.NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE as
    | "type"
    | "data"
    | "data1";
  const args = process.env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS || "0x";

  if (!codeHash) {
    throw new Error("Protocol type script configuration missing");
  }

  return {
    codeHash,
    hashType: hashType || "type",
    args,
  };
};

/**
 * Fetch protocol cell by specific outpoint
 * @param signer - CCC signer instance
 * @param outPoint - Specific outpoint to fetch
 * @returns Protocol cell or null if not found
 */
export async function fetchProtocolCellByOutPoint(
  signer: ccc.Signer,
  outPoint: { txHash: string; index: number }
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
        index: Number(cell.outPoint.index),
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
    throw new Error("Failed to fetch protocol cell by outpoint");
  }
}

/**
 * Fetch protocol cell from CKB blockchain or return mock cell
 * @param signer - CCC signer instance (optional when using mock data)
 * @returns Protocol cell or null if not found
 */
export async function fetchProtocolCell(
  signer?: ccc.Signer
): Promise<ProtocolCell | null> {
  if (!USE_BLOCKCHAIN) {
    // Return mock protocol cell for development
    console.log("Using mock protocol cell data for development");
    const mockData = getMockProtocolData();

    return {
      outPoint: {
        txHash:
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        index: 0,
      },
      output: {
        capacity: "100000000000", // 1000 CKB
        lock: {
          codeHash:
            "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
          hashType: "type",
          args: "0x",
        },
        type: {
          codeHash:
            process.env.NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH ||
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          hashType: "type",
          args: "0x",
        },
      },
      data: generateProtocolData(mockData), // Convert to hex for consistency
    };
  }

  if (!signer) {
    throw new Error("Signer required when USE_BLOCKCHAIN is true");
  }

  try {
    const client = signer.client;
    const protocolTypeScript = getProtocolTypeScript();

    // Search for protocol cell by type script
    const cellsGenerator = client.findCells({
      script: protocolTypeScript,
      scriptType: "type",
      scriptSearchMode: "exact",
    });

    // Get first cell from async generator
    const firstCell = await cellsGenerator.next();
    if (firstCell.done || !firstCell.value) {
      return null;
    }

    const cell = firstCell.value;
    return {
      outPoint: {
        txHash: cell.outPoint.txHash,
        index: Number(cell.outPoint.index),
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
    throw new Error("Failed to fetch protocol data from blockchain");
  }
}

/**
 * Parse ProtocolData from cell data using Molecule schema or return mock data
 * @param cellData - Hex-encoded cell data
 * @returns Parsed ProtocolData
 */
export function parseProtocolData(cellData: string): ProtocolData {
  try {
    if (cellData === "0x" || !cellData || cellData.length < 4) {
      throw new Error("Invalid or empty protocol data");
    }

    if (!USE_BLOCKCHAIN) {
      // Check if this is our mock data by trying to parse it as JSON first
      try {
        // Remove hex prefix and convert to string
        const hexWithoutPrefix = cellData.startsWith("0x")
          ? cellData.slice(2)
          : cellData;
        const buffer = new Uint8Array(hexWithoutPrefix.length / 2);
        for (let i = 0; i < hexWithoutPrefix.length; i += 2) {
          buffer[i / 2] = parseInt(hexWithoutPrefix.substring(i, i + 2), 16);
        }
        const jsonString = new TextDecoder().decode(buffer);
        const parsedData = JSON.parse(jsonString);

        console.log("Successfully parsed mock protocol data from cell");
        return parsedData as ProtocolData;
      } catch (jsonError) {
        console.warn("Failed to parse as JSON, falling back to mock data");
      }

      // If JSON parsing fails, return fresh mock data
      return getMockProtocolData();
    }

    // For blockchain data, implement proper Molecule parsing
    // TODO: Implement proper Molecule parsing once the generated code is fixed
    console.warn(
      "Using fallback mock protocol data parsing due to generated code syntax errors"
    );

    return getMockProtocolData();
  } catch (error) {
    console.error("Failed to parse ProtocolData:", error);
    throw new Error("Invalid protocol data format");
  }
}

/**
 * Generate ProtocolData Molecule bytes from data structure
 * @param data - ProtocolData to serialize
 * @returns Hex-encoded Molecule data
 */
export function generateProtocolData(data: ProtocolData): string {
  try {
    // For now, return a simple serialized format
    // TODO: Implement proper Molecule serialization once the generated code is fixed
    console.warn(
      "Using mock protocol data serialization due to generated code syntax errors"
    );

    // Return a minimal hex representation for now
    const jsonData = JSON.stringify(data);
    const buffer = new TextEncoder().encode(jsonData);
    return (
      "0x" +
      Array.from(buffer)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    );
  } catch (error) {
    console.error("Failed to generate ProtocolData:", error);
    throw new Error("Failed to serialize protocol data");
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
  outPoint: { txHash: string; index: number }
): Promise<ProtocolData> {
  const cell = await fetchProtocolCellByOutPoint(signer, outPoint);
  if (!cell) {
    throw new Error("Protocol cell not found at specified outpoint");
  }
  return parseProtocolData(cell.data);
}

/**
 * Fetch current protocol data from blockchain or return mock data
 * @param signer - CCC signer instance (optional when using mock data)
 * @returns Current ProtocolData
 */
export async function fetchProtocolData(
  signer?: ccc.Signer
): Promise<ProtocolData> {
  if (!USE_BLOCKCHAIN) {
    console.log("Fetching mock protocol data for development");
    // Return mock data directly (already in SDK format)
    return getMockProtocolData();
  }

  const cell = await fetchProtocolCell(signer);
  if (!cell) {
    throw new Error("Protocol cell not found on blockchain");
  }
  return parseProtocolData(cell.data);
}

/**
 * Get protocol metrics from blockchain data or mock data
 * @param signer - CCC signer instance (optional when using mock data)
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
      timestamp = bufferToNumber(data.last_updated);
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
      totalCampaigns: data.campaigns_approved.length,
      activeCampaigns: data.campaigns_approved.filter((c: any) => c.status === 4)
        .length,
      totalTippingProposals: data.tipping_proposals.length,
      pendingTippingProposals: data.tipping_proposals.filter(
        (p: any) => !p.tipping_transaction_hash
      ).length,
      totalEndorsers: data.endorsers_whitelist.length,
      lastUpdated: new Date(timestamp * 1000).toISOString(),
    };
  } catch (error) {
    console.error("Failed to fetch protocol metrics:", error);
    throw error;
  }
}

/**
 * Get protocol transaction history
 * @param signer - CCC signer instance (optional when using mock data)
 * @param limit - Maximum number of transactions to fetch
 * @returns Array of protocol transactions
 */
export async function fetchProtocolTransactions(
  signer?: ccc.Signer,
  _limit: number = 50
): Promise<ProtocolTransaction[]> {
  if (!USE_BLOCKCHAIN) {
    console.log("Returning empty transaction history for mock data");
    return [];
  }

  if (!signer) {
    throw new Error("Signer required when USE_BLOCKCHAIN is true");
  }

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
 * Update protocol cell with new data or simulate update for mock data
 * @param signer - CCC signer instance (optional when using mock data)
 * @param newData - New ProtocolData to store
 * @returns Transaction hash (mock hash when using mock data)
 */
export async function updateProtocolCell(
  signer: ccc.Signer | undefined,
  newData: ProtocolData
): Promise<string> {
  if (!USE_BLOCKCHAIN) {
    console.log("Simulating protocol cell update with mock data");
    // In a real application, you might want to persist this to localStorage or a mock database
    // For now, just return a mock transaction hash
    const mockTxHash =
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    console.log("Mock protocol cell updated, mock tx:", mockTxHash);
    return mockTxHash;
  }

  if (!signer) {
    throw new Error("Signer required when USE_BLOCKCHAIN is true");
  }

  try {
    // Get current protocol cell
    const currentCell = await fetchProtocolCell(signer);
    if (!currentCell) {
      throw new Error("Protocol cell not found");
    }

    // Generate new protocol data
    const newCellData = generateProtocolData(newData);

    // Build transaction to update protocol cell
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
          capacity: currentCell.output.capacity,
          lock: currentCell.output.lock,
          type: currentCell.output.type,
        },
      ],
      outputsData: [newCellData],
      cellDeps: [],
      headerDeps: [],
      witnesses: [],
    });

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

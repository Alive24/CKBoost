// Protocol Service - High-level protocol operations
// This service provides high-level protocol operations by delegating to the cell layer

import { ccc, ssri } from "@ckb-ccc/connector-react";
import {
  type ProtocolDataLike,
  CampaignDataLike,
  ProtocolData,
  TippingProposalDataLike,
} from "ssri-ckboost/types";
import {
  ProtocolMetrics,
  ProtocolTransaction,
} from "../types/protocol";
import {
  fetchProtocolCell,
  fetchProtocolCellByOutPoint,
  fetchProtocolTransactions,
} from "../ckb/protocol-cells";
import { Protocol } from "ssri-ckboost";
import { deploymentManager } from "../ckb/deployment-manager";
import { sendTransactionWithFeeRetry } from "../ckb/transaction-wrapper";

/**
 * Protocol service that provides high-level protocol operations
 */
export class ProtocolService {
  private signer: ccc.Signer;
  private protocol: Protocol;

  constructor(signer: ccc.Signer) {
    this.signer = signer;

    // Get the protocol type code outpoint and deployment info
    const network = deploymentManager.getCurrentNetwork();
    const deployment = deploymentManager.getCurrentDeployment(  
      network,
      "ckboostProtocolType"
    );
    const outPoint = deploymentManager.getContractOutPoint(
      network,
      "ckboostProtocolType"
    );

    if (!deployment || !outPoint) {
      throw new Error("Protocol type contract not found in deployments.json");
    }

    // Create the protocol type script
    const protocolTypeScript = {
      codeHash:
        deployment.typeHash ||
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      hashType: "type" as const,
      args: process.env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS || "0x", // Protocol cell type args
    };

    // TODO: Get executor from environment
    const executorUrl =
      process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
    const executor = new ssri.ExecutorJsonRpc(executorUrl);

    this.protocol = new Protocol(outPoint, protocolTypeScript, {
      executor: executor,
    });
  }

  async updateProtocol(updatedData: ProtocolDataLike): Promise<ccc.Hex> {
    if (!this.signer) {
      throw new Error("Signer is required to update protocol");
    }

    if (!this.protocol) {
      throw new Error(
        "Protocol instance not initialized. Check deployment configuration."
      );
    }

    // Create the transaction using the SDK
    const { res: tx } = await this.protocol.updateProtocol(
      this.signer,
      updatedData
    );

    // Complete fees and send transaction with automatic retry
    await tx.completeInputsByCapacity(this.signer);
    await tx.completeFeeBy(this.signer);
    const txHash = await sendTransactionWithFeeRetry(this.signer, tx);

    console.log("Protocol updated, tx:", txHash);
    return txHash;
  }

  async getProtocolData(protocolCell: ccc.Cell): Promise<ReturnType<typeof ProtocolData.decode>> {
    if (!protocolCell) {
      throw new Error(
        "Protocol cell not found on blockchain. Please deploy a new protocol cell using the Protocol Management interface."
      );
    }
    return ProtocolData.decode(protocolCell.outputData);
  }

  async getProtocolCell(): Promise<ccc.Cell> {
    const protocolCell = await fetchProtocolCell(this.signer);
    if (!protocolCell) {
      throw new Error("Protocol cell not found on blockchain. Please deploy a new protocol cell using the Protocol Management interface.");
    }
    return protocolCell;
  }

  /**
   * Get protocol transaction history
   * @param limit - Maximum number of transactions to fetch
   * @returns Array of protocol transactions
   */
  async getProtocolTransactions(
    limit: number = 50
  ): Promise<ProtocolTransaction[]> {
    try {
      return await fetchProtocolTransactions(this.signer, limit);
    } catch (error) {
      console.warn("Failed to fetch protocol transactions:", error);
      throw error;
    }
  }

  /**
   * Parse ProtocolData from cell data using Molecule schema
   * @param cellData - Hex-encoded cell data
   * @returns Parsed ProtocolData
   */
  parseProtocolData(cellData: string): ProtocolDataLike {
    try {
      // For empty or minimal protocol cells, return default structure
      // This allows the app to function while the protocol cell is being deployed
      if (cellData === "0x" || !cellData || cellData.length < 10) {
        console.log(
          "Protocol cell is empty or minimal, returning default structure"
        );

        // Create default values using the new type system
        // For Uint64Type - use bigint
        const defaultTimestamp = BigInt(Date.now());

        // For Byte32Type - use ccc.Hex
        const defaultByte32: ccc.Hex = ("0x" + "00".repeat(32)) as ccc.Hex;

        // Return a default ProtocolData structure that matches the SDK type
        const defaultProtocolData: ProtocolDataLike = {
          campaigns_approved: [],
          tipping_proposals: [],
          tipping_config: {
            approval_requirement_thresholds: [], // Empty Uint128Vec
            expiration_duration: defaultTimestamp, // Uint64 as bigint
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
              ckb_boost_points_udt_type_code_hash: defaultByte32,
              accepted_udt_type_scripts: [],
              accepted_dob_type_scripts: [],
            },
          },
        };

        return defaultProtocolData;
      }

      // Parse actual protocol data using molecule codec
      console.log("Parsing protocol data from cell:", cellData);

      try {
        // Convert hex string to bytes for molecule parsing
        const cellDataBytes = ccc.bytesFrom(cellData);
        console.log("Cell data bytes length:", cellDataBytes.length);

        // Decode using the generated ProtocolData codec
        const protocolData = ProtocolData.decode(cellDataBytes);

        console.log("Successfully parsed protocol data");

        // Return the decoded data - cast through unknown to handle type differences
        // The decoded data has the correct structure but some fields may have different types (bigint vs number)
        // This is acceptable since the consuming code should handle these type variations
        return protocolData as unknown as ProtocolDataLike;
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
  generateProtocolData(data: ProtocolDataLike): string {
    try {
      // Use proper Molecule serialization
      const protocolDataBytes = ProtocolData.encode(data);
      return (
        "0x" +
        Array.from(new Uint8Array(protocolDataBytes))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
      );
    } catch (error) {
      console.error(
        "Failed to generate ProtocolData with Molecule serialization:",
        error
      );
      throw new Error(
        "Failed to serialize protocol data. Please ensure the data structure is valid."
      );
    }
  }

  /**
   * Fetch protocol data by specific outpoint
   * @param signer - CCC signer instance
   * @param outPoint - Specific outpoint to fetch
   * @returns ProtocolData from the specified cell
   */
  async fetchProtocolDataByOutPoint(
    outPoint: { txHash: ccc.Hex; index: ccc.Num }
  ): Promise<ProtocolDataLike> {
    const cell = await fetchProtocolCellByOutPoint(this.signer, outPoint);
    if (!cell) {
      throw new Error(
        "Protocol cell not found at specified outpoint. Please ensure the outpoint is correct or deploy a new protocol cell using the Protocol Management interface."
      );
    }
    return this.parseProtocolData(cell.outputData);
  }

  /**
   * Get protocol metrics from blockchain data
   * @param signer - CCC signer instance
   * @returns Protocol metrics
   */
  async getProtocolMetrics(): Promise<ProtocolMetrics> {
    try {
      const protocolCell = await fetchProtocolCell(this.signer);
      if (!protocolCell) {
        throw new Error(
          "Protocol cell not found on blockchain. Please deploy a new protocol cell using the Protocol Management interface."
        );
      }
      const data = this.parseProtocolData(protocolCell.outputData);

      // Convert timestamp and validate
      let timestamp: number;
      try {
        // The new type system uses bigint for Uint64
        // Convert bigint timestamp to seconds
        if (data.last_updated && typeof data.last_updated === "bigint") {
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
          console.warn(
            `Invalid timestamp value: ${timestamp}, using current time`
          );
          timestamp = Math.floor(Date.now() / 1000);
        }
      } catch (error) {
        console.error("Error converting timestamp:", error);
        timestamp = Math.floor(Date.now() / 1000);
      }

      return {
        totalCampaigns: BigInt(data.campaigns_approved.length),
        activeCampaigns: BigInt(0), // Active campaigns need to be fetched separately by querying each campaign cell
        totalTippingProposals: BigInt(data.tipping_proposals.length),
        pendingTippingProposals: BigInt(
          data.tipping_proposals.filter((p: TippingProposalDataLike) => !p.tipping_transaction_hash)
            .length
        ),
        totalEndorsers: BigInt(data.endorsers_whitelist.length),
        lastUpdated: new Date(timestamp * 1000).toISOString(),
      };
    } catch (error) {
      console.error("Failed to fetch protocol metrics:", error);
      throw error;
    }
  }
}

// Utility functions
export const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString();
};

export const formatLockHash = (hash: string, length: number = 10): string => {
  return hash.length > length ? `${hash.slice(0, length)}...` : hash;
};

export const getCampaignStatusText = (status: number): string => {
  switch (status) {
    case 0:
      return "Draft";
    case 1:
      return "Pending Approval";
    case 2:
      return "Approved";
    case 3:
      return "Rejected";
    case 4:
      return "Active";
    case 5:
      return "Completed";
    case 6:
      return "Cancelled";
    default:
      return "Unknown";
  }
};

export const getQuestStatusText = (status: number): string => {
  switch (status) {
    case 0:
      return "Draft";
    case 1:
      return "Active";
    case 2:
      return "Completed";
    case 3:
      return "Cancelled";
    default:
      return "Unknown";
  }
};

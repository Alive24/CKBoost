// Protocol Service - High-level protocol operations
// This service provides high-level protocol operations by delegating to the cell layer

import { ccc, ssri } from "@ckb-ccc/connector-react";
import {
  type ProtocolDataLike,
  CampaignDataLike,
  ConnectedTypeID,
  ProtocolData,
  TippingDataLike,
} from "ssri-ckboost/types";
import { ProtocolMetrics, ProtocolTransaction } from "../types/protocol";
import {
  fetchProtocolCell,
  fetchProtocolCellByOutPoint,
} from "../ckb/protocol-cells";
import { Protocol } from "ssri-ckboost";
import {guardPrivilegedActorSigner,retainOutputCapacityFloor} from "ssri-ckboost";
import { deploymentManager } from "../ckb/deployment-manager";
import { sendTransactionWithFeeRetry } from "../ckb/transaction-wrapper";
import { createScopedLogger } from "ssri-ckboost";

const log = createScopedLogger("ProtocolService");

/**
 * Protocol service that provides high-level protocol operations
 */
export class ProtocolService {
  private client: ccc.Client;
  private signer?: ccc.Signer;
  private protocol?: Protocol;

  constructor(clientOrSigner: ccc.Client | ccc.Signer) {
    // Check if it's a signer (has getRecommendedAddress method)
    if ("getRecommendedAddress" in clientOrSigner) {
      this.signer = clientOrSigner as ccc.Signer;
      this.client = this.signer.client;
    } else {
      this.client = clientOrSigner as ccc.Client;
    }

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

    const executorUrl =
      process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
    const executor = new ssri.ExecutorJsonRpc(executorUrl);

    // Only create Protocol instance if we have a signer (needed for write operations)
    if (this.signer) {
      this.protocol = new Protocol(outPoint, protocolTypeScript, {
        executor: executor,
      });
    }
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

    const actorLock=(await this.signer.getRecommendedAddressObj()).script;
    const previous=await fetchProtocolCell(this.client);
    const preserved=new Set<number>();
    // Create the transaction using the SDK
    const { res: tx } = await this.protocol.updateProtocol(
      this.signer,
      updatedData
    );

    // Ensure protocol output capacity matches updated data using CCC factory
    try {
      const network = deploymentManager.getCurrentNetwork();
      const protocolTypeCodeHash = deploymentManager.getContractCodeHash(
        network,
        "ckboostProtocolType"
      );
      if (protocolTypeCodeHash) {
        for (let i = 0; i < tx.outputs.length; i++) {
          const out = tx.outputs[i];
          if (
            out.type &&
            out.type.codeHash.slice(0, 32) === protocolTypeCodeHash.slice(0, 32)
          ) {
            tx.outputs[i] = ccc.CellOutput.from(
              { lock: out.lock, type: out.type },
              tx.outputsData[i] as ccc.HexLike
            );
            retainOutputCapacityFloor(tx,i,previous?.cellOutput.capacity??0);
            preserved.add(i);
          }
        }
      }
      const protocolLockCodeHash = deploymentManager.getContractCodeHash(
        network,
        "ckboostProtocolLock"
      );
      if (!protocolLockCodeHash) {
        throw new Error("Tipping type contract not deployed");
      }
      const protocolLockCodeOutPoint = deploymentManager.getContractOutPoint(
        network,
        "ckboostProtocolLock"
      );
      if (!protocolLockCodeHash || !protocolLockCodeOutPoint) {
        throw new Error("Tipping type contract not deployed");
      }
      tx.addCellDeps({
        outPoint: {
          txHash: protocolLockCodeOutPoint.txHash,
          index: protocolLockCodeOutPoint.index,
        },
        depType: "code",
      });
    } catch (e) {
      log.warn("Failed to rebuild protocol outputs for auto-capacity:", e);
    }

    // Complete fees and send transaction with automatic retry
    const txHash = await sendTransactionWithFeeRetry(guardPrivilegedActorSigner(this.signer,actorLock.hash()), tx,{preserveOutputCapacityIndices:preserved});

    log.info("Protocol updated, tx:", txHash);
    return txHash;
  }

  async getProtocolData(
    protocolCell: ccc.Cell
  ): Promise<ReturnType<typeof ProtocolData.decode>> {
    if (!protocolCell) {
      throw new Error(
        "Protocol cell not found on blockchain. Please deploy a new protocol cell using the Protocol Management interface."
      );
    }
    return ProtocolData.decode(protocolCell.outputData);
  }

  async getProtocolCell(): Promise<ccc.Cell> {
    const protocolCell = await fetchProtocolCell(this.client);
    if (!protocolCell) {
      throw new Error(
        "Protocol cell not found on blockchain. Please deploy a new protocol cell using the Protocol Management interface."
      );
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
      // Get protocol type script
      const network = deploymentManager.getCurrentNetwork();
      const deployment = deploymentManager.getCurrentDeployment(
        network,
        "ckboostProtocolType"
      );

      if (!deployment || !deployment.typeHash) {
        throw new Error(
          `Protocol type contract not found in deployments.json for ${network}`
        );
      }

      const protocolTypeScript = {
        codeHash: deployment.typeHash,
        hashType: "type" as const,
        args: process.env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS || "0x",
      };

      // Search for transactions involving protocol cells
      const searchKey = {
        script: protocolTypeScript,
        scriptType: "type" as const,
        scriptSearchMode: "exact" as const,
        groupByTransaction: true as const,
      };

      const pageSize = Math.min(limit, 50);
      const transactions: ProtocolTransaction[] = [];

      for await (const match of this.client.findTransactions(
        searchKey,
        "desc",
        pageSize
      )) {
        try {
          const txInfo = await this.client.getTransaction(match.txHash);
          if (!txInfo) {
            continue;
          }

          const blockNumber = txInfo.blockNumber
            ? BigInt(txInfo.blockNumber)
            : undefined;

          if (!blockNumber) {
            throw new Error("Block number not found");
          }

          const block = await this.client.getBlockByNumber(blockNumber);
          if (!block) {
            throw new Error("Block not found");
          }
          const timestamp = block.header.timestamp;
          if (!timestamp) {
            throw new Error("Timestamp not found");
          }

          // Determine transaction type based on transaction content
          // For now, default to "update_config" - can be enhanced later
          const txType: ProtocolTransaction["type"] = "update_config";

          transactions.push({
            txHash: match.txHash,
            type: txType,
            description: `Protocol ${txType}`,
            status: blockNumber ? "confirmed" : "pending",
            timestamp: timestamp.toString(),
          });

          if (transactions.length >= limit) {
            break;
          }
        } catch (error) {
          log.warn("Failed to process protocol transaction:", {
            txHash: match.txHash,
            error,
          });
        }
      }

      return transactions;
    } catch (error) {
      log.warn("Failed to fetch protocol transactions:", error);
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
        log.info(
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
          tippings_approved: [],
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
              ckb_boost_funding_lock_code_hash: defaultByte32,
              ckb_boost_user_type_code_hash: defaultByte32,
              ckb_boost_points_udt_type_code_hash: defaultByte32,
              ckb_boost_tipping_type_code_hash: defaultByte32,
              ckb_boost_achievement_type_code_hash: defaultByte32,
              accepted_udt_type_scripts: [],
              accepted_dob_type_scripts: [],
            },
            streak_bonus_interval: BigInt(7 * 24 * 60 * 60), // 7 days in seconds
            streak_bonus_amount: 100n, // 100 Points
            achievement_type_hashes: [],
          },
        };

        return defaultProtocolData;
      }

      // Parse actual protocol data using molecule codec
      log.info("Parsing protocol data from cell:", cellData);

      try {
        // Convert hex string to bytes for molecule parsing
        const cellDataBytes = ccc.bytesFrom(cellData);
        log.info("Cell data bytes length:", cellDataBytes.length);

        // Decode using the generated ProtocolData codec
        const protocolData = ProtocolData.decode(cellDataBytes);

        log.info("Successfully parsed protocol data");

        // Return the decoded data - cast through unknown to handle type differences
        // The decoded data has the correct structure but some fields may have different types (bigint vs number)
        // This is acceptable since the consuming code should handle these type variations
        return protocolData as unknown as ProtocolDataLike;
      } catch (parseError) {
        log.error("Failed to parse protocol data:", parseError);
        log.error("Cell data that failed to parse:", cellData);

        // If we have non-empty cell data but can't parse it, the cell is corrupted
        // Throw an error to trigger redeployment
        throw new Error(
          "Protocol cell data is corrupted or incompatible. " +
            "Please redeploy the protocol cell using the Protocol Management interface."
        );
      }
    } catch (error) {
      log.error("Failed to parse ProtocolData:", error);
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
      log.error(
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
  async fetchProtocolDataByOutPoint(outPoint: {
    txHash: ccc.Hex;
    index: ccc.Num;
  }): Promise<ProtocolDataLike> {
    const cell = await fetchProtocolCellByOutPoint(this.client, outPoint);
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
      const protocolCell = await fetchProtocolCell(this.client);
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
          log.warn(`Invalid timestamp value: ${timestamp}, using current time`);
          timestamp = Math.floor(Date.now() / 1000);
        }
      } catch (error) {
        log.error("Error converting timestamp:", error);
        timestamp = Math.floor(Date.now() / 1000);
      }

      return {
        totalCampaigns: BigInt(data.campaigns_approved.length),
        activeCampaigns: BigInt(0), // Active campaigns need to be fetched separately by querying each campaign cell
        totalTippings: BigInt(data.tippings_approved.length),
        pendingTippings: BigInt(
          0
          // data.tippings_approved.filter(
          //   (p: TippingDataLike) => !p.tipping_transaction_hash
          // ).length
        ),
        totalEndorsers: BigInt(data.endorsers_whitelist.length),
        lastUpdated: new Date(timestamp * 1000).toISOString(),
      };
    } catch (error) {
      log.error("Failed to fetch protocol metrics:", error);
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

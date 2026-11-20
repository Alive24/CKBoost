import { ccc } from "@ckb-ccc/connector-react";
import {
  CampaignDataLike,
  CampaignData,
  UserSubmissionRecordLike,
  UserDataLike,
  ConnectedTypeID,
} from "ssri-ckboost/types";
import {
  fetchAllUserCells,
  parseUserData,
  extractTypeIdFromUserCell,
} from "@/lib/ckb/user-cells";
import { fetchCampaignByTypeId as fetchCampaignCell } from "@/lib/ckb/campaign-cells";
import { Campaign } from "ssri-ckboost";
import {assertActorNetCapacitySpend,guardPrivilegedActorSigner,retainOutputCapacityFloor} from "ssri-ckboost";
import { deploymentManager } from "../ckb/deployment-manager";
import { udtRegistry } from "@/lib/services/udt-registry";
import { sendTransactionWithFeeRetry } from "../ckb/transaction-wrapper";
import { createScopedLogger } from "ssri-ckboost";
import { injectProxyAuthenticationCell } from "../utils/api";
import type { StaffApprovalResponse } from "@/netlify/lib/staff-approval";
import { registerPendingTransaction } from "@/lib/pending-transactions";
import {
  addClaimablePoolLockCellDep,
  getClaimablePoolLockCodeHash,
} from "../ckb/claimable-pool";

const log = createScopedLogger("CampaignAdminService");

/**
 * Comprehensive service for campaign admin operations
 * Handles all campaign management tasks including submissions, quests, and analytics
 */
export class CampaignAdminService {
  private signer: ccc.Signer;
  private userTypeCodeHash: ccc.Hex;
  private campaignTypeCodeHash: ccc.Hex;
  private protocolCell: ccc.Cell | null;
  private campaign: Campaign | null;

  constructor(
    signer: ccc.Signer,
    userTypeCodeHash: ccc.Hex,
    _protocolTypeHash: ccc.Hex, // Keep in constructor for potential future use
    campaignTypeCodeHash: ccc.Hex,
    protocolCell: ccc.Cell | null,
    campaign?: Campaign | null
  ) {
    this.signer = signer;
    this.userTypeCodeHash = userTypeCodeHash;
    // protocolTypeHash is available if needed in the future
    this.campaignTypeCodeHash = campaignTypeCodeHash;
    this.protocolCell = protocolCell;
    // campaignOutPoint is kept for backward compatibility but not stored
    this.campaign = campaign || null;
  }

  // ============ Public Getters ============

  /**
   * Get the current signer
   */
  public getSigner(): ccc.Signer {
    return this.signer;
  }

  /**
   * Get the protocol cell
   */
  public getProtocolCell(): ccc.Cell | null {
    return this.protocolCell;
  }

  /**
   * Get the campaign type code hash
   */
  public getCampaignTypeCodeHash(): ccc.Hex {
    return this.campaignTypeCodeHash;
  }

  /**
   * Get the user type code hash
   */
  public getUserTypeCodeHash(): ccc.Hex {
    return this.userTypeCodeHash;
  }

  private shouldPreserveApprovalOutputCapacity(output: ccc.CellOutput): boolean {
    const lockCodeHash = output.lock.codeHash.toLowerCase();
    const network = deploymentManager.getCurrentNetwork();
    const fundingLockCodeHash = deploymentManager.getContractCodeHash(
      network,
      "ckboostFundingLock"
    );
    const claimablePoolLockCodeHash = getClaimablePoolLockCodeHash(network);

    return (
      (!!fundingLockCodeHash &&
        lockCodeHash === fundingLockCodeHash.toLowerCase()) ||
      (!!claimablePoolLockCodeHash &&
        lockCodeHash === claimablePoolLockCodeHash.toLowerCase())
    );
  }

  private rebuildApprovalTypedOutput(
    output: ccc.CellOutput,
    outputData: ccc.HexLike
  ): ccc.CellOutput {
    const rebuilt = ccc.CellOutput.from(
      { lock: output.lock, type: output.type },
      outputData
    );
    if (this.shouldPreserveApprovalOutputCapacity(output)) {
      rebuilt.capacity = output.capacity;
    }
    return rebuilt;
  }

  /**
   * Set the campaign instance
   */
  public setCampaign(campaign: Campaign | null): void {
    this.campaign = campaign;
  }

  /**
   * Get the campaign instance
   */
  public getCampaign(): Campaign | null {
    return this.campaign;
  }

  private addPointsUdtCellDep(tx: ccc.Transaction): void {
    const network = deploymentManager.getCurrentNetwork();
    const pointsUdtOutPoint = deploymentManager.getContractOutPoint(
      network,
      "ckboostPointsUdt"
    );

    if (!pointsUdtOutPoint) {
      throw new Error("Points UDT contract not found in deployments.json");
    }

    tx.addCellDeps({
      outPoint: pointsUdtOutPoint,
      depType: "code",
    });
  }

  private async resolveClaimantLockHashes(
    userTypeIds: ccc.Hex[]
  ): Promise<ccc.Hex[]> {
    if (!this.protocolCell?.cellOutput.type) {
      throw new Error("Protocol cell type is required to resolve claimant locks");
    }

    const protocolTypeHash = ccc.hexFrom(this.protocolCell.cellOutput.type.hash());
    return Promise.all(
      userTypeIds.map(async (userTypeId) => {
        const normalizedUserTypeId = ccc.hexFrom(userTypeId);
        const connectedTypeIdArgs = ccc.hexFrom(
          ConnectedTypeID.encode({
            type_id: normalizedUserTypeId,
            connected_key: protocolTypeHash,
          })
        );
        const userCells = this.signer.client.findCells({
          script: {
            codeHash: this.userTypeCodeHash,
            hashType: "type",
            args: connectedTypeIdArgs,
          },
          scriptType: "type",
          scriptSearchMode: "exact",
          withData: true,
        });
        const userCellResult = await userCells.next();
        const userCell = userCellResult.done ? undefined : userCellResult.value;
        if (!userCell) {
          throw new Error(
            `User cell not found for approved user ${ccc.hexFrom(userTypeId)}`
          );
        }
        return ccc.hexFrom(userCell.cellOutput.lock.hash());
      })
    );
  }

  private isSameOutPoint(
    left: ccc.OutPointLike,
    right: ccc.OutPointLike
  ): boolean {
    return left.txHash === right.txHash && left.index === right.index;
  }

  private async ensureSignerPlainCkbInput(
    tx: ccc.Transaction,
    signerLock: ccc.Script
  ): Promise<void> {
    const signerLockHash = ccc.hexFrom(signerLock.hash());

    for (const input of tx.inputs) {
      const cell = await this.signer.client.getCell(input.previousOutput);
      if (
        !cell?.cellOutput.type &&
        cell?.cellOutput.lock.hash() === signerLockHash &&
        ccc.hexFrom(cell.outputData) === "0x"
      ) {
        log.info("Campaign update already has signer plain CKB input", {
          outPoint: input.previousOutput,
        });
        return;
      }
    }

    for await (const cell of this.signer.client.findCells({
      script: signerLock,
      scriptType: "lock",
      scriptSearchMode: "exact",
      filter: {
        scriptLenRange: [0, 1],
        outputDataLenRange: [0, 1],
      },
      withData: true,
    })) {
      if (cell.cellOutput.type || ccc.hexFrom(cell.outputData) !== "0x") {
        continue;
      }

      if (
        tx.inputs.some((input) =>
          this.isSameOutPoint(input.previousOutput, cell.outPoint)
        )
      ) {
        continue;
      }

      tx.addInput({
        previousOutput: cell.outPoint,
        since: "0x0",
        cellOutput: cell.cellOutput,
        outputData: cell.outputData,
      });
      log.info("Added signer plain CKB input for campaign admin auth", {
        outPoint: cell.outPoint,
        capacity: cell.cellOutput.capacity.toString(),
      });
      return;
    }

    throw new Error(
      "No plain CKB cell found for the current signer. A plain CKB input is required to authorize campaign settings or submission review."
    );
  }

  private isNewCampaignInstance(): boolean {
    const args = this.campaign?.script.args;
    if (!args || args === "0x" || args.length <= 2) {
      return true;
    }

    try {
      const connectedTypeId = ConnectedTypeID.decode(args);
      return (
        ccc.hexFrom(connectedTypeId.type_id).toLowerCase() ===
        `0x${"00".repeat(32)}`
      );
    } catch (error) {
      log.warn("Failed to decode campaign type args; treating as update", error);
      return false;
    }
  }

  private async findInputCampaignCell(
    tx: ccc.Transaction
  ): Promise<ccc.Cell | null> {
    for (const input of tx.inputs) {
      const cell = await this.signer.client.getCell(input.previousOutput);
      if (cell?.cellOutput.type?.codeHash === this.campaignTypeCodeHash) {
        return cell;
      }
    }

    return null;
  }

  // ============ Helper Methods ============

  /**
   * Fetch campaign by its type ID
   */
  private async fetchCampaignByTypeId(campaignTypeId: ccc.Hex) {
    if (!this.protocolCell) {
      throw new Error(
        `Protocol cell is required to fetch campaign. Campaign type ID: ${campaignTypeId}. ` +
          "Please ensure the protocol cell is loaded before attempting campaign operations."
      );
    }
    return await fetchCampaignCell(
      campaignTypeId,
      this.campaignTypeCodeHash,
      this.signer.client,
      this.protocolCell
    );
  }

  /**
   * Parse campaign data from a cell
   */
  private parseCampaignData(cell: ccc.Cell): CampaignDataLike | null {
    try {
      return CampaignData.decode(cell.outputData);
    } catch (err) {
      log.error("Failed to parse campaign data", err);
      return null;
    }
  }

  // ============ Campaign Management ============

  /**
   * Update an existing campaign (or create a new one if no campaignTypeId)
   * @param campaignData - Campaign data to create/update
   * @param campaignTypeId - Campaign type ID to update (omit for new campaigns)
   * @param tx - Optional existing transaction
   * @param udtFunding - Optional UDT assets to fund the campaign with
   * @returns Transaction hash
   */
  async updateCampaign(
    campaignData: CampaignDataLike,
    campaignTypeId?: ccc.Hex,
    _tx?: ccc.Transaction, // Kept for backward compatibility but not used
    udtFunding?: Array<{ scriptHash: string; amount: bigint }>,
    ckbFunding?: bigint
  ): Promise<ccc.Hex> {
    if (!this.signer) {
      throw new Error(
        "Signer is required to update a campaign. " +
          "Please connect your wallet before attempting to update the campaign."
      );
    }

    if (!this.campaign) {
      throw new Error(
        "Campaign SSRI instance not initialized. " +
          "This typically happens when the campaign failed to load from the blockchain. " +
          "Please refresh the page and ensure you have the correct campaign type ID."
      );
    }

    if (!this.protocolCell) {
      throw new Error(
        "Protocol cell not found. Campaign cells must be tied to a protocol cell. " +
          "Please ensure the protocol is deployed and the protocol cell is loaded before creating or updating campaigns."
      );
    }

    try {
      let updateTx: ccc.Transaction;

      // New Campaign
      if (!campaignTypeId) {
        const result = await this.campaign.updateCampaign(
          this.signer,
          campaignData
        );
        updateTx = result.res;

        // Ensure campaign output capacity matches updated data size
        // Rebuild any campaign-type outputs via CCC factory using outputsData to trigger auto-capacity
        for (let i = 0; i < updateTx.outputs.length; i++) {
          const out = updateTx.outputs[i];
          if (
            out.type &&
            out.type.codeHash.slice(0, 32) ===
              this.campaignTypeCodeHash.slice(0, 32)
          ) {
            updateTx.outputs[i] = ccc.CellOutput.from(
              { lock: out.lock, type: out.type },
              updateTx.outputsData[i] as ccc.HexLike
            );
          }
        }
      } else {
        // Campaign updates now require a type ID, not type hash
        // The campaign should already have the current data loaded
        throw new Error(
          "Campaign updates by type hash are no longer supported. " +
            "Please use fetchCampaignByTypeId to get the campaign, then update it."
        );
      }

      if (!updateTx) {
        throw new Error(
          "Failed to generate transaction from SSRI updateCampaign method. " +
            "This may be due to invalid campaign data or SSRI server issues. " +
            "Please check the campaign data format and try again."
        );
      }

      // Add UDT funding if provided
      if (udtFunding && udtFunding.length > 0) {
        log.info("Adding UDT funding to campaign transaction");

        // Import FundingService dynamically to avoid circular dependencies
        const { FundingService } = await import(
          "@/lib/services/funding-service"
        );
        const { deploymentManager } = await import(
          "@/lib/ckb/deployment-manager"
        );
        const { udtRegistry } = await import("@/lib/services/udt-registry");

        // Get code hashes
        const network = deploymentManager.getCurrentNetwork();
        const campaignTypeCodeHash = deploymentManager.getContractCodeHash(
          network,
          "ckboostCampaignType"
        );
        const fundingLockCodeHash =
          deploymentManager.getContractCodeHash(
            network,
            "ckboostFundingLock"
          ) || "0x" + "00".repeat(32);

        if (!campaignTypeCodeHash) {
          throw new Error(
            `Campaign type contract not deployed on ${network} network. ` +
              "Please deploy the contracts first using the deployment manager."
          );
        }

        // Create funding service
        const fundingService = new FundingService(
          this.signer,
          campaignTypeCodeHash,
          fundingLockCodeHash as ccc.Hex,
          this.protocolCell!
        );

        // Convert funding to UDTAssetLike format
        const udtAssets = udtFunding.map((funding) => {
          // Find token by script hash
          const token = Array.from(udtRegistry.getAllTokens()).find((t) => {
            const script = ccc.Script.from({
              codeHash: t.script.codeHash,
              hashType: t.script.hashType,
              args: t.script.args,
            });
            return script.hash() === funding.scriptHash;
          });

          if (!token) {
            throw new Error(
              `Token not found for script hash: ${funding.scriptHash}`
            );
          }

          return {
            udt_script: {
              codeHash: token.script.codeHash,
              hashType: token.script.hashType,
              args: token.script.args,
            },
            amount: funding.amount,
          };
        });

        // Get the campaign owner's lock from the transaction outputs
        const campaignOutput = updateTx.outputs.find(
          (output) =>
            output.type?.codeHash.slice(0, 32) ===
            this.campaignTypeCodeHash.slice(0, 32)
        );
        if (!campaignOutput) {
          throw new Error(
            "Campaign output not found in transaction. " +
              "The transaction structure may be invalid. " +
              `Expected campaign type code hash: ${this.campaignTypeCodeHash.slice(
                0,
                10
              )}...`
          );
        }

        const campaignTypeHash = campaignOutput.type?.hash();
        if (!campaignTypeHash) {
          throw new Error(
            "Campaign type hash not found in the campaign output. " +
              "The campaign cell may not have a proper type script attached."
          );
        }

        const fundingLock = ccc.Script.from({
          codeHash: fundingLockCodeHash,
          hashType: campaignOutput.lock.hashType,
          args: ccc.bytesFrom(campaignTypeHash),
        });

        // Add UDT funding to the transaction
        updateTx = await fundingService.addUDTFundingToTransaction(
          updateTx,
          fundingLock,
          udtAssets
        );

        log.info("UDT funding added to transaction");
      }

      // Add CKB funding if provided
      if (ckbFunding && ckbFunding > 0n) {
        const { FundingService } = await import(
          "@/lib/services/funding-service"
        );
        const { deploymentManager } = await import(
          "@/lib/ckb/deployment-manager"
        );

        const network = deploymentManager.getCurrentNetwork();
        const campaignTypeCodeHash = deploymentManager.getContractCodeHash(
          network,
          "ckboostCampaignType"
        );
        const fundingLockCodeHash =
          deploymentManager.getContractCodeHash(
            network,
            "ckboostFundingLock"
          ) || "0x" + "00".repeat(32);
        if (!campaignTypeCodeHash)
          throw new Error(`Campaign type contract not deployed on ${network}`);

        const fundingService = new FundingService(
          this.signer,
          campaignTypeCodeHash as ccc.Hex,
          fundingLockCodeHash as ccc.Hex,
          this.protocolCell!
        );

        // Determine funding lock from the freshly built campaign output
        const campaignOutput = updateTx.outputs.find(
          (output) =>
            output.type?.codeHash.slice(0, 32) ===
            this.campaignTypeCodeHash.slice(0, 32)
        );
        if (!campaignOutput)
          throw new Error("Campaign output not found for CKB funding");
        const campaignTypeHash = campaignOutput.type?.hash();
        if (!campaignTypeHash)
          throw new Error("Campaign type hash missing for CKB funding");

        const fundingLock = ccc.Script.from({
          codeHash: fundingLockCodeHash as ccc.Hex,
          hashType: campaignOutput.lock.hashType,
          args: ccc.bytesFrom(campaignTypeHash),
        });

        updateTx = await fundingService.addCKBFundingToTransaction(
          updateTx,
          fundingLock,
          ckbFunding
        );
        log.info("CKB funding added to transaction");
      }

      const network = deploymentManager.getCurrentNetwork();
      const protocolLockCodeHash = deploymentManager.getContractCodeHash(
        network,
        "ckboostProtocolLock"
      );
      if (!protocolLockCodeHash) {
        throw new Error("Tipping type contract not deployed");
      }
      const currentUserLock = (await this.signer.getRecommendedAddressObj())
        .script;
      const protocolTypeHash = this.protocolCell.cellOutput.type?.hash();
      if (!protocolTypeHash) {
        throw new Error("Protocol type hash not found");
      }
      const connectedIDforProtocolLock = ConnectedTypeID.encode({
        type_id: currentUserLock.hash(),
        connected_key: protocolTypeHash,
      });

      const protocolLockCodeOutPoint = deploymentManager.getContractOutPoint(
        network,
        "ckboostProtocolLock"
      );
      if (!protocolLockCodeHash || !protocolLockCodeOutPoint) {
        throw new Error("Tipping type contract not deployed");
      }
      updateTx.addCellDeps({
        outPoint: {
          txHash: protocolLockCodeOutPoint.txHash,
          index: protocolLockCodeOutPoint.index,
        },
        depType: "code",
      });

      const campaignCellOutputIndex = updateTx.outputs.findIndex(
        (output) => output.type?.codeHash === this.campaignTypeCodeHash
      );
      const campaignCell = updateTx.outputs[campaignCellOutputIndex];
      if (!campaignCell) {
        throw new Error("Campaign cell not found in transaction");
      }

      if (this.isNewCampaignInstance()) {
        campaignCell.lock = ccc.Script.from({
          codeHash: protocolLockCodeHash,
          hashType: this.protocolCell.cellOutput.lock.hashType,
          args: ccc.hexFrom(connectedIDforProtocolLock),
        });
      } else {
        const inputCampaignCell = await this.findInputCampaignCell(updateTx);
        if (!inputCampaignCell) {
          throw new Error(
            "Existing campaign input cell not found while preserving campaign ownership."
          );
        }
        const inputCampaignData = this.parseCampaignData(inputCampaignCell);
        if (!inputCampaignData) {
          throw new Error(
            "Failed to parse existing campaign data while preserving campaign ownership."
          );
        }

        campaignCell.lock = inputCampaignCell.cellOutput.lock;
        updateTx.outputsData[campaignCellOutputIndex] = ccc.hexFrom(
          CampaignData.encode({
            ...campaignData,
            endorser_lock_hash: inputCampaignData.endorser_lock_hash,
          })
        );
        retainOutputCapacityFloor(updateTx,campaignCellOutputIndex,inputCampaignCell.cellOutput.capacity);
      }

      await this.ensureSignerPlainCkbInput(updateTx, currentUserLock);

      // Log the finalized transaction shape before fee completion and signing.
      const txBytes = updateTx.toBytes();
      const txHex = ccc.hexFrom(txBytes);
      log.info("=== TRANSACTION BYTES TO RPC ===");
      log.info("Transaction Structure:", {
        version: updateTx.version,
        cellDeps: updateTx.cellDeps.map((dep: ccc.CellDep) => ({
          outPoint: {
            txHash: dep.outPoint.txHash,
            index: dep.outPoint.index,
          },
          depType: dep.depType,
        })),
        inputs: updateTx.inputs.map((input: ccc.CellInput) => ({
          previousOutput: {
            txHash: input.previousOutput.txHash,
            index: input.previousOutput.index,
          },
          since: input.since,
        })),
        outputs: updateTx.outputs.map((output: ccc.CellOutput) => ({
          capacity: output.capacity.toString(),
          lock: {
            codeHash: output.lock.codeHash,
            hashType: output.lock.hashType,
            args: output.lock.args,
          },
          type: output.type
            ? {
                codeHash: output.type.codeHash,
                hashType: output.type.hashType,
                args: output.type.args,
              }
            : null,
        })),
        outputsData: updateTx.outputsData.map((data: ccc.HexLike) =>
          typeof data === "string" ? data : ccc.hexFrom(data)
        ),
        witnesses: updateTx.witnesses.map((witness: ccc.HexLike) =>
          typeof witness === "string" ? witness : ccc.hexFrom(witness)
        ),
      });
      log.info("Transaction Hex:", txHex);
      log.info("Transaction Size:", txBytes.length, "bytes");
      log.info("=== END TRANSACTION BYTES ===");

      const txHash = await sendTransactionWithFeeRetry(guardPrivilegedActorSigner(this.signer,currentUserLock.hash()), updateTx,{preserveOutputCapacityIndices:new Set([campaignCellOutputIndex])});

      log.info("Campaign updated:", { campaignTypeId, txHash });
      return txHash;
    } catch (error) {
      log.error("Failed to update campaign:", error);
      throw error;
    }
  }

  // ============ Submission Management ============

  /**
   * Fetch all submissions for a campaign
   * Returns submissions grouped by quest ID and user details
   */
  async fetchCampaignSubmissions(campaignTypeId: ccc.Hex): Promise<{
    submissions: Map<
      number,
      Array<UserSubmissionRecordLike & { userTypeId: string }>
    >;
    userDetails: Map<string, UserDataLike>;
    campaignData: CampaignDataLike;
    stats: {
      totalSubmissions: number;
      pendingReview: number;
      approved: number;
    };
  }> {
    log.log(
      "Fetching submissions for campaign",
      campaignTypeId.slice(0, 10) + "..."
    );

    // Fetch the campaign to get quest details
    const campaignCell = await this.fetchCampaignByTypeId(campaignTypeId);
    if (!campaignCell) {
      throw new Error(
        `Campaign not found with type ID: ${campaignTypeId}. ` +
          "The campaign may have been deleted or the type ID may be incorrect."
      );
    }

    // Parse campaign data
    const campaignData = this.parseCampaignData(campaignCell);
    if (!campaignData) {
      throw new Error(
        `Failed to parse campaign data from cell. Campaign type ID: ${campaignTypeId}. ` +
          "The cell data may be corrupted or in an unexpected format."
      );
    }

    // Fetch all user cells
    const userCells = await fetchAllUserCells(
      this.userTypeCodeHash,
      this.signer
    );
    log.log(`Found ${userCells.length} total user cells`);

    // Process submissions
    const submissions = new Map<
      number,
      Array<UserSubmissionRecordLike & { userTypeId: string }>
    >();
    const userDetails = new Map<string, UserDataLike>();
    let totalSubmissions = 0;
    let pendingReview = 0;

    for (const userCell of userCells) {
      try {
        // Extract user type ID
        const userTypeId = extractTypeIdFromUserCell(userCell);
        if (!userTypeId) continue;

        // Parse user data
        const userData = parseUserData(userCell);
        if (!userData) continue;

        // Store user details
        userDetails.set(userTypeId, userData);

        // Filter submissions for this campaign
        const userSubmissions = userData.submission_records.filter((record) => {
          // Convert campaign_type_id to hex for comparison
          let recordCampaignId: string;
          if (typeof record.campaign_type_id === "string") {
            recordCampaignId = record.campaign_type_id;
          } else if (
            record.campaign_type_id &&
            ArrayBuffer.isView(record.campaign_type_id)
          ) {
            recordCampaignId = ccc.hexFrom(record.campaign_type_id);
          } else {
            recordCampaignId = "0x";
          }

          return recordCampaignId === campaignTypeId;
        });

        // Group submissions by quest ID
        for (const submission of userSubmissions) {
          const questId = Number(submission.quest_id);

          if (!submissions.has(questId)) {
            submissions.set(questId, []);
          }

          submissions.get(questId)!.push({
            ...submission,
            userTypeId,
          });

          totalSubmissions++;

          // Check if this submission is already approved
          const quest = campaignData.quests?.find(
            (q) => Number(q.quest_id) === questId
          );
          const isApproved =
            quest?.accepted_submission_user_type_ids?.includes(userTypeId);

          if (!isApproved) {
            pendingReview++;
          }
        }
      } catch (err) {
        log.error("Failed to process user cell", err);
        continue;
      }
    }

    // Calculate approved count
    const approved =
      campaignData.quests?.reduce((total, quest) => {
        return total + (quest.accepted_submission_user_type_ids?.length || 0);
      }, 0) || 0;

    log.log("Submission fetch complete", {
      totalSubmissions,
      uniqueUsers: userDetails.size,
      pendingReview,
      approved,
      questsWithSubmissions: submissions.size,
    });

    return {
      submissions,
      userDetails,
      campaignData,
      stats: {
        totalSubmissions,
        pendingReview,
        approved,
      },
    };
  }

  /**
   * Get approved completions for a quest
   * Returns list of user type IDs that have been approved
   *
   * @param campaignTypeId - Campaign type ID
   * @param questId - Quest ID
   * @returns Array of approved user type IDs
   */
  async getApprovedCompletions(
    campaignTypeId: ccc.Hex,
    questId: number
  ): Promise<ccc.Hex[]> {
    try {
      // Fetch campaign cell by type ID
      const campaignCell = await fetchCampaignCell(
        campaignTypeId,
        this.campaignTypeCodeHash,
        this.signer.client,
        this.protocolCell!
      );

      if (!campaignCell) {
        throw new Error(
          `Campaign not found with type ID: ${campaignTypeId}. ` +
            "The campaign may have been deleted or the type ID may be incorrect."
        );
      }

      // Parse campaign data
      const campaignData = CampaignData.decode(campaignCell.outputData);

      // Find the quest
      const quest = campaignData.quests.find((q) => Number(q.quest_id) === questId);
      if (!quest) {
        throw new Error(
          `Quest with ID ${questId} not found in campaign ${campaignTypeId}. ` +
            `Available quest IDs: ${campaignData.quests
              .map((q) => q.quest_id)
              .join(", ")}`
        );
      }

      // Return approved user type IDs
      return quest.accepted_submission_user_type_ids || [];
    } catch (error) {
      log.error("Failed to get approved completions:", error);
      throw error;
    }
  }

  private async buildApproveCompletionTransaction(
    campaignTypeId: ccc.Hex,
    questId: number,
    userTypeIds: ccc.Hex[]
  ): Promise<ccc.Transaction> {
    if (!this.signer) {
      throw new Error("Signer is required to approve quest completions");
    }

    if (!this.campaign) {
      throw new Error(
        "Campaign SSRI instance not initialized. " +
          "This typically happens when the campaign failed to load from the blockchain. " +
          "Please refresh the page and ensure you have the correct campaign type ID."
      );
    }

    if (userTypeIds.length === 0) {
      throw new Error("At least one user type ID must be provided");
    }

    log.log("Approving quest completions", {
      campaign: campaignTypeId.slice(0, 10) + "...",
      questId,
      userTypeIds,
    });

    // Fetch the campaign to get current data
    const campaignCell = await this.fetchCampaignByTypeId(campaignTypeId);
    if (!campaignCell) {
      throw new Error(
        `Campaign not found with type ID: ${campaignTypeId}. ` +
          "The campaign may have been deleted or the type ID may be incorrect."
      );
    }

    const campaignData = this.parseCampaignData(campaignCell);
    if (!campaignData) {
      throw new Error(
        `Failed to parse campaign data from cell. Campaign type ID: ${campaignTypeId}. ` +
          "The cell data may be corrupted or in an unexpected format."
      );
    }

    try {
      // Stage 1: Approve completions and create claimable Points pool outputs.
      log.info("Trying approveCompletion");
      const claimablePoolLockCodeHash = getClaimablePoolLockCodeHash();
      if (!claimablePoolLockCodeHash) {
        throw new Error(
          "Claimable Pool Lock contract not found in claimable-pool-lock/deployments.json"
        );
      }
      const claimantLockHashes =
        await this.resolveClaimantLockHashes(userTypeIds);
      const { res: tx } = await this.campaign.approveCompletion(
        this.signer,
        campaignData,
        questId,
        userTypeIds,
        claimantLockHashes,
        claimablePoolLockCodeHash
      );

      this.addPointsUdtCellDep(tx);
      addClaimablePoolLockCellDep(tx);

      const fundingLockOutPoint = deploymentManager.getContractOutPoint(
        deploymentManager.getCurrentNetwork(),
        "ckboostFundingLock"
      );

      if (!fundingLockOutPoint) {
        throw new Error("Funding Lock contract not found in deployments.json");
      }

      tx.addCellDeps({
        outPoint: {
          txHash: fundingLockOutPoint.txHash,
          index: fundingLockOutPoint.index,
        },
        depType: "code",
      });

      const protocolLockCodeOutPoint = deploymentManager.getContractOutPoint(
        deploymentManager.getCurrentNetwork(),
        "ckboostProtocolLock"
      );

      if (!protocolLockCodeOutPoint) {
        throw new Error("Protocol lock code hash not found");
      }

      tx.addCellDeps({
        outPoint: protocolLockCodeOutPoint,
        depType: "code",
      });

      // Add CellDeps for UDT
      const quest = campaignData.quests.find((q) => q.quest_id === questId);
      if (!quest) {
        throw new Error("Quest not found");
      }
      for (const reward of quest.rewards_on_completion) {
        for (const udtAsset of reward.udt_assets) {
          const udtAssetScript = ccc.Script.from(udtAsset.udt_script);
          const udtToken = udtRegistry.getTokenByScriptHash(
            ccc.hexFrom(udtAssetScript.hash())
          );
          if (!udtToken) {
            throw new Error(
              `UDT token not found for script hash: ${udtAsset.udt_script.codeHash}`
            );
          }
          const udtContractCell =
            await this.signer.client.findSingletonCellByType(
              udtToken?.contractScript
            );
          if (!udtContractCell) {
            throw new Error(
              `UDT contract cell not found for script hash: ${udtAsset.udt_script.codeHash}`
            );
          }
          tx.addCellDeps({
            outPoint: udtContractCell.outPoint,
            depType: "code",
          });
        }
      }

      const campaignOutputIndex=tx.outputs.findIndex(output=>output.type?.hash()===campaignCell.cellOutput.type?.hash());
      if(campaignOutputIndex<0)throw new Error("Campaign output missing from approval transaction.");
      retainOutputCapacityFloor(tx,campaignOutputIndex,campaignCell.cellOutput.capacity);
      return tx;
    } catch (error) {
      log.error("Failed to approve quest completions:", error);
      throw error;
    }
  }

  /**
   * Approve quest completions with Points minting (Stage 1)
   *
   * @param campaignTypeId - Campaign type ID
   * @param questId - Quest ID to approve
   * @param userTypeIds - Array of user type IDs to approve
   * @returns Transaction hash
   */
  async approveCompletion(
    campaignTypeId: ccc.Hex,
    questId: number,
    userTypeIds: ccc.Hex[]
  ): Promise<string> {
    const actorLock=(await this.signer.getRecommendedAddressObj()).script;
    const tx = await this.buildApproveCompletionTransaction(
      campaignTypeId,
      questId,
      userTypeIds
    );

    await this.ensureSignerPlainCkbInput(tx,actorLock);
    const preserved=new Set(tx.outputs.flatMap((output,index)=>output.type?.codeHash===this.campaignTypeCodeHash?[index]:[]));
    const txHash = await sendTransactionWithFeeRetry(guardPrivilegedActorSigner(this.signer,actorLock.hash()), tx,{preserveOutputCapacityIndices:preserved});

    log.info("Quest completions approved with Points minting:", {
      campaignTypeId,
      questId,
      userTypeIds,
      txHash,
      pointsMinted: true,
    });

    return txHash;
  }

  async approveCompletionViaProxy(
    campaignTypeId: ccc.Hex,
    questId: number,
    userTypeIds: ccc.Hex[]
  ): Promise<string> {
    if (!this.signer) {
      throw new Error("Signer is required to approve quest completions");
    }

    const actorLock=(await this.signer.getRecommendedAddressObj()).script;
    const tx = await this.buildApproveCompletionTransaction(
      campaignTypeId,
      questId,
      userTypeIds
    );

    // The proxy administrator is a co-signer, not proof of the requester's
    // assignment. Keep a real staff wallet input bound into the signed tx even
    // when no extra capacity would otherwise be collected.
    await this.ensureSignerPlainCkbInput(
      tx,
      actorLock
    );

    await injectProxyAuthenticationCell(this.signer, tx);
    await tx.completeInputsByCapacity(this.signer);

    for (let i = 0; i < tx.inputs.length; i += 1) {
      const inputCell = await this.signer.client.getCell(
        tx.inputs[i].previousOutput
      );
      if (!inputCell) {
        throw new Error("Input cell not found while preparing staff approval tx.");
      }
      tx.inputs[i] = ccc.CellInput.from({
        previousOutput: inputCell.outPoint,
        since: tx.inputs[i].since ?? "0x0",
        cellOutput: inputCell.cellOutput,
        outputData: inputCell.outputData,
      });
    }

    for (let i = 0; i < tx.outputs.length; i += 1) {
      const out = tx.outputs[i];
      if (out.type) {
        tx.outputs[i] = this.rebuildApprovalTypedOutput(
          out,
          tx.outputsData[i] as ccc.HexLike
        );
      }
    }

    const inputCampaignCell=await this.findInputCampaignCell(tx);
    if(!inputCampaignCell)throw new Error("Campaign input missing before staff approval.");
    const outputCampaignIndex=tx.outputs.findIndex(output=>output.type?.hash()===inputCampaignCell.cellOutput.type?.hash());
    retainOutputCapacityFloor(tx,outputCampaignIndex,inputCampaignCell.cellOutput.capacity);
    await tx.completeFeeBy(this.signer);
    await assertActorNetCapacitySpend(this.signer,tx,actorLock.hash());

    const response = await fetch("/api/staff-approve-submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        txHex: ccc.hexFrom(tx.toBytes()),
        campaignTypeId: ccc.hexFrom(campaignTypeId),
        questId,
        userTypeIds: userTypeIds.map((id) => ccc.hexFrom(id)),
      }),
    });

    const payload = (await response.json()) as StaffApprovalResponse;
    if (!payload.success) {
      throw new Error(
        payload.message ||
          payload.error ||
          "Staff approval validation failed on server."
      );
    }

    if (!response.ok) {
      throw new Error(
        `Staff approval validation failed (status ${response.status}).`
      );
    }

    const validatedTx = ccc.Transaction.fromBytes(payload.txHex as ccc.Hex);
    const signedRawHash=validatedTx.hash();

    for (let i = 0; i < validatedTx.inputs.length; i += 1) {
      const inputCell = await this.signer.client.getCell(
        validatedTx.inputs[i].previousOutput
      );
      if (!inputCell) {
        throw new Error("Input cell not found while finalising approval tx.");
      }
      validatedTx.inputs[i] = ccc.CellInput.from({
        previousOutput: inputCell.outPoint,
        since: validatedTx.inputs[i].since ?? "0x0",
        cellOutput: inputCell.cellOutput,
        outputData: inputCell.outputData,
      });
    }

    // Only the local input cache may be hydrated after proxy signing. Raw
    // fields (especially typed-output capacities) must remain byte-identical.
    if(validatedTx.hash()!==signedRawHash)throw new Error("Proxy-signed transaction changed during input hydration.");
    const txHash = await guardPrivilegedActorSigner(this.signer,actorLock.hash(),signedRawHash).sendTransaction(validatedTx);
    log.info("Quest completions approved via proxy:", {
      campaignTypeId,
      questId,
      userTypeIds,
      txHash,
      viaProxy: true,
    });

    registerPendingTransaction(txHash, {
      label: "Staff quest approval",
      context: "CampaignAdminService",
    });

    return txHash;
  }

  // ============ Analytics ============

  /**
   * Get campaign statistics
   */
  async getCampaignStats(campaignTypeId: ccc.Hex): Promise<{
    totalQuests: number;
    totalPointsAllocated: number;
    totalPointsDistributed: number;
    participantCount: number;
    completionRate: number;
    averagePointsPerUser: number;
  }> {
    const campaignCell = await this.fetchCampaignByTypeId(campaignTypeId);
    if (!campaignCell) {
      throw new Error(
        `Campaign not found with type ID: ${campaignTypeId}. ` +
          "The campaign may have been deleted or the type ID may be incorrect."
      );
    }

    const campaignData = this.parseCampaignData(campaignCell);
    if (!campaignData) {
      throw new Error(
        `Failed to parse campaign data from cell. Campaign type ID: ${campaignTypeId}. ` +
          "The cell data may be corrupted or in an unexpected format."
      );
    }

    const { stats } = await this.fetchCampaignSubmissions(campaignTypeId);

    const totalQuests = campaignData.quests?.length || 0;
    const totalPointsAllocated =
      campaignData.quests?.reduce(
        (sum, quest) => sum + Number(quest.points || 0),
        0
      ) || 0;

    // Calculate points distributed based on approved submissions
    let totalPointsDistributed = 0;
    for (const quest of campaignData.quests || []) {
      const approvedCount =
        quest.accepted_submission_user_type_ids?.length || 0;
      totalPointsDistributed += approvedCount * Number(quest.points || 0);
    }

    const completionRate =
      stats.totalSubmissions > 0
        ? (stats.approved / stats.totalSubmissions) * 100
        : 0;

    // Calculate average points per approval instead of per user
    const averagePointsPerUser =
      stats.approved > 0 ? totalPointsDistributed / stats.approved : 0;

    return {
      totalQuests,
      totalPointsAllocated,
      totalPointsDistributed,
      participantCount: stats.approved, // Use approved count as participant count
      completionRate,
      averagePointsPerUser,
    };
  }

  /**
   * Get submission trends over time
   */
  async getSubmissionTrends(
    campaignTypeId: ccc.Hex,
    days: number = 7
  ): Promise<{
    daily: Array<{ date: string; submissions: number; approvals: number }>;
  }> {
    const { submissions } = await this.fetchCampaignSubmissions(campaignTypeId);

    // Group submissions by date
    const dailyData = new Map<
      string,
      { submissions: number; approvals: number }
    >();
    const now = Date.now();
    const cutoff = now - days * 24 * 60 * 60 * 1000;

    // Initialize daily data
    for (let i = 0; i < days; i++) {
      const date = new Date(now - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split("T")[0];
      dailyData.set(dateStr, { submissions: 0, approvals: 0 });
    }

    // Count submissions by date
    for (const [, questSubmissions] of submissions) {
      for (const submission of questSubmissions) {
        const timestamp = Number(submission.submission_timestamp);
        if (timestamp < cutoff) continue;

        const date = new Date(timestamp);
        const dateStr = date.toISOString().split("T")[0];

        if (dailyData.has(dateStr)) {
          const data = dailyData.get(dateStr)!;
          data.submissions++;
          // Note: We'd need to track approval timestamps to properly count daily approvals
          // For now, this is a placeholder
        }
      }
    }

    return {
      daily: Array.from(dailyData.entries())
        .map(([date, data]) => ({ date, ...data }))
        .reverse(),
    };
  }
}

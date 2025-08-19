import { ccc } from "@ckb-ccc/core";
import {
  CampaignDataLike,
  CampaignData,
  UserSubmissionRecordLike,
  UserDataLike,
} from "ssri-ckboost/types";
import {
  fetchAllUserCells,
  parseUserData,
  extractTypeIdFromUserCell,
} from "@/lib/ckb/user-cells";
import { fetchCampaignByTypeId as fetchCampaignCell, fetchCampaignCells } from "@/lib/ckb/campaign-cells";
import { debug } from "@/lib/utils/debug";
import { Campaign } from "ssri-ckboost";
import { deploymentManager } from "../ckb/deployment-manager";
import { ssri } from "@ckb-ccc/connector-react";

// Define Quest type based on CampaignDataLike structure
type QuestLike = NonNullable<CampaignDataLike["quests"]>[number];

/**
 * Comprehensive service for campaign admin operations
 * Handles all campaign management tasks including submissions, quests, and analytics
 */
export class CampaignAdminService {
  private signer: ccc.Signer;
  private userTypeCodeHash: ccc.Hex;
  private campaignTypeCodeHash: ccc.Hex;
  private protocolCell: ccc.Cell | null;
  private campaignOutPoint: ccc.OutPointLike;
  private campaign: Campaign | null;

  constructor(
    signer: ccc.Signer,
    userTypeCodeHash: ccc.Hex,
    _protocolTypeHash: ccc.Hex, // Keep in constructor for potential future use
    campaignTypeCodeHash: ccc.Hex,
    protocolCell: ccc.Cell | null,
    campaignOutPoint: ccc.OutPointLike,
    campaign?: Campaign | null
  ) {
    this.signer = signer;
    this.userTypeCodeHash = userTypeCodeHash;
    // protocolTypeHash is available if needed in the future
    this.campaignTypeCodeHash = campaignTypeCodeHash;
    this.protocolCell = protocolCell;
    this.campaignOutPoint = campaignOutPoint;
    this.campaign = campaign || null;
  }

  // ============ Helper Methods ============

  /**
   * Fetch campaign by its type ID
   */
  private async fetchCampaignByTypeId(campaignTypeId: ccc.Hex) {
    if (!this.protocolCell) {
      throw new Error("Protocol cell is required to fetch campaign");
    }
    return await fetchCampaignCell(
      campaignTypeId,
      this.campaignTypeCodeHash,
      this.signer,
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
      debug.error("Failed to parse campaign data", err);
      return null;
    }
  }

  // ============ Campaign Management ============

  /**
   * Update an existing campaign
   * @param campaignTypeId - Campaign type ID to update
   * @param updates - Updated campaign data
   * @returns Transaction hash
   */
  async updateCampaign(
    campaignData: CampaignDataLike,
    campaignTypeId?: ccc.Hex,
    tx?: ccc.Transaction
  ): Promise<ccc.Hex> {
    if (!this.signer) {
      throw new Error("Signer is required to update a campaign");
    }

    if (!this.campaign) {
      throw new Error("Campaign not initialized. Please try again.");
    }

    if (!this.protocolCell) {
      throw new Error(
        "Protocol cell not found. Campaign Cell must be tied to a protocol cell."
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
      } else {
        // Campaign updates now require a type ID, not type hash
        // The campaign should already have the current data loaded
        throw new Error(
          "Campaign updates by type hash are no longer supported. " +
            "Please use fetchCampaignByTypeId to get the campaign, then update it."
        );
      }

      if (!updateTx) {
        throw new Error("Failed to get transaction from SSRI updateCampaign");
      }

      // Complete fees and send transaction
      await updateTx.completeInputsByCapacity(this.signer);
      await updateTx.completeFeeBy(this.signer);

      // Log the transaction bytes before sending
      const txBytes = updateTx.toBytes();
      const txHex = ccc.hexFrom(txBytes);
      console.log("=== TRANSACTION BYTES TO RPC ===");
      console.log("Transaction Structure:", {
        version: updateTx.version,
        cellDeps: updateTx.cellDeps.map((dep) => ({
          outPoint: {
            txHash: dep.outPoint.txHash,
            index: dep.outPoint.index,
          },
          depType: dep.depType,
        })),
        inputs: updateTx.inputs.map((input) => ({
          previousOutput: {
            txHash: input.previousOutput.txHash,
            index: input.previousOutput.index,
          },
          since: input.since,
        })),
        outputs: updateTx.outputs.map((output) => ({
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
        outputsData: updateTx.outputsData.map((data) =>
          typeof data === "string" ? data : ccc.hexFrom(data)
        ),
        witnesses: updateTx.witnesses.map((witness) =>
          typeof witness === "string" ? witness : ccc.hexFrom(witness)
        ),
      });
      console.log("Transaction Hex:", txHex);
      console.log("Transaction Size:", txBytes.length, "bytes");
      console.log("=== END TRANSACTION BYTES ===");

      const txHash = await this.signer.sendTransaction(updateTx);

      console.log("Campaign updated:", { campaignTypeId, txHash });
      return txHash;
    } catch (error) {
      console.error("Failed to update campaign:", error);
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
    stats: {
      totalSubmissions: number;
      pendingReview: number;
      approved: number;
    };
  }> {
    debug.log(
      "Fetching submissions for campaign",
      campaignTypeId.slice(0, 10) + "..."
    );

    // Fetch the campaign to get quest details
    const campaignCell = await this.fetchCampaignByTypeId(campaignTypeId);
    if (!campaignCell) {
      throw new Error("Campaign not found");
    }

    // Parse campaign data
    const campaignData = this.parseCampaignData(campaignCell);
    if (!campaignData) {
      throw new Error("Failed to parse campaign data");
    }

    // Fetch all user cells
    const userCells = await fetchAllUserCells(
      this.userTypeCodeHash,
      this.signer
    );
    debug.log(`Found ${userCells.length} total user cells`);

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
        debug.error("Failed to process user cell", err);
        continue;
      }
    }

    // Calculate approved count
    const approved =
      campaignData.quests?.reduce((total, quest) => {
        return total + (quest.accepted_submission_user_type_ids?.length || 0);
      }, 0) || 0;

    debug.log("Submission fetch complete", {
      totalSubmissions,
      uniqueUsers: userDetails.size,
      pendingReview,
      approved,
      questsWithSubmissions: submissions.size,
    });

    return {
      submissions,
      userDetails,
      stats: {
        totalSubmissions,
        pendingReview,
        approved,
      },
    };
  }

  /**
   * Fetch pending submissions for a quest
   * Used by admins to review submissions before approval
   *
   * @param campaignTypeId - Campaign type ID
   * @param questId - Quest ID
   * @returns Array of pending submissions with user data
   */
  async fetchPendingSubmissions(
    campaignTypeId: ccc.Hex,
    questId: number
  ): Promise<
    Array<{
      userTypeId: ccc.Hex;
      submissionData: UserSubmissionRecordLike; // UserSubmissionRecord from contract
      submittedAt: number;
      userAddress: string;
    }>
  > {
    if (!this.signer) {
      throw new Error("Signer is required to fetch submissions");
    }

    try {
      // TODO: Implement actual fetching logic
      // This will query user cells that have submissions for this quest
      // Filter out already approved submissions

      console.log("Fetching pending submissions for quest:", {
        campaignTypeId,
        questId,
      });

      // Placeholder implementation
      // In production, this would:
      // 1. Fetch all user cells with submissions for this campaign/quest
      // 2. Filter out users whose type_ids are in accepted_submission_user_type_ids
      // 3. Return submission details for review

      return [];
    } catch (error) {
      console.error("Failed to fetch pending submissions:", error);
      throw error;
    }
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
      // Fetch campaign cell
      const campaigns = await fetchCampaignCells(this.signer);
      const campaignCell = campaigns.find((cell) => {
        // Extract type_id from ConnectedTypeID args
        const typeScript = cell.cellOutput.type;
        if (typeScript && typeScript.args.length >= 32) {
          const typeId = typeScript.args.slice(0, 32);
          return typeId === campaignTypeId;
        }
        return false;
      });

      if (!campaignCell) {
        throw new Error("Campaign not found");
      }

      // Parse campaign data
      const campaignData = CampaignData.decode(campaignCell.outputData);

      // Find the quest
      const quest = campaignData.quests.find((q) => q.quest_id === questId);
      if (!quest) {
        throw new Error("Quest not found");
      }

      // Return approved user type IDs
      return quest.accepted_submission_user_type_ids || [];
    } catch (error) {
      console.error("Failed to get approved completions:", error);
      throw error;
    }
  }

  /**
   * Stage 2 Placeholder: Fund campaign with UDTs for distribution
   * This will be implemented when UDT distribution is added
   *
   * @param campaignTypeId - Campaign type ID
   * @param udtAssets - Array of UDT assets to fund
   * @returns Transaction hash (placeholder)
   */
  async fundCampaignWithUDTs(
    campaignTypeId: ccc.Hex,
    udtAssets: Array<{
      scriptHash: ccc.Hex;
      amount: bigint;
    }>
  ): Promise<string> {
    // Stage 2 placeholder
    console.log("UDT funding will be available in Stage 2:", {
      campaignTypeId,
      udtAssets,
    });

    throw new Error("UDT funding is not yet implemented (Stage 2 feature)");

    // Future implementation will:
    // 1. Create transaction to transfer UDTs to campaign cell
    // 2. Update campaign data with funded amounts
    // 3. Enable UDT distribution for quests
  }

  /**
   * Create a Campaign SSRI instance for a specific campaign
   */
  private createCampaignInstance(campaignCell: ccc.Cell): Campaign {
    if (!this.protocolCell) {
      throw new Error("Protocol cell is required");
    }

    // Extract ConnectedTypeID from campaign cell's type script args
    const campaignTypeScript = campaignCell.cellOutput.type;
    if (!campaignTypeScript) {
      throw new Error("Campaign cell missing type script");
    }

    // Create Campaign SSRI instance with the specific campaign's script
    const campaignOutPoint = this.getCampaignOutPoint();
    const executor = this.getExecutor();

    return new Campaign(
      campaignOutPoint,
      campaignTypeScript, // Use the actual campaign's type script with ConnectedTypeID args
      this.protocolCell,
      { executor }
    );
  }

  /**
   * Get campaign contract outpoint from deployment
   */
  private getCampaignOutPoint(): ccc.OutPointLike {
    return this.campaignOutPoint;
  }

  /**
   * Get SSRI executor instance
   */
  private getExecutor() {
    const executorUrl =
      process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
    return new ssri.ExecutorJsonRpc(executorUrl);
  }

  /**
   * Approve quest completions with Points minting (Stage 1)
   * Stage 2 placeholder: Will support UDT distribution in the future
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
    if (!this.signer) {
      throw new Error("Signer is required to approve quest completions");
    }

    if (!this.campaign) {
      throw new Error("Campaign not initialized. Please try again.");
    }

    if (userTypeIds.length === 0) {
      throw new Error("At least one user type ID must be provided");
    }

    debug.log("Approving quest completions", {
      campaign: campaignTypeId.slice(0, 10) + "...",
      questId,
      userTypeIds,
    });

    // Fetch the campaign to get current data
    const campaignCell = await this.fetchCampaignByTypeId(campaignTypeId);
    if (!campaignCell) {
      throw new Error("Campaign not found");
    }

    const campaignData = this.parseCampaignData(campaignCell);
    if (!campaignData) {
      throw new Error("Failed to parse campaign data");
    }

    try {
      // Stage 1: Approve completions with Points minting
      // The smart contract will handle Points minting through the Points UDT
      console.log("Trying approveCompletion");
      const { res: tx } = await this.campaign.approveCompletion(
        this.signer,
        campaignData,
        questId,
        userTypeIds
      );

      const pointsUdtOutPoint = deploymentManager.getContractOutPoint(
        deploymentManager.getCurrentNetwork(),
        "ckboostPointsUdt"
      );

      if (!pointsUdtOutPoint) {
        throw new Error("Points UDT contract not found in deployments.json");
      } else {
        console.log("Points UDT outpoint", pointsUdtOutPoint);
      }

      tx.addCellDeps({
        outPoint: {
          txHash: pointsUdtOutPoint.txHash,
          index: pointsUdtOutPoint.index,
        },
        depType: "code",
      });

      // Stage 2 Placeholder: Future UDT distribution logic
      // TODO: Add UDT distribution when Stage 2 is implemented
      // - Check if campaign has funded UDTs
      // - Calculate UDT rewards per user
      // - Add UDT transfer outputs to transaction

      // Complete fees and send transaction
      await tx.completeInputsByCapacity(this.signer);
      await tx.completeFeeBy(this.signer);
      const txHash = await this.signer.sendTransaction(tx);

      console.log("Quest completions approved with Points minting:", {
        campaignTypeId,
        questId,
        userTypeIds,
        txHash,
        pointsMinted: true,
        // Stage 2: udtDistributed: false (placeholder)
      });

      return txHash;
    } catch (error) {
      console.error("Failed to approve quest completions:", error);
      throw error;
    }
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
      throw new Error("Campaign not found");
    }

    const campaignData = this.parseCampaignData(campaignCell);
    if (!campaignData) {
      throw new Error("Failed to parse campaign data");
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

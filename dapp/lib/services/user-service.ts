// User Service - Abstracts user data operations and quest submissions
// This service provides high-level user operations by delegating to the cell layer

import { ccc, ssri } from "@ckb-ccc/connector-react";
import { ckboost } from "ssri-ckboost";
import {
  decodeClaimablePoolData,
  encodeClaimablePoolData,
  removeClaimablePoolEntriesForClaimant,
} from "ckb-claimable-pool-lock";
import {
  fetchUserByTypeId,
  fetchUserByLockHash,
  parseUserData,
  extractTypeIdFromUserCell,
} from "../ckb/user-cells";
import { deploymentManager } from "../ckb/deployment-manager";
import { UserData, UserDataLike } from "ssri-ckboost/types";
import { fetchProtocolCell } from "../ckb/protocol-cells";
import type {
  DidVerificationData,
  TelegramVerificationData,
  VerificationDataEntries,
  VerificationStatus,
} from "../types/identity";
import { sendTransactionWithFeeRetry } from "../ckb/transaction-wrapper";
import { injectProxyAuthenticationCell } from "../utils/api";
import { createScopedLogger } from "ssri-ckboost";
import { registerPendingTransaction } from "@/lib/pending-transactions";
import { createDisplayNameRecord } from "../profile/profile-data";
import { addClaimablePoolLockCellDep } from "../ckb/claimable-pool";
import {
  removeQuestSubmissionRecords,
  submissionRecordMatchesQuest,
} from "../user-submission-records";
import {
  decodeVerificationEntries,
  deriveVerificationFlags,
  getDidVerificationData,
  getTelegramVerificationData,
  normalizeDidVerificationData,
  upsertVerificationEntry,
} from "../identity/verification-data";
import { listControlledDids } from "../vellum/dids";

const log = createScopedLogger("UserService");

const emptyVerificationStatus = (): VerificationStatus => ({
  telegram: false,
  twitter: false,
  discord: false,
  reddit: false,
  kyc: false,
  did: false,
  manual_review: false,
  verification_flags: 0,
});

export type ClaimPointsOptions = {
  pointsInputCell?: ccc.Cell;
};

export type ClaimablePoolClaimOptions = {
  udtInputCell?: ccc.Cell;
  addUdtCellDeps?: (
    tx: ccc.Transaction,
    typeScript: ccc.Script
  ) => void | Promise<void>;
};

function readUdtAmount(data: ccc.HexLike | undefined | null): bigint {
  if (!data) return 0n;
  const bytes = ccc.bytesFrom(data);
  if (bytes.length < 16) {
    return 0n;
  }
  return ccc.numFromBytes(bytes.slice(0, 16));
}

function scriptHash(script: ccc.ScriptLike): ccc.Hex {
  return ccc.hexFrom(ccc.Script.from(script).hash());
}

/**
 * User service that provides high-level user operations
 * Handles user cell creation, quest submissions, and Nostr storage integration
 */
export class UserService {
  private signer: ccc.Signer;
  private userInstance: ckboost.User | null = null;
  private userTypeCodeHash: ccc.Hex;
  private protocolTypeHash: ccc.Hex;
  private userTypeCodeCell: ccc.OutPoint | null = null;
  private useNostrStorage: boolean;
  private initialized: boolean = false;

  constructor(
    signer: ccc.Signer,
    userTypeCodeHash: ccc.Hex,
    protocolTypeHash: ccc.Hex,
    useNostrStorage: boolean = true
  ) {
    this.signer = signer;
    this.userTypeCodeHash = userTypeCodeHash;
    this.protocolTypeHash = protocolTypeHash;
    this.useNostrStorage = useNostrStorage;

    // Initialize deployment info on construction
    this.initializeDeploymentInfo();

    log.log("UserService initialized", {
      userTypeCodeHash,
      protocolTypeHash: protocolTypeHash.slice(0, 10) + "...",
      useNostrStorage,
    });
  }

  private buildProfileDataEntries(options?: {
    displayName?: string;
    extraEntries?: ccc.BytesLike[];
  }): ccc.BytesLike[] {
    const entries = [...(options?.extraEntries ?? [])];
    const trimmedName = options?.displayName?.trim();
    if (trimmedName) {
      entries.push(createDisplayNameRecord(trimmedName));
    }
    return entries;
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

  private async findPointsCellByLock(
    lock: ccc.ScriptLike,
    pointsType: ccc.ScriptLike
  ): Promise<ccc.Cell | null> {
    const targetLockHash = ccc.Script.from(lock).hash();

    for await (const cell of this.signer.client.findCells({
      script: pointsType,
      scriptType: "type",
      scriptSearchMode: "exact",
    })) {
      if (cell.cellOutput.lock.hash() === targetLockHash) {
        return cell;
      }
    }

    return null;
  }

  /** Request the CKBoost identity attestation before the wallet signs. */
  private async sendTransactionWithIdentityAttestation(
    signer: ccc.Signer,
    baseDraftTx: ccc.Transaction
  ): Promise<ccc.Hex> {
    await injectProxyAuthenticationCell(signer, baseDraftTx);
    await baseDraftTx.completeInputsByCapacity(signer);
    log.log(
      "baseDraftTx after completeInputsByCapacity",
      ccc.stringify(baseDraftTx)
    );

    for (let i = 0; i < baseDraftTx.inputs.length; i++) {
      const inputCell = await signer.client.getCell(
        baseDraftTx.inputs[i].previousOutput
      );
      if (!inputCell) {
        throw new Error("Input cell not found");
      }
      baseDraftTx.inputs[i] = ccc.CellInput.from({
        previousOutput: inputCell?.outPoint,
        since: "0x0",
        cellOutput: inputCell?.cellOutput,
      });
    }

    for (let i = 0; i < baseDraftTx.outputs.length; i++) {
      const out = baseDraftTx.outputs[i];
      if (out.type) {
        baseDraftTx.outputs[i] = ccc.CellOutput.from(
          { lock: out.lock, type: out.type },
          baseDraftTx.outputsData[i] as ccc.HexLike
        );
      }
    }
    // ISSUE #16: Add cell deps contingently for corresponding signer.
    await baseDraftTx.addCellDepsOfKnownScripts(
      signer.client,
      ccc.KnownScript.JoyId
    );
    await baseDraftTx.completeFeeBy(signer);
    log.log("baseDraftTx after completeFeeBy", ccc.stringify(baseDraftTx));

    const resp = await fetch("/api/telegram-authenticate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: ccc.hexFrom(baseDraftTx.toBytes()),
    });
    if (!resp.ok) {
      let message = "CKBoost rejected the identity update.";
      try {
        const errorResponse = (await resp.json()) as { message?: unknown };
        if (typeof errorResponse.message === "string") {
          message = errorResponse.message;
        }
      } catch {
        // Keep the stable message when the function did not return JSON.
      }
      log.error("Identity validation failed at server", { message });
      throw new Error(message);
    }
    const responseJson = await resp.json();
    log.info("response from telegram-authenticate", responseJson);
    const authenticatedTx = ccc.Transaction.fromBytes(responseJson.txHex);
    log.log("authenticatedTx from bytes", ccc.stringify(authenticatedTx));
    for (let i = 0; i < authenticatedTx.inputs.length; i++) {
      const inputCell = await signer.client.getCell(
        authenticatedTx.inputs[i].previousOutput
      );
      if (!inputCell) {
        throw new Error("Input cell not found");
      }
      authenticatedTx.inputs[i] = ccc.CellInput.from({
        previousOutput: inputCell?.outPoint,
        since: "0x0",
        cellOutput: inputCell?.cellOutput,
      });
    }

    for (let i = 0; i < authenticatedTx.outputs.length; i++) {
      const out = authenticatedTx.outputs[i];
      if (out.type) {
        authenticatedTx.outputs[i] = ccc.CellOutput.from(
          { lock: out.lock, type: out.type },
          authenticatedTx.outputsData[i] as ccc.HexLike
        );
      }
    }
    log.log(
      "authenticatedTx after modifying inputs and outputs",
      ccc.stringify(authenticatedTx)
    );
    log.log("authenticatedTx after signing", ccc.stringify(authenticatedTx));
    const txHash = await signer.sendTransaction(authenticatedTx);
    registerPendingTransaction(txHash, {
      label: "Identity update",
      context: "UserService",
    });
    return txHash;
  }

  /**
   * Initialize deployment information and Nostr service
   */
  private async initializeDeploymentInfo(): Promise<void> {
    try {
      // Get the user type contract outpoint from deployment manager
      const network = deploymentManager.getCurrentNetwork();
      const deployment = deploymentManager.getCurrentDeployment(
        network,
        "ckboostUserType"
      );
      const outPoint = deploymentManager.getContractOutPoint(
        network,
        "ckboostUserType"
      );

      if (!deployment || !outPoint) {
        log.warn("User type contract not found in deployments.json");
      } else {
        this.userTypeCodeCell = ccc.OutPoint.from({
          txHash: outPoint.txHash,
          index: outPoint.index,
        });
        log.log("User type contract loaded", {
          txHash: outPoint.txHash.slice(0, 10) + "...",
          index: outPoint.index,
        });
      }

      this.initialized = true;
    } catch (error) {
      log.error("Failed to initialize deployment info:", error);
      // Don't throw - allow service to function with reduced capabilities
    }
  }

  /**
   * Initialize the User SSRI instance
   */
  async initializeUserInstance(userTypeCodeCell: ccc.OutPoint): Promise<void> {
    // Create User instance with the code cell
    // Note: The executor needs to be created separately as it's not exported
    // For now, we'll store the code cell and create the executor when needed
    this.userTypeCodeCell = userTypeCodeCell;

    // The User instance will be created when we have a proper executor
    // For now, we'll handle this in the submit methods
  }

  /**
   * Get User SSRI instance
   */
  getUserInstance(): ckboost.User | null {
    return this.userInstance;
  }

  /**
   * Get the protocol type hash this service is configured with
   */
  getProtocolTypeHash(): ccc.Hex {
    return this.protocolTypeHash;
  }

  /**
   * Submit a quest completion with optional Nostr storage
   * Creates user cell if it doesn't exist
   */
  async submitQuestWithAutoCreate(
    campaignTypeId: ccc.Hex,
    questId: number,
    submissionContent: string, // Full HTML with images OR nevent ID
    protocolCell: ccc.Cell,
    userVerificationData?: {
      name?: string;
      email?: string;
      twitter?: string;
      discord?: string;
    }
  ): Promise<{
    txHash: ccc.Hex;
    neventId?: string; // Only present if using Nostr storage
  }> {
    let contentToStore: string;
    let neventId: string | undefined;

    // Check if the submissionContent is already a nevent ID
    if (submissionContent.startsWith("nevent1")) {
      // It's already a nevent ID, don't store to Nostr again
      log.log("Submission content is already a nevent ID", {
        neventId: submissionContent.slice(0, 20) + "...",
      });
      contentToStore = submissionContent;
      neventId = submissionContent;
    }
    // Nostr publishing must happen in useNostrStorage, where relay quorum is
    // verified and the full signed event remains available for durable backup.
    else if (this.useNostrStorage) {
      throw new Error(
        "Submission content must be published and verified on Nostr before updating its on-chain reference"
      );
    } else {
      // Store the full content on-chain (expensive!)
      contentToStore = submissionContent;
      log.warn("Storing full content on-chain", {
        contentSize: submissionContent.length,
        estimatedCost: "~" + Math.ceil(submissionContent.length / 100) + " CKB",
      });
    }

    // Check if user exists and proceed with submission
    const lockScript = (await this.signer.getRecommendedAddressObj()).script;
    const lockHash = lockScript.hash();

    const existingUserData = await this.getUserByLockHash(lockHash);

    let txHash: ccc.Hex;

    if (existingUserData && existingUserData.typeId) {
      // User exists, update with submission
      log.log("Updating existing user with submission", {
        userTypeId: existingUserData.typeId.slice(0, 10) + "...",
        existingSubmissions:
          existingUserData.userData?.submission_records.length || 0,
        isNeventId: contentToStore.startsWith("nevent1"),
      });

      txHash = await this.submitQuest(
        campaignTypeId,
        questId,
        contentToStore,
        existingUserData.typeId,
        protocolCell
      );
    } else {
      // Create new user with submission
      log.log("Creating new user with first submission", {
        userName: userVerificationData?.name || "Anonymous",
        hasTwitter: !!userVerificationData?.twitter,
        hasDiscord: !!userVerificationData?.discord,
        isNeventId: contentToStore.startsWith("nevent1"),
      });

      txHash = await this.createUserWithSubmission(
        campaignTypeId,
        questId,
        contentToStore,
        protocolCell,
        userVerificationData
      );
    }

    log.log("Quest submission successful", {
      txHash: txHash.slice(0, 10) + "...",
      isNewUser: !existingUserData,
      usedNostr: !!neventId,
    });

    return { txHash, neventId };
  }

  /**
   * Remove the current user's on-chain reference for one quest submission.
   * The signed Nostr event remains public on its relays.
   */
  async deleteQuestSubmission(
    campaignTypeId: ccc.Hex,
    questId: number,
    userTypeId: ccc.Hex,
    protocolCell: ccc.Cell
  ): Promise<ccc.Hex> {
    await this.ensureDeploymentInfo();

    const userCell = await fetchUserByTypeId(
      userTypeId,
      this.userTypeCodeHash,
      this.signer,
      this.protocolTypeHash
    );
    if (!userCell) {
      throw new Error("User cell not found");
    }

    const currentUserData = parseUserData(userCell);
    if (!currentUserData) {
      throw new Error("Failed to parse user data");
    }

    const removal = removeQuestSubmissionRecords(
      currentUserData.submission_records,
      campaignTypeId,
      questId
    );
    if (removal.removedCount === 0) {
      throw new Error("Quest submission not found");
    }

    const updatedUserData = {
      verification_data: currentUserData.verification_data,
      total_points_earned: currentUserData.total_points_earned,
      last_activity_timestamp: BigInt(Date.now()),
      submission_records: removal.records,
      profile_data: currentUserData.profile_data,
      last_bonus_streak_at: currentUserData.last_bonus_streak_at,
    } as UserDataLike;

    log.info("Removing quest submission reference", {
      userTypeId: userTypeId.slice(0, 10) + "...",
      campaignTypeId: campaignTypeId.slice(0, 10) + "...",
      questId,
      removedRecords: removal.removedCount,
    });

    return this.sendUserDataUpdate(
      userCell,
      userTypeId,
      updatedUserData,
      protocolCell,
      "delete_submission"
    );
  }

  /**
   * Retrieve quest submission content
   * If using Nostr, fetches from Nostr; otherwise returns the on-chain content
   */
  async getSubmissionContent(submissionContent: string): Promise<{
    content: string;
    metadata?: Record<string, string>;
    isFromNostr: boolean;
  }> {
    // Check if the content is a nevent ID (Nostr reference)
    if (submissionContent.startsWith("nevent1")) {
      // Retrieval is handled by the shared React Nostr fetch hook.
      return {
        content: submissionContent,
        metadata: { type: "nevent", stored: "nostr" },
        isFromNostr: true,
      };
    }

    // It's raw content stored on-chain
    return {
      content: submissionContent,
      isFromNostr: false,
    };
  }

  /**
   * Get user submissions with content (from Nostr if applicable)
   */
  async getUserSubmissionsWithContent(userTypeId: ccc.Hex): Promise<
    Array<{
      campaignTypeId: string;
      questId: number;
      timestamp: number;
      submissionContent: string;
      neventId?: string;
      content?: string;
      isFromNostr: boolean;
    }>
  > {
    const userCell = await fetchUserByTypeId(
      userTypeId,
      this.userTypeCodeHash,
      this.signer,
      this.protocolTypeHash // Pass protocol type hash to ensure we get the right cell
    );

    if (!userCell) {
      log.log("No user cell found for type ID:", userTypeId);
      return [];
    }

    const userData = parseUserData(userCell);
    if (!userData) {
      log.log("Failed to parse user data from cell");
      return [];
    }

    log.log("Found user data with submissions:", {
      typeId: userTypeId.slice(0, 10) + "...",
      totalSubmissions: userData.submission_records.length,
      submissions: userData.submission_records.map((r) => ({
        campaign: r.campaign_type_id?.slice(0, 10) + "...",
        questId: r.quest_id,
        timestamp: r.submission_timestamp,
      })),
    });

    // Process each submission
    const submissionsWithContent = await Promise.all(
      userData.submission_records.map(async (record) => {
        // Convert campaign_type_id to hex string if it's bytes
        let campaignTypeId: string;

        // Log the raw campaign_type_id for debugging
        log.log("Processing submission record:", {
          raw_campaign_type_id: record.campaign_type_id,
          type: typeof record.campaign_type_id,
          isUint8Array:
            record.campaign_type_id &&
            typeof record.campaign_type_id === "object" &&
            ArrayBuffer.isView(record.campaign_type_id),
          length:
            (record.campaign_type_id as { length?: number })?.length || "N/A",
        });

        if (typeof record.campaign_type_id === "string") {
          // Already a string, use as-is
          campaignTypeId = record.campaign_type_id;
        } else if (
          (record.campaign_type_id &&
            typeof record.campaign_type_id === "object" &&
            ArrayBuffer.isView(record.campaign_type_id)) ||
          (record.campaign_type_id &&
            typeof record.campaign_type_id === "object" &&
            "length" in record.campaign_type_id)
        ) {
          // It's a byte array (Uint8Array or array-like object)
          const bytes =
            record.campaign_type_id &&
            typeof record.campaign_type_id === "object" &&
            ArrayBuffer.isView(record.campaign_type_id)
              ? record.campaign_type_id
              : new Uint8Array(Object.values(record.campaign_type_id));
          campaignTypeId = ccc.hexFrom(bytes);
        } else {
          // Try to convert whatever it is to bytes first, then to hex
          try {
            campaignTypeId = ccc.hexFrom(
              ccc.bytesFrom(record.campaign_type_id)
            );
          } catch (e) {
            log.error("Failed to convert campaign_type_id to hex:", e);
            campaignTypeId = "0x"; // Fallback to empty hex
          }
        }

        log.log("Converted campaign type ID:", {
          original: record.campaign_type_id,
          converted: campaignTypeId,
          questId: record.quest_id,
        });

        const submissionData = {
          campaignTypeId,
          questId: Number(record.quest_id),
          timestamp: Number(record.submission_timestamp),
          submissionContent: record.submission_content,
          neventId: undefined as string | undefined,
          content: undefined as string | undefined,
          isFromNostr: false,
        };

        // Check if content is a Nostr reference
        // The submission_content might be hex-encoded
        let decodedContent = record.submission_content;
        log.log("Reading submission reference", {
          contentLength: record.submission_content.length,
        });

        try {
          // Try to decode from hex if it looks like hex
          if (record.submission_content.startsWith("0x")) {
            // Remove 0x prefix and decode
            const hexContent = record.submission_content.slice(2);
            decodedContent = Buffer.from(hexContent, "hex").toString("utf-8");
            log.log("Decoded submission reference from 0x hex");
          } else if (/^[0-9a-fA-F]+$/.test(record.submission_content)) {
            // Pure hex string without 0x prefix
            decodedContent = Buffer.from(
              record.submission_content,
              "hex"
            ).toString("utf-8");
            log.log("Decoded submission reference from hex");
          }
        } catch (e) {
          // If decoding fails, use original content
          log.log("Failed to decode submission content from hex", e);
        }

        if (decodedContent.startsWith("nevent1")) {
          submissionData.neventId = decodedContent;
          submissionData.content = decodedContent; // Actual content should be fetched via React hook
          submissionData.isFromNostr = true;
        } else {
          // It's raw content stored on-chain
          submissionData.content = decodedContent;
        }

        return submissionData;
      })
    );

    return submissionsWithContent;
  }

  /**
   * Submit a quest (for existing users)
   */
  private async submitQuest(
    campaignTypeId: ccc.Hex,
    questId: number,
    submissionContent: string, // Could be nevent ID or actual content
    userTypeId: ccc.Hex,
    protocolCell: ccc.Cell
  ): Promise<ccc.Hex> {
    // Ensure deployment info is loaded
    await this.ensureDeploymentInfo();

    // Fetch current user cell
    const userCell = await fetchUserByTypeId(
      userTypeId,
      this.userTypeCodeHash,
      this.signer,
      this.protocolTypeHash // Pass protocol type hash to ensure we get the right cell
    );

    if (!userCell) {
      throw new Error("User cell not found");
    }

    // Parse current user data
    const currentUserData = parseUserData(userCell);
    if (!currentUserData) {
      throw new Error("Failed to parse user data");
    }

    // Check if this quest was already submitted and needs updating
    const existingSubmissionIndex = currentUserData.submission_records.findIndex(
      (record) =>
        submissionRecordMatchesQuest(record, campaignTypeId, questId)
    );

    // Create new submission record
    log.log("Creating submission record with:", {
      campaignTypeId: campaignTypeId.slice(0, 10) + "...",
      questId,
      submissionContent: submissionContent.slice(0, 50) + "...",
      isNeventId: submissionContent.startsWith("nevent1"),
      fullLength: submissionContent.length,
    });

    const newSubmissionBytes = ckboost.User.createSubmissionRecord(
      campaignTypeId,
      questId,
      submissionContent // This could be nevent ID or actual content
    );

    const newSubmission =
      ckboost.types.UserSubmissionRecord.decode(newSubmissionBytes);

    // Update or add submission
    const updatedSubmissions = [...currentUserData.submission_records];
    if (existingSubmissionIndex >= 0) {
      // Update existing submission (resubmission case)
      updatedSubmissions[existingSubmissionIndex] = newSubmission;
      log.log("Updating existing submission at index", existingSubmissionIndex);
    } else {
      // Add new submission
      updatedSubmissions.push(newSubmission);
      log.log("Adding new submission to user");
    }

    // Create updated user data
    const updatedUserData = {
      verification_data: currentUserData.verification_data,
      total_points_earned: currentUserData.total_points_earned,
      last_activity_timestamp: BigInt(Date.now()),
      submission_records: updatedSubmissions,
      profile_data: currentUserData.profile_data,
      last_bonus_streak_at: currentUserData.last_bonus_streak_at,
    } as UserDataLike;

    return this.sendUserDataUpdate(
      userCell,
      userTypeId,
      updatedUserData,
      protocolCell,
      "submit_quest"
    );
  }

  private async sendUserDataUpdate(
    userCell: ccc.Cell,
    userTypeId: ccc.Hex,
    updatedUserData: UserDataLike,
    protocolCell: ccc.Cell,
    operation: "submit_quest" | "delete_submission"
  ): Promise<ccc.Hex> {
    if (!this.userTypeCodeCell) {
      throw new Error("User type contract not found");
    }

    // The deployed contract exposes submission-record updates through the
    // submit_quest recipe, including removal of an existing record.
    const executorUrl =
      process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
    const executor = new ssri.ExecutorJsonRpc(executorUrl);

    // Create User instance with correct script args and executor
    const userInstanceWithScript = new ckboost.User(
      this.userTypeCodeCell,
      ccc.Script.from({
        codeHash: this.userTypeCodeHash,
        hashType: "type",
        args: userCell.cellOutput.type?.args || "",
      }),
      { executor } // Pass the executor in config
    );

    // The SSRI method expects a transaction but will add the user cell input itself
    // We should provide an empty transaction or null
    // The contract will find and add the user cell as input based on the type script
    const result = await userInstanceWithScript.submitQuest(
      this.signer,
      updatedUserData,
      undefined // Pass undefined - the contract will handle finding and adding the user cell
    );

    // Get the transaction from the result
    const updateTx = result.res;

    // Debug: inspect outputs before any mutation/completion (stringified)
    try {
      const sender = await this.signer.getRecommendedAddressObj();
      const senderHash = sender.script.hash();
      const payload = {
        outputs: updateTx.outputs.map((o, i) => ({
          index: i,
          capacity: o.capacity?.toString?.() ?? String(o.capacity),
          hasType: !!o.type,
          lockHash: o.lock.hash(),
          isChangeCandidate: !o.type && o.lock.hash() === senderHash,
        })),
        outputsDataLengths: updateTx.outputsData.map((d: ccc.Hex) =>
          typeof d === "string" ? d.length : String(d).length
        ),
      };
      const s = JSON.stringify(payload);
      log.log(`after-ssri-return ${s}`);
    } catch (e) {
      log.log("log error after-ssri-return", String(e));
    }

    // Ensure output capacity is auto-calculated by CCC for updated user cell
    // Mutate the existing CellOutput instances to keep class methods intact
    for (let i = 0; i < updateTx.outputs.length; i++) {
      const output = updateTx.outputs[i];
      if (output.type && output.type.codeHash === this.userTypeCodeHash) {
        // Reconstruct CellOutput via CCC factory with outputData to trigger auto capacity calc
        updateTx.outputs[i] = ccc.CellOutput.from({
          capacity: output.capacity,
          lock: output.lock,
          type: output.type,
        });
      }
    }

    try {
      const sender = await this.signer.getRecommendedAddressObj();
      const senderHash = sender.script.hash();
      const payload = {
        outputs: updateTx.outputs.map((o, i) => ({
          index: i,
          capacity: o.capacity?.toString?.() ?? String(o.capacity),
          hasType: !!o.type,
          lockHash: o.lock.hash(),
          isChangeCandidate: !o.type && o.lock.hash() === senderHash,
        })),
      };
      log.log(`after-set-capacity-0 ${JSON.stringify(payload)}`);
    } catch {}

    // Add the protocol cell as a dependency (required for validation)
    updateTx.addCellDeps({
      outPoint: protocolCell.outPoint,
      depType: "code",
    });

    log.log("Transaction before complete fees", updateTx);

    log.log("Updating user submission records", {
      operation,
      userTypeId: userTypeId.slice(0, 10) + "...",
      totalSubmissions: updatedUserData.submission_records.length,
      lastActivity: new Date(
        Number(updatedUserData.last_activity_timestamp)
      ).toISOString(),
    });

    log.log("updateTx before sending", updateTx);

    const txHash = await sendTransactionWithFeeRetry(this.signer, updateTx, {
      pendingMetadata: {
        label:
          operation === "delete_submission"
            ? "Delete quest submission"
            : "Submit quest",
        context: "UserService",
      },
    });

    log.log("User cell updated", {
      txHash: txHash.slice(0, 10) + "...",
    });

    return txHash;
  }

  /**
   * Create a new user with initial submission
   */
  private async createUserWithSubmission(
    campaignTypeId: ccc.Hex,
    questId: number,
    submissionContent: string, // Could be nevent ID or actual content
    protocolCell: ccc.Cell,
    verificationData?: {
      name?: string;
      email?: string;
      twitter?: string;
      discord?: string;
    }
  ): Promise<ccc.Hex> {
    // Ensure deployment info is loaded
    await this.ensureDeploymentInfo();

    if (!this.userTypeCodeCell) {
      throw new Error(
        "User type contract not found. Please deploy the contracts first."
      );
    }

    // Create identity verification JSON
    const identityData = JSON.stringify({
      name: verificationData?.name || "Anonymous",
      email: verificationData?.email || "",
      twitter: verificationData?.twitter || "",
      discord: verificationData?.discord || "",
    });

    // Create user verification data
    const userVerificationDataStruct = {
      telegram_personal_chat_id: 0n,
      identity_verification_data: [],
    };

    // Create new submission record
    log.log("Creating submission record with:", {
      campaignTypeId: campaignTypeId.slice(0, 10) + "...",
      questId,
      submissionContent: submissionContent.slice(0, 50) + "...",
      isNeventId: submissionContent.startsWith("nevent1"),
      fullLength: submissionContent.length,
    });

    const newSubmissionBytes = ckboost.User.createSubmissionRecord(
      campaignTypeId,
      questId,
      submissionContent // This could be nevent ID or actual content
    );
    const newSubmission =
      ckboost.types.UserSubmissionRecord.decode(newSubmissionBytes);

    // Create initial user data with the submission
    const userData = {
      verification_data: userVerificationDataStruct,
      total_points_earned: 0,
      last_activity_timestamp: BigInt(Date.now()),
      submission_records: [newSubmission],
      profile_data: this.buildProfileDataEntries({
        displayName: verificationData?.name,
      }),
      last_bonus_streak_at: BigInt(0),
    } as UserDataLike;

    // Now that the contract's submit_quest handles both creation and update,
    // we can use it for creation too. We just need to pass empty args
    // so the contract knows this is a creation.

    // Create executor for SSRI operations
    const executorUrl =
      process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
    const executor = new ssri.ExecutorJsonRpc(executorUrl);

    // Create User instance with empty args (signals creation) and executor
    const userInstanceForCreation = new ckboost.User(
      this.userTypeCodeCell,
      ccc.Script.from({
        codeHash: this.userTypeCodeHash,
        hashType: "type",
        args: "0x", // Empty args signals creation to the contract
      }),
      { executor } // Pass the executor in config
    );

    // For creation, the contract needs at least one input to calculate type ID
    // Create a base transaction with at least one input
    const baseTx = ccc.Transaction.from({});

    // Add at least one input for capacity (required for type ID calculation)
    // The contract will use the first input to calculate the type ID
    await baseTx.completeInputsAtLeastOne(this.signer);

    // Build transaction using SSRI - the contract will handle creation
    const result = await userInstanceForCreation.submitQuest(
      this.signer,
      userData,
      baseTx // Pass the transaction with at least one input
    );

    // The contract returns a transaction with the new user cell
    const createTx = result.res;

    // Debug: inspect outputs before any mutation/completion (stringified)
    try {
      const sender = await this.signer.getRecommendedAddressObj();
      const senderHash = sender.script.hash();
      const payload = {
        outputs: createTx.outputs.map((o, i) => ({
          index: i,
          capacity: o.capacity?.toString?.() ?? String(o.capacity),
          hasType: !!o.type,
          lockHash: o.lock.hash(),
          isChangeCandidate: !o.type && o.lock.hash() === senderHash,
        })),
        outputsDataLengths: createTx.outputsData.map((d: ccc.Hex) =>
          typeof d === "string" ? d.length : String(d).length
        ),
      };
      log.log(`after-ssri-return ${JSON.stringify(payload)}`);
    } catch (e) {
      log.log("[UserService.create] log error after-ssri-return", String(e));
    }

    // Find the user cell output (should be the first output with the user type script)
    const userCellOutputIndex = createTx.outputs.findIndex(
      (output) => output.type?.codeHash === this.userTypeCodeHash
    );

    if (userCellOutputIndex === -1) {
      throw new Error("User cell output not found in transaction");
    }

    // Update the ConnectedTypeID with the protocol type hash
    // The contract creates it with type_id but empty connected_key
    const userCellTypeArgs = createTx.outputs[userCellOutputIndex].type?.args;
    if (!userCellTypeArgs) {
      throw new Error("User cell type args is empty");
    }

    // Decode the ConnectedTypeID
    const connectedTypeId =
      ckboost.types.ConnectedTypeID.decode(userCellTypeArgs);

    // Update with the correct protocol type hash
    connectedTypeId.connected_key = this.protocolTypeHash as ccc.Hex;

    // Encode and update the args
    const updatedConnectedTypeIdBytes =
      ckboost.types.ConnectedTypeID.encode(connectedTypeId);
    const updatedConnectedTypeIdArgs = ccc.hexFrom(updatedConnectedTypeIdBytes);

    // Update the user cell's type script args with the ConnectedTypeID
    if (createTx.outputs[userCellOutputIndex].type) {
      createTx.outputs[userCellOutputIndex].type.args =
        updatedConnectedTypeIdArgs;
    }

    // Ensure output capacity is auto-calculated by CCC for new user cell by reconstructing via factory
    createTx.outputs[userCellOutputIndex] = ccc.CellOutput.from({
      capacity: createTx.outputs[userCellOutputIndex].capacity,
      lock: createTx.outputs[userCellOutputIndex].lock,
      type: createTx.outputs[userCellOutputIndex].type,
    });
    try {
      const sender = await this.signer.getRecommendedAddressObj();
      const senderHash = sender.script.hash();
      const payload = {
        outputs: createTx.outputs.map((o, i) => ({
          index: i,
          capacity: o.capacity?.toString?.() ?? String(o.capacity),
          hasType: !!o.type,
          lockHash: o.lock.hash(),
          isChangeCandidate: !o.type && o.lock.hash() === senderHash,
        })),
      };
      log.log(`after-set-capacity-0 ${JSON.stringify(payload)}`);
    } catch {}

    // Add the protocol cell as a dependency (required for validation)
    createTx.addCellDeps({
      outPoint: protocolCell.outPoint,
      depType: "code",
    });

    // Complete fees and send transaction

    log.log("createTx before complete fees", createTx);

    log.log("Creating user cell with submission", {
      userTypeHash: this.userTypeCodeHash.slice(0, 10) + "...",
      protocolTypeHash: this.protocolTypeHash.slice(0, 10) + "...",
      userName: verificationData?.name || "Anonymous",
      hasSubmission: true,
    });
    log.log("createTx after complete fees", createTx);
    // Send transaction
    const txHash = await sendTransactionWithFeeRetry(this.signer, createTx);

    log.log("User cell created", {
      txHash: txHash.slice(0, 10) + "...",
      userName: verificationData?.name || "Anonymous",
    });

    return txHash;
  }

  /**
   * Create a new user populated only with verification data
   */
  private async createUserWithVerification(
    userVerificationData: ckboost.types.UserVerificationDataLike,
    options?: { profileEntries?: ccc.BytesLike[] }
  ): Promise<ccc.Hex> {
    await this.ensureDeploymentInfo();

    if (!this.userTypeCodeCell) {
      throw new Error(
        "User type contract not found. Please deploy the contracts first."
      );
    }

    const protocolCell = await fetchProtocolCell(this.signer.client);
    if (!protocolCell) {
      throw new Error(
        "Protocol cell not found on blockchain. Please deploy protocol cell first."
      );
    }

    const executorUrl =
      process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
    const executor = new ssri.ExecutorJsonRpc(executorUrl);

    const creatorInstance = new ckboost.User(
      this.userTypeCodeCell,
      ccc.Script.from({
        codeHash: this.userTypeCodeHash,
        hashType: "type",
        args: "0x",
      }),
      { executor }
    );

    const baseTx = ccc.Transaction.from({});
    await baseTx.completeInputsAtLeastOne(this.signer);

    const userData = {
      verification_data: userVerificationData,
      total_points_earned: 0,
      last_activity_timestamp: BigInt(Date.now()),
      submission_records: [],
      profile_data: options?.profileEntries ?? [],
      last_bonus_streak_at: BigInt(0),
    } as UserDataLike;

    const { res: createTx } = await creatorInstance.updateVerificationData(
      this.signer,
      userData,
      baseTx
    );

    const userCellOutputIndex = createTx.outputs.findIndex(
      (output) => output.type?.codeHash === this.userTypeCodeHash
    );

    if (userCellOutputIndex === -1) {
      throw new Error("User cell output not found in transaction");
    }

    const userCellTypeArgs = createTx.outputs[userCellOutputIndex].type?.args;
    if (!userCellTypeArgs) {
      throw new Error("User cell type args is empty");
    }

    const connectedTypeId =
      ckboost.types.ConnectedTypeID.decode(userCellTypeArgs);
    connectedTypeId.connected_key = this.protocolTypeHash as ccc.Hex;

    const updatedConnectedTypeIdBytes =
      ckboost.types.ConnectedTypeID.encode(connectedTypeId);
    const updatedConnectedTypeIdArgs = ccc.hexFrom(updatedConnectedTypeIdBytes);

    if (createTx.outputs[userCellOutputIndex].type) {
      createTx.outputs[userCellOutputIndex].type.args =
        updatedConnectedTypeIdArgs;
    }

    createTx.outputs[userCellOutputIndex] = ccc.CellOutput.from(
      {
        lock: createTx.outputs[userCellOutputIndex].lock,
        type: createTx.outputs[userCellOutputIndex].type,
      },
      createTx.outputsData[userCellOutputIndex] as ccc.HexLike
    );

    createTx.addCellDeps({
      outPoint: protocolCell.outPoint,
      depType: "code",
    });

    const txHash =
      await this.sendTransactionWithIdentityAttestation(
        this.signer,
        createTx
      );

    return txHash;
  }

  /**
   * Helper method to get user by lock hash
   */
  private async getUserByLockHash(lockHash: ccc.Hex): Promise<{
    cell: ccc.Cell;
    typeId: ccc.Hex | null;
    userData: ReturnType<typeof ckboost.types.UserData.decode> | null;
  } | null> {
    const userCell = await fetchUserByLockHash(
      lockHash,
      this.userTypeCodeHash,
      this.signer,
      this.protocolTypeHash // Pass protocol type hash to filter by protocol connection
    );

    if (!userCell) {
      return null;
    }

    const typeId = extractTypeIdFromUserCell(userCell);
    const userData = parseUserData(userCell);

    return {
      cell: userCell,
      typeId,
      userData,
    };
  }

  async createUserProfile(displayName: string): Promise<ccc.Hex> {
    const trimmed = displayName.trim();
    if (!trimmed) {
      throw new Error("Display name is required");
    }

    // Ensure a user does not already exist before creating a profile
    const lockScript = (await this.signer.getRecommendedAddressObj()).script;
    const lockHash = lockScript.hash();
    const existingUser = await this.getUserByLockHash(lockHash);
    if (existingUser) {
      throw new Error("User profile already exists for this address");
    }

    const profileEntries = this.buildProfileDataEntries({
      displayName: trimmed,
    });

    const verificationData: ckboost.types.UserVerificationDataLike = {
      telegram_personal_chat_id: 0n,
      identity_verification_data: [],
    };

    return this.createUserWithVerification(verificationData, {
      profileEntries,
    });
  }

  async updateProfileDisplayName(displayName: string): Promise<ccc.Hex> {
    const trimmed = displayName.trim();
    if (!trimmed) {
      throw new Error("Display name is required");
    }

    await this.ensureDeploymentInfo();

    const lockScript = (await this.signer.getRecommendedAddressObj()).script;
    const lockHash = lockScript.hash();
    const existingUser = await this.getUserByLockHash(lockHash);

    if (!existingUser || !existingUser.typeId) {
      log.log(
        "No existing user found while updating display name, creating profile first"
      );
      return this.createUserProfile(trimmed);
    }

    const userCell = await fetchUserByTypeId(
      existingUser.typeId,
      this.userTypeCodeHash,
      this.signer,
      this.protocolTypeHash
    );

    if (!userCell) {
      throw new Error("User cell not found");
    }

    if (!userCell.cellOutput.type) {
      throw new Error("User cell type script is missing");
    }

    if (!this.userTypeCodeCell) {
      throw new Error(
        "User type contract not found. Please deploy the contracts first."
      );
    }

    const existingUserData = ckboost.types.UserData.decode(userCell.outputData);

    const updatedProfileEntries = this.buildProfileDataEntries({
      displayName: trimmed,
      extraEntries: existingUserData.profile_data ?? [],
    });

    const updatedUserData = {
      ...existingUserData,
      profile_data: updatedProfileEntries,
      last_activity_timestamp: BigInt(Date.now()),
    } as UserDataLike;

    const executorUrl =
      process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
    const executor = new ssri.ExecutorJsonRpc(executorUrl);

    this.userInstance = new ckboost.User(
      this.userTypeCodeCell,
      ccc.Script.from({
        codeHash: this.userTypeCodeHash,
        hashType: "type",
        args: userCell.cellOutput.type.args,
      }),
      { executor }
    );

    const { res: updateTx } = await this.userInstance.updateVerificationData(
      this.signer,
      updatedUserData
    );

    const protocolCell = await fetchProtocolCell(this.signer.client);
    if (!protocolCell) {
      throw new Error(
        "Protocol cell not found on blockchain. Please deploy protocol cell first."
      );
    }
    updateTx.addCellDeps({ outPoint: protocolCell.outPoint, depType: "code" });

    const txHash =
      await this.sendTransactionWithIdentityAttestation(
        this.signer,
        updateTx
      );

    log.log("User display name updated", {
      txHash: txHash.slice(0, 10) + "...",
      userTypeId: existingUser.typeId.slice(0, 10) + "...",
      displayName: trimmed,
    });

    return txHash;
  }

  /**
   * Check if user exists
   */
  async userExists(): Promise<boolean> {
    const lockScript = (await this.signer.getRecommendedAddressObj()).script;
    const lockHash = lockScript.hash();
    const userData = await this.getUserByLockHash(lockHash);
    return userData !== null;
  }

  /**
   * Get current user's type ID
   */
  async getCurrentUserTypeId(): Promise<ccc.Hex | null> {
    const lockScript = (await this.signer.getRecommendedAddressObj()).script;
    const lockHash = lockScript.hash();
    const userData = await this.getUserByLockHash(lockHash);
    return userData?.typeId || null;
  }

  async buildClaimPointsBatchTransaction(
    poolCells: ccc.Cell[],
    options: ClaimPointsOptions = {}
  ): Promise<ccc.Transaction> {
    if (poolCells.length === 0) {
      throw new Error("At least one claimable pool cell is required");
    }

    const claimantLock = (await this.signer.getRecommendedAddressObj()).script;
    const claimantLockHash = ccc.hexFrom(claimantLock.hash());
    const tx = ccc.Transaction.from({});
    let claimedAmount = 0n;
    let pointsType: ccc.Script | null = null;

    for (const poolCell of poolCells) {
      if (!poolCell.cellOutput.type) {
        throw new Error("Claimable pool cell must carry the Points type script");
      }

      const poolPointsType = ccc.Script.from(poolCell.cellOutput.type);
      if (!pointsType) {
        pointsType = poolPointsType;
      } else if (scriptHash(pointsType) !== scriptHash(poolPointsType)) {
        throw new Error("All claimable pool cells must use the same UDT type");
      }

      const decodedPool = decodeClaimablePoolData(poolCell.outputData);
      const claimResult = removeClaimablePoolEntriesForClaimant(
        decodedPool,
        claimantLockHash
      );

      claimedAmount += claimResult.claimedAmount;
      tx.addInput(poolCell);
      tx.addOutput(
        poolCell.cellOutput,
        encodeClaimablePoolData(claimResult.data)
      );
    }

    if (!pointsType) {
      throw new Error("Claimable pool cell must carry the Points type script");
    }

    this.addPointsUdtCellDep(tx);
    addClaimablePoolLockCellDep(tx);

    const claimedAmountHex = ccc.numToBytes(claimedAmount, 16);
    const existingPointsCell =
      options.pointsInputCell ??
      (await this.findPointsCellByLock(claimantLock, pointsType));

    if (existingPointsCell?.cellOutput.type) {
      if (scriptHash(existingPointsCell.cellOutput.type) !== scriptHash(pointsType)) {
        throw new Error("Provided Points input does not match the pool UDT type");
      }
      tx.addInput(existingPointsCell);
      const existingAmount = readUdtAmount(existingPointsCell.outputData);
      tx.addOutput(
        existingPointsCell.cellOutput,
        ccc.numToBytes(existingAmount + claimedAmount, 16)
      );
    } else {
      tx.addOutput(
        ccc.CellOutput.from(
          {
            lock: claimantLock,
            type: pointsType,
          },
          claimedAmountHex
        ),
        claimedAmountHex
      );
    }

    return tx;
  }

  async buildClaimablePoolBatchTransaction(
    poolCells: ccc.Cell[],
    options: ClaimablePoolClaimOptions = {}
  ): Promise<ccc.Transaction> {
    if (poolCells.length === 0) {
      throw new Error("At least one claimable pool cell is required");
    }

    const claimantLock = (await this.signer.getRecommendedAddressObj()).script;
    const claimantLockHash = ccc.hexFrom(claimantLock.hash());
    const tx = ccc.Transaction.from({});
    let claimedAmount = 0n;
    let poolType: ccc.Script | null | undefined;

    for (const poolCell of poolCells) {
      const currentType = poolCell.cellOutput.type
        ? ccc.Script.from(poolCell.cellOutput.type)
        : null;
      if (poolType === undefined) {
        poolType = currentType;
      } else if (
        (poolType === null) !== (currentType === null) ||
        (poolType &&
          currentType &&
          scriptHash(poolType) !== scriptHash(currentType))
      ) {
        throw new Error("All claimable pool cells must use the same asset type");
      }

      const decodedPool = decodeClaimablePoolData(poolCell.outputData);
      const claimResult = removeClaimablePoolEntriesForClaimant(
        decodedPool,
        claimantLockHash
      );

      claimedAmount += claimResult.claimedAmount;
      tx.addInput(poolCell);

      const poolData = encodeClaimablePoolData(claimResult.data);
      if (currentType) {
        tx.addOutput(poolCell.cellOutput, poolData);
      } else {
        const inputCapacity = ccc.numFrom(poolCell.cellOutput.capacity);
        if (inputCapacity < claimResult.claimedAmount) {
          throw new Error("CKB pool capacity is smaller than claimable amount");
        }
        tx.addOutput(
          ccc.CellOutput.from({
            capacity: inputCapacity - claimResult.claimedAmount,
            lock: poolCell.cellOutput.lock,
          }),
          poolData
        );
      }
    }

    if (claimedAmount <= 0n) {
      throw new Error("No claimable entries found for the current signer");
    }

    addClaimablePoolLockCellDep(tx);

    if (poolType) {
      await options.addUdtCellDeps?.(tx, poolType);
      const existingUdtCell =
        options.udtInputCell ??
        (await this.findPointsCellByLock(claimantLock, poolType));

      if (existingUdtCell?.cellOutput.type) {
        if (scriptHash(existingUdtCell.cellOutput.type) !== scriptHash(poolType)) {
          throw new Error("Provided UDT input does not match the pool UDT type");
        }
        tx.addInput(existingUdtCell);
        const existingAmount = readUdtAmount(existingUdtCell.outputData);
        tx.addOutput(
          existingUdtCell.cellOutput,
          ccc.numToBytes(existingAmount + claimedAmount, 16)
        );
      } else {
        const claimedAmountHex = ccc.numToBytes(claimedAmount, 16);
        tx.addOutput(
          ccc.CellOutput.from(
            {
              lock: claimantLock,
              type: poolType,
            },
            claimedAmountHex
          ),
          claimedAmountHex
        );
      }
    } else {
      const claimOutput = ccc.CellOutput.from({ lock: claimantLock }, "0x");
      const minClaimCapacity = ccc.numFrom(claimOutput.capacity);
      claimOutput.capacity =
        claimedAmount > minClaimCapacity ? claimedAmount : minClaimCapacity;
      tx.addOutput(claimOutput, "0x");
    }

    return tx;
  }

  async claimClaimablePoolBatch(
    poolCells: ccc.Cell[],
    options: ClaimablePoolClaimOptions = {}
  ): Promise<ccc.Hex> {
    const tx = await this.buildClaimablePoolBatchTransaction(poolCells, options);
    await tx.completeInputsByCapacity(this.signer);
    await tx.completeFeeBy(this.signer);
    const preserveOutputCapacityIndices = new Set<number>(
      poolCells.map((_, index) => index)
    );
    const firstClaimOutputIndex = poolCells.length;
    if (!poolCells[0].cellOutput.type) {
      preserveOutputCapacityIndices.add(firstClaimOutputIndex);
    }
    return sendTransactionWithFeeRetry(this.signer, tx, {
      preserveOutputCapacityIndices,
      pendingMetadata: {
        label: "Claimable Pool",
        context: "UserService",
      },
    });
  }

  async claimPointsBatch(
    poolCells: ccc.Cell[],
    options: ClaimPointsOptions = {}
  ): Promise<ccc.Hex> {
    const tx = await this.buildClaimPointsBatchTransaction(poolCells, options);
    await tx.completeInputsByCapacity(this.signer);
    await tx.completeFeeBy(this.signer);
    return sendTransactionWithFeeRetry(this.signer, tx, {
      preserveOutputCapacityIndices: new Set(poolCells.map((_, index) => index)),
      pendingMetadata: {
        label: "Claimable Points",
        context: "UserService",
      },
    });
  }

  /**
   * Toggle Nostr storage on/off
   */
  setUseNostrStorage(useNostr: boolean) {
    this.useNostrStorage = useNostr;
    log.log("Nostr storage toggled", { enabled: useNostr });

  }

  /**
   * Ensure deployment info is loaded
   */
  private async ensureDeploymentInfo(): Promise<void> {
    if (!this.initialized) {
      await this.initializeDeploymentInfo();
    }

    if (!this.userTypeCodeCell) {
      // Try one more time to get the deployment info
      const network = deploymentManager.getCurrentNetwork();
      const userTypeOutPoint = deploymentManager.getContractOutPoint(
        network,
        "ckboostUserType"
      );

      if (!userTypeOutPoint) {
        throw new Error(
          "User type contract not found in deployments.json. Please deploy the contracts first."
        );
      }

      this.userTypeCodeCell = ccc.OutPoint.from({
        txHash: userTypeOutPoint.txHash,
        index: userTypeOutPoint.index,
      });

      log.log("User type contract loaded on demand", {
        txHash: userTypeOutPoint.txHash.slice(0, 10) + "...",
      });
    }
  }

  /**
   * Check if submission content is a Nostr reference
   */
  isNostrReference(content: string): boolean {
    return content.startsWith("nevent1");
  }

  // This function should act as a router
  async updateVerificationData(
    userVerificationData: ckboost.types.UserVerificationDataLike,
    tx?: ccc.Transaction
  ): Promise<ccc.Hex> {
    // Ensure deployment info is loaded
    await this.ensureDeploymentInfo();

    if (!this.userTypeCodeCell) {
      throw new Error(
        "User type contract not found. Please deploy the contracts first."
      );
    }

    // Get current user by lock hash
    const lockScript = (await this.signer.getRecommendedAddressObj()).script;
    const lockHash = lockScript.hash();
    const existingUser = await this.getUserByLockHash(lockHash);

    if (!existingUser || !existingUser.typeId) {
      log.log("No user found, creating before verification update");
      return this.createUserWithVerification(userVerificationData);
    }

    // Fetch the live user cell for script args
    const userCell = await fetchUserByTypeId(
      existingUser.typeId,
      this.userTypeCodeHash,
      this.signer,
      this.protocolTypeHash
    );
    if (!userCell) {
      throw new Error("User cell not found");
    }

    if (!userCell.cellOutput.type) {
      throw new Error("User cell type script is missing");
    }

    // Refresh user instance bound to the existing user type script
    const executorUrl =
      process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
    const executor = new ssri.ExecutorJsonRpc(executorUrl);
    this.userInstance = new ckboost.User(
      this.userTypeCodeCell!,
      ccc.Script.from({
        codeHash: this.userTypeCodeHash,
        hashType: "type",
        args: userCell.cellOutput.type.args,
      }),
      { executor }
    );

    const userData = UserData.decode(userCell.outputData);
    const newUserData = {
      ...userData,
      verification_data: userVerificationData,
    };

    const { res: updateTx } = await this.userInstance.updateVerificationData(
      this.signer,
      newUserData,
      tx
    );

    log.log("updateTx", updateTx);

    // Add protocol cell as a dep (required to read protocol data in type script)
    const protocolCell = await fetchProtocolCell(this.signer.client);
    if (!protocolCell) {
      throw new Error(
        "Protocol cell not found on blockchain. Please deploy protocol cell first."
      );
    }
    updateTx.addCellDeps({ outPoint: protocolCell.outPoint, depType: "code" });

    const txHash =
      await this.sendTransactionWithIdentityAttestation(
        this.signer,
        updateTx
      );

    log.log("User verification data updated", {
      txHash: txHash.slice(0, 10) + "...",
      userTypeId: existingUser.typeId.slice(0, 10) + "...",
    });

    return txHash;
  }

  private async upsertIdentityVerificationEntry(
    entry: VerificationDataEntries,
    telegramPersonalChatId?: string | number
  ): Promise<ccc.Hex> {
    await this.ensureDeploymentInfo();

    const lockScript = (await this.signer.getRecommendedAddressObj()).script;
    const existingUser = await this.getUserByLockHash(lockScript.hash());
    if (!existingUser?.typeId) {
      return this.createUserWithVerification({
        telegram_personal_chat_id: telegramPersonalChatId ?? 0n,
        identity_verification_data: ccc.bytesFrom(
          JSON.stringify([entry]),
          "utf8"
        ),
      });
    }

    const userCell = await fetchUserByTypeId(
      existingUser.typeId,
      this.userTypeCodeHash,
      this.signer,
      this.protocolTypeHash
    );
    if (!userCell) {
      throw new Error("User cell not found");
    }

    const currentUserData = parseUserData(userCell);
    if (!currentUserData) {
      throw new Error("Failed to parse user data");
    }

    const entries = upsertVerificationEntry(
      decodeVerificationEntries(
        currentUserData.verification_data.identity_verification_data
      ),
      entry
    );
    return this.updateVerificationData({
      telegram_personal_chat_id:
        telegramPersonalChatId ??
        currentUserData.verification_data.telegram_personal_chat_id,
      identity_verification_data: ccc.bytesFrom(
        JSON.stringify(entries),
        "utf8"
      ),
    });
  }

  /**
   * Update user verification data (Telegram)
   */
  async updateTelegramVerification(
    telegramVerificationData: TelegramVerificationData
  ): Promise<ccc.Hex> {
    return this.upsertIdentityVerificationEntry(
      { source: "telegram", data: telegramVerificationData },
      telegramVerificationData.id
    );
  }

  async updateDidVerification(
    didVerificationData: DidVerificationData
  ): Promise<ccc.Hex> {
    const requested = normalizeDidVerificationData(didVerificationData);
    if (!requested) {
      throw new Error("Select a valid did:ckb identity");
    }

    const lock = (await this.signer.getRecommendedAddressObj()).script;
    const controlledDids = await listControlledDids({
      codeHash: lock.codeHash,
      hashType: lock.hashType,
      args: lock.args,
    });
    const controlled = controlledDids.find(({ did }) => did === requested.did);
    if (!controlled) {
      throw new Error(
        "The selected did:ckb identity is not controlled by this wallet"
      );
    }

    return this.upsertIdentityVerificationEntry({
      source: "did",
      data: controlled,
    });
  }

  /**
   * Get user verification status
   */
  async getUserVerificationStatus(
    userTypeId?: ccc.Hex | null
  ): Promise<VerificationStatus> {
    let targetTypeId = userTypeId;

    if (!targetTypeId) {
      // Get current user's type ID
      targetTypeId = await this.getCurrentUserTypeId();
      if (!targetTypeId) {
        return emptyVerificationStatus();
      }
    }

    const userCell = await fetchUserByTypeId(
      targetTypeId,
      this.userTypeCodeHash,
      this.signer,
      this.protocolTypeHash
    );

    if (!userCell) {
      return emptyVerificationStatus();
    }

    const userData = parseUserData(userCell);
    if (!userData) {
      return emptyVerificationStatus();
    }

    const identityData =
      userData.verification_data.identity_verification_data;
    const storedDid = getDidVerificationData(identityData);
    const telegramData = getTelegramVerificationData(identityData);

    // Determine Telegram binding strictly from telegram_personal_chat_id
    const chatId = userData.verification_data
      ?.telegram_personal_chat_id as unknown;
    const telegramBound =
      typeof chatId === "bigint"
        ? (chatId as bigint) > 0n
        : !!chatId && Number(chatId) > 0;

    let verificationFlags = deriveVerificationFlags(identityData);
    const VERIFICATION_TELEGRAM = 1;
    if (telegramBound) {
      verificationFlags = verificationFlags | VERIFICATION_TELEGRAM;
    } else {
      verificationFlags = verificationFlags & ~VERIFICATION_TELEGRAM;
    }

    // Check individual verification methods
    const VERIFICATION_KYC = 2;
    const VERIFICATION_DID = 4;
    const VERIFICATION_MANUAL = 8;
    const VERIFICATION_TWITTER = 16;
    const VERIFICATION_DISCORD = 32;
    const VERIFICATION_REDDIT = 64;

    let didControlled = false;
    let currentDid = storedDid;
    if (storedDid) {
      try {
        const controlledDids = await listControlledDids({
          codeHash: userCell.cellOutput.lock.codeHash,
          hashType: userCell.cellOutput.lock.hashType,
          args: userCell.cellOutput.lock.args,
        });
        const controlled = controlledDids.find(
          ({ did }) => did === storedDid.did
        );
        if (controlled) {
          didControlled = true;
          currentDid = controlled;
        }
      } catch (error) {
        log.warn("Failed to confirm preferred DID control", error);
      }
    }
    if (!didControlled) {
      verificationFlags = verificationFlags & ~VERIFICATION_DID;
    }

    const status: VerificationStatus = {
      telegram: telegramBound,
      twitter: (verificationFlags & VERIFICATION_TWITTER) !== 0,
      discord: (verificationFlags & VERIFICATION_DISCORD) !== 0,
      reddit: (verificationFlags & VERIFICATION_REDDIT) !== 0,
      kyc: (verificationFlags & VERIFICATION_KYC) !== 0,
      did: didControlled,
      manual_review: (verificationFlags & VERIFICATION_MANUAL) !== 0,
      verification_flags: verificationFlags,
      did_data: currentDid,
    };

    if (status.telegram && telegramData) {
      status.telegram_data = {
        username: telegramData.username ?? "",
        chat_id: String(telegramData.id),
        verified_at: Number(telegramData.auth_date ?? 0),
      };
    }

    log.log("User verification status", {
      userTypeId: targetTypeId.slice(0, 10) + "...",
      status,
      verificationFlags: verificationFlags.toString(2), // Binary representation
    });

    return status;
  }

  /**
   * Check if user meets campaign verification requirements
   */
  async checkCampaignEligibility(
    campaignVerificationRequirements: number[],
    userTypeId?: ccc.Hex | null
  ): Promise<{
    eligible: boolean;
    userVerificationFlags: number;
    requiredFlags: number[];
    missingVerifications: string[];
  }> {
    const userStatus = await this.getUserVerificationStatus(userTypeId);
    const userFlags = userStatus.verification_flags;

    const missingVerifications: string[] = [];
    const flagNames = {
      1: "telegram",
      2: "kyc",
      4: "did",
      8: "manual_review",
      16: "twitter",
      32: "discord",
      64: "reddit",
    };

    // Check if user meets any of the verification requirement levels
    let eligible = false;
    for (const requiredFlags of campaignVerificationRequirements) {
      if ((userFlags & requiredFlags) === requiredFlags) {
        eligible = true;
        break;
      }
    }

    // If not eligible, determine what's missing from the minimum requirement
    if (!eligible && campaignVerificationRequirements.length > 0) {
      const minRequiredFlags = Math.min(...campaignVerificationRequirements);
      for (const [flag, name] of Object.entries(flagNames)) {
        const flagNum = parseInt(flag);
        if ((minRequiredFlags & flagNum) !== 0 && (userFlags & flagNum) === 0) {
          missingVerifications.push(name);
        }
      }
    }

    log.log("Campaign eligibility check", {
      eligible,
      userFlags: userFlags.toString(2),
      requiredFlags: campaignVerificationRequirements.map((f) => f.toString(2)),
      missingVerifications,
    });

    return {
      eligible,
      userVerificationFlags: userFlags,
      requiredFlags: campaignVerificationRequirements,
      missingVerifications,
    };
  }

  /**
   * Clean up resources
   */
  dispose() {
    // Nostr pool cleanup is owned by the React provider.
  }
}

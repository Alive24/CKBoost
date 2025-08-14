// User Service - Abstracts user data operations and quest submissions
// This service provides high-level user operations by delegating to the cell layer

import { ccc } from "@ckb-ccc/core";
import { ckboost } from "ssri-ckboost";
import { 
  fetchUserByTypeId,
  fetchUserByLockHash,
  parseUserData,
  extractTypeIdFromUserCell
} from "../ckb/user-cells";
import { NostrStorageService } from "./nostr-storage-service";
import { DeploymentManager, deploymentManager } from "../ckb/deployment-manager";
import { debug } from "../utils/debug";
import { fetchProtocolCell } from "../ckb/protocol-cells";

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
  private nostrService: NostrStorageService | null = null;
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
    
    debug.log("UserService initialized", {
      userTypeCodeHash,
      protocolTypeHash: protocolTypeHash.slice(0, 10) + "...",
      useNostrStorage
    });
  }

  /**
   * Initialize deployment information and Nostr service
   */
  private async initializeDeploymentInfo(): Promise<void> {
    try {
      // Get the user type contract outpoint from deployment manager
      const network = DeploymentManager.getCurrentNetwork();
      const deployment = deploymentManager.getCurrentDeployment(
        network,
        "ckboostUserType"
      );
      const outPoint = deploymentManager.getContractOutPoint(
        network,
        "ckboostUserType"
      );

      if (!deployment || !outPoint) {
        debug.warn("User type contract not found in deployments.json");
      } else {
        this.userTypeCodeCell = ccc.OutPoint.from({
          txHash: outPoint.txHash,
          index: outPoint.index
        });
        debug.log("User type contract loaded", {
          txHash: outPoint.txHash.slice(0, 10) + "...",
          index: outPoint.index
        });
      }

      // Initialize Nostr service lazily
      if (this.useNostrStorage && !this.nostrService) {
        this.nostrService = new NostrStorageService();
        debug.log("Nostr storage service initialized");
      }

      this.initialized = true;
    } catch (error) {
      debug.error("Failed to initialize deployment info:", error);
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
   * Submit a quest completion with optional Nostr storage
   * Creates user cell if it doesn't exist
   */
  async submitQuestWithAutoCreate(
    campaignTypeHash: ccc.Hex,
    questId: number,
    submissionContent: string, // Full HTML with images
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

    // If using Nostr storage, store the full content there first
    if (this.useNostrStorage && this.nostrService) {
      const userAddress = await this.signer.getRecommendedAddress();
      
      debug.log("Storing submission on Nostr...", {
        campaignTypeHash: campaignTypeHash.slice(0, 10) + "...",
        questId,
        contentSize: submissionContent.length
      });
      
      try {
        neventId = await this.nostrService.storeSubmission({
          campaignTypeHash,
          questId,
          userAddress,
          content: submissionContent,
          timestamp: Date.now()
        });
        debug.log("Stored on Nostr with nevent ID", {
          neventId: neventId.slice(0, 20) + "...",
          savedBytes: submissionContent.length - neventId.length
        });
      } catch (nostrError) {
        debug.warn("Failed to store on Nostr, will store on-chain:", nostrError);
        // Continue without Nostr storage
      }
      
      // Store only the nevent ID on-chain (much smaller)
      if (neventId) {
        contentToStore = neventId;
        debug.log("Using Nostr reference for on-chain storage", {
          originalSize: submissionContent.length,
          storedSize: neventId.length,
          reduction: Math.round((1 - neventId.length / submissionContent.length) * 100) + "%"
        });
      } else {
        // Fallback to storing full content if Nostr failed
        contentToStore = submissionContent;
        debug.warn("Nostr storage failed, falling back to on-chain storage");
      }
    } else {
      // Store the full content on-chain (expensive!)
      contentToStore = submissionContent;
      debug.warn("Storing full content on-chain", {
        contentSize: submissionContent.length,
        estimatedCost: "~" + Math.ceil(submissionContent.length / 100) + " CKB"
      });
    }

    // Check if user exists and proceed with submission
    const lockScript = (await this.signer.getRecommendedAddressObj()).script;
    const lockHash = lockScript.hash();
    
    const existingUserData = await this.getUserByLockHash(lockHash);
    
    let txHash: ccc.Hex;
    
    if (existingUserData && existingUserData.typeId) {
      // User exists, update with submission
      debug.log("Updating existing user with submission", {
        userTypeId: existingUserData.typeId.slice(0, 10) + "...",
        existingSubmissions: existingUserData.userData?.submission_records.length || 0
      });
      
      txHash = await this.submitQuest(
        campaignTypeHash,
        questId,
        contentToStore,
        existingUserData.typeId
      );
    } else {
      // Create new user with submission
      debug.log("Creating new user with first submission", {
        userName: userVerificationData?.name || "Anonymous",
        hasTwitter: !!userVerificationData?.twitter,
        hasDiscord: !!userVerificationData?.discord
      });
      
      txHash = await this.createUserWithSubmission(
        campaignTypeHash,
        questId,
        contentToStore,
        userVerificationData
      );
    }

    debug.log("Quest submission successful", {
      txHash: txHash.slice(0, 10) + "...",
      isNewUser: !existingUserData,
      usedNostr: !!neventId
    });

    return { txHash, neventId };
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
    if (submissionContent.startsWith('nevent1')) {
      // Note: NostrStorageService only prepares events, doesn't retrieve them
      // Retrieval would need to be done through the React hook
      // For now, return the nevent ID with a flag
      return {
        content: submissionContent,
        metadata: { type: 'nevent', stored: 'nostr' },
        isFromNostr: true
      };
    }

    // It's raw content stored on-chain
    return {
      content: submissionContent,
      isFromNostr: false
    };
  }

  /**
   * Get user submissions with content (from Nostr if applicable)
   */
  async getUserSubmissionsWithContent(userTypeId: ccc.Hex): Promise<Array<{
    campaignTypeHash: string;
    questId: number;
    timestamp: number;
    submissionContent: string;
    neventId?: string;
    content?: string;
    isFromNostr: boolean;
  }>> {
    const userCell = await fetchUserByTypeId(
      userTypeId,
      this.userTypeCodeHash,
      this.signer
    );

    if (!userCell) {
      debug.log("No user cell found for type ID:", userTypeId);
      return [];
    }

    const userData = parseUserData(userCell);
    if (!userData) {
      debug.log("Failed to parse user data from cell");
      return [];
    }

    debug.log("Found user data with submissions:", {
      typeId: userTypeId.slice(0, 10) + "...",
      totalSubmissions: userData.submission_records.length,
      submissions: userData.submission_records.map(r => ({
        campaign: r.campaign_type_hash?.slice(0, 10) + "...",
        questId: r.quest_id,
        timestamp: r.submission_timestamp
      }))
    });

    // Process each submission
    const submissionsWithContent = await Promise.all(
      userData.submission_records.map(async (record) => {
        // Convert campaign_type_hash to hex string if it's bytes
        let campaignTypeHash: string;
        
        // Log the raw campaign_type_hash for debugging
        debug.log("Processing submission record:", {
          raw_campaign_type_hash: record.campaign_type_hash,
          type: typeof record.campaign_type_hash,
          isUint8Array: record.campaign_type_hash instanceof Uint8Array,
          length: (record.campaign_type_hash as any)?.length || 'N/A'
        });
        
        if (typeof record.campaign_type_hash === 'string') {
          // Already a string, use as-is
          campaignTypeHash = record.campaign_type_hash;
        } else if (record.campaign_type_hash instanceof Uint8Array || 
                   (record.campaign_type_hash && typeof record.campaign_type_hash === 'object' && 'length' in record.campaign_type_hash)) {
          // It's a byte array (Uint8Array or array-like object)
          const bytes = record.campaign_type_hash instanceof Uint8Array 
            ? record.campaign_type_hash 
            : new Uint8Array(Object.values(record.campaign_type_hash));
          campaignTypeHash = ccc.hexFrom(bytes);
        } else {
          // Try to convert whatever it is to bytes first, then to hex
          try {
            campaignTypeHash = ccc.hexFrom(ccc.bytesFrom(record.campaign_type_hash));
          } catch (e) {
            debug.error("Failed to convert campaign_type_hash to hex:", e);
            campaignTypeHash = "0x"; // Fallback to empty hex
          }
        }
        
        debug.log("Converted campaign type hash:", {
          original: record.campaign_type_hash,
          converted: campaignTypeHash,
          questId: record.quest_id
        });
        
        const submissionData = {
          campaignTypeHash,
          questId: Number(record.quest_id),
          timestamp: Number(record.submission_timestamp),
          submissionContent: record.submission_content,
          neventId: undefined as string | undefined,
          content: undefined as string | undefined,
          isFromNostr: false
        };

        // Check if content is a Nostr reference
        // The submission_content might be hex-encoded
        let decodedContent = record.submission_content;
        debug.log("Raw submission content:", {
          content: record.submission_content.slice(0, 50) + "...",
          length: record.submission_content.length
        });
        
        try {
          // Try to decode from hex if it looks like hex
          if (record.submission_content.startsWith('0x')) {
            // Remove 0x prefix and decode
            const hexContent = record.submission_content.slice(2);
            decodedContent = Buffer.from(hexContent, 'hex').toString('utf-8');
            debug.log("Decoded from 0x hex:", decodedContent.slice(0, 50) + "...");
          } else if (/^[0-9a-fA-F]+$/.test(record.submission_content)) {
            // Pure hex string without 0x prefix
            decodedContent = Buffer.from(record.submission_content, 'hex').toString('utf-8');
            debug.log("Decoded from pure hex:", decodedContent.slice(0, 50) + "...");
          }
        } catch (e) {
          // If decoding fails, use original content
          debug.log("Failed to decode submission content from hex", e);
        }
        
        if (decodedContent.startsWith('nevent1')) {
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
    campaignTypeHash: ccc.Hex,
    questId: number,
    submissionContent: string, // Could be nevent ID or actual content
    userTypeId: ccc.Hex
  ): Promise<ccc.Hex> {
    // Ensure deployment info is loaded
    await this.ensureDeploymentInfo();

    // Fetch current user cell
    const userCell = await fetchUserByTypeId(
      userTypeId,
      this.userTypeCodeHash,
      this.signer
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
      (record) => {
        // Convert campaign_type_hash for comparison
        let recordCampaignHash: string;
        if (typeof record.campaign_type_hash === 'string') {
          recordCampaignHash = record.campaign_type_hash;
        } else if (record.campaign_type_hash instanceof Uint8Array) {
          recordCampaignHash = ccc.hexFrom(record.campaign_type_hash);
        } else {
          try {
            recordCampaignHash = ccc.hexFrom(ccc.bytesFrom(record.campaign_type_hash));
          } catch {
            recordCampaignHash = "0x";
          }
        }
        return recordCampaignHash === campaignTypeHash && Number(record.quest_id) === questId;
      }
    );

    // Create new submission record
    const newSubmissionBytes = ckboost.User.createSubmissionRecord(
      campaignTypeHash,
      questId,
      submissionContent // This could be nevent ID or actual content
    );
    
    const newSubmission = ckboost.types.UserSubmissionRecord.decode(newSubmissionBytes);

    // Update or add submission
    let updatedSubmissions = [...currentUserData.submission_records];
    if (existingSubmissionIndex >= 0) {
      // Update existing submission (resubmission case)
      updatedSubmissions[existingSubmissionIndex] = newSubmission;
      debug.log("Updating existing submission at index", existingSubmissionIndex);
    } else {
      // Add new submission
      updatedSubmissions.push(newSubmission);
      debug.log("Adding new submission to user");
    }

    // Create updated user data
    const updatedUserData = {
      verification_data: currentUserData.verification_data,
      total_points_earned: currentUserData.total_points_earned,
      last_activity_timestamp: BigInt(Date.now()),
      submission_records: updatedSubmissions
    };

    // Create executor for SSRI operations
    const executorUrl = process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
    const { ssri } = await import("@ckb-ccc/ssri");
    const executor = new ssri.ExecutorJsonRpc(executorUrl);
    
    // Create User instance with correct script args and executor
    const userInstanceWithScript = new ckboost.User(
      this.userTypeCodeCell!,
      ccc.Script.from({
        codeHash: this.userTypeCodeHash,
        hashType: "type",
        args: userCell.cellOutput.type?.args || ""
      }),
      { executor } // Pass the executor in config
    );

    // Create a transaction that consumes the existing user cell
    const baseTx = ccc.Transaction.from({
      inputs: [{
        previousOutput: userCell.outPoint
      }],
      outputs: [{
        lock: userCell.cellOutput.lock,
        type: userCell.cellOutput.type,
        capacity: userCell.cellOutput.capacity
      }],
      outputsData: [ccc.hexFrom(ckboost.types.UserData.encode(updatedUserData))]
    });

    // Build transaction using SSRI (it will update the existing transaction)
    const result = await userInstanceWithScript.submitQuest(
      this.signer,
      updatedUserData,
      baseTx
    );

    // Get the transaction from the result
    const updateTx = result.res;
    
    // Fetch the protocol cell and add it as a dependency
    const protocolCell = await fetchProtocolCell(this.signer);
    if (!protocolCell) {
      throw new Error("Protocol cell not found");
    }
    
    // Add the protocol cell as a dependency (required for validation)
    updateTx.addCellDeps({
      outPoint: protocolCell.outPoint,
      depType: "code",
    });

    // Complete fees and send transaction (following campaign-service pattern)
    await updateTx.completeInputsByCapacity(this.signer);
    await updateTx.completeFeeBy(this.signer);
    
    debug.log("Updating user cell with submission", {
      userTypeId: userTypeId.slice(0, 10) + "...",
      totalSubmissions: updatedSubmissions.length,
      lastActivity: new Date(Number(updatedUserData.last_activity_timestamp)).toISOString()
    });
    
    const txHash = await this.signer.sendTransaction(updateTx);
    
    debug.log("User cell updated", {
      txHash: txHash.slice(0, 10) + "..."
    });

    return txHash;
  }

  /**
   * Create a new user with initial submission
   */
  private async createUserWithSubmission(
    campaignTypeHash: ccc.Hex,
    questId: number,
    submissionContent: string, // Could be nevent ID or actual content
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
      throw new Error("User type contract not found. Please deploy the contracts first.");
    }

    // Create identity verification JSON
    const identityData = JSON.stringify({
      name: verificationData?.name || "Anonymous",
      email: verificationData?.email || "",
      twitter: verificationData?.twitter || "",
      discord: verificationData?.discord || ""
    });

    // Create user verification data
    const userVerificationDataStruct = {
      telegram_personal_chat_id: 0n,
      identity_verification_data: ccc.bytesFrom(identityData, "utf8")
    };

    // Create new submission record
    const newSubmissionBytes = ckboost.User.createSubmissionRecord(
      campaignTypeHash,
      questId,
      submissionContent // This could be nevent ID or actual content
    );
    const newSubmission = ckboost.types.UserSubmissionRecord.decode(newSubmissionBytes);

    // Create initial user data with the submission
    const userData = {
      verification_data: userVerificationDataStruct,
      total_points_earned: 0,
      last_activity_timestamp: BigInt(Date.now()),
      submission_records: [newSubmission]
    };

    // Now that the contract's submit_quest handles both creation and update,
    // we can use it for creation too. We just need to pass empty args
    // so the contract knows this is a creation.
    
    // Create executor for SSRI operations
    const executorUrl = process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
    const { ssri } = await import("@ckb-ccc/ssri");
    const executor = new ssri.ExecutorJsonRpc(executorUrl);
    
    // Create User instance with empty args (signals creation) and executor
    const userInstanceForCreation = new ckboost.User(
      this.userTypeCodeCell,
      ccc.Script.from({
        codeHash: this.userTypeCodeHash,
        hashType: "type",
        args: "0x" // Empty args signals creation to the contract
      }),
      { executor } // Pass the executor in config
    );

    // Build transaction using SSRI - the contract will handle creation
    const result = await userInstanceForCreation.submitQuest(
      this.signer,
      userData
    );

    // The contract returns a transaction with the new user cell
    const createTx = result.res;
    
    // Find the user cell output (should be the first output with the user type script)
    const userCellOutputIndex = createTx.outputs.findIndex(
      (output) => output.type?.codeHash === this.userTypeCodeHash
    );
    
    if (userCellOutputIndex === -1) {
      throw new Error("User cell output not found in transaction");
    }
    
    // Update the ConnectedTypeID with the protocol type hash
    // The contract creates it with type_id but empty connected_type_hash
    let userCellTypeArgs = createTx.outputs[userCellOutputIndex].type?.args;
    if (!userCellTypeArgs) {
      throw new Error("User cell type args is empty");
    }
    
    // Decode the ConnectedTypeID
    const connectedTypeId = ckboost.types.ConnectedTypeID.decode(userCellTypeArgs);
    
    // Update with the correct protocol type hash
    connectedTypeId.connected_type_hash = ccc.bytesFrom(this.protocolTypeHash);
    
    // Encode and update the args
    const updatedConnectedTypeIdBytes = ckboost.types.ConnectedTypeID.encode(connectedTypeId);
    const updatedConnectedTypeIdArgs = ccc.hexFrom(updatedConnectedTypeIdBytes);
    
    // Update the user cell's type script args with the ConnectedTypeID
    if (createTx.outputs[userCellOutputIndex].type) {
      createTx.outputs[userCellOutputIndex].type.args = updatedConnectedTypeIdArgs;
    }
    
    // Fetch the protocol cell and add it as a dependency
    const protocolCell = await fetchProtocolCell(this.signer);
    if (!protocolCell) {
      throw new Error("Protocol cell not found");
    }
    
    // Add the protocol cell as a dependency (required for validation)
    createTx.addCellDeps({
      outPoint: protocolCell.outPoint,
      depType: "code",
    });
    
    // Complete fees and send transaction
    await createTx.completeInputsByCapacity(this.signer);
    await createTx.completeFeeBy(this.signer);
    
    debug.log("Creating user cell with submission", {
      userTypeHash: this.userTypeCodeHash.slice(0, 10) + "...",
      protocolTypeHash: this.protocolTypeHash.slice(0, 10) + "...",
      userName: verificationData?.name || "Anonymous",
      hasSubmission: true
    });
    
    // Send transaction
    const txHash = await this.signer.sendTransaction(createTx);
    
    debug.log("User cell created", {
      txHash: txHash.slice(0, 10) + "...",
      userName: verificationData?.name || "Anonymous"
    });
    
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
      this.signer
    );

    if (!userCell) {
      return null;
    }

    const typeId = extractTypeIdFromUserCell(userCell);
    const userData = parseUserData(userCell);

    return {
      cell: userCell,
      typeId,
      userData
    };
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

  /**
   * Toggle Nostr storage on/off
   */
  setUseNostrStorage(useNostr: boolean) {
    this.useNostrStorage = useNostr;
    debug.log("Nostr storage toggled", { enabled: useNostr });
    
    // Initialize Nostr service if needed
    if (useNostr && !this.nostrService) {
      this.nostrService = new NostrStorageService();
      debug.log("Nostr service initialized on demand");
    }
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
      const network = DeploymentManager.getCurrentNetwork();
      const userTypeOutPoint = deploymentManager.getContractOutPoint(
        network,
        "ckboostUserType"
      );

      if (!userTypeOutPoint) {
        throw new Error("User type contract not found in deployments.json. Please deploy the contracts first.");
      }

      this.userTypeCodeCell = ccc.OutPoint.from({
        txHash: userTypeOutPoint.txHash,
        index: userTypeOutPoint.index
      });
      
      debug.log("User type contract loaded on demand", {
        txHash: userTypeOutPoint.txHash.slice(0, 10) + "..."
      });
    }
  }

  /**
   * Check if submission content is a Nostr reference
   */
  isNostrReference(content: string): boolean {
    return content.startsWith('nevent1');
  }

  /**
   * Clean up resources
   */
  dispose() {
    // NostrStorageService doesn't have a close method
    // Cleanup handled automatically
  }
}
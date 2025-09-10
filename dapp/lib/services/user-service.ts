// User Service - Abstracts user data operations and quest submissions
// This service provides high-level user operations by delegating to the cell layer

import { ccc, ssri } from "@ckb-ccc/connector-react";
import { ckboost } from "ssri-ckboost";
import { 
  fetchUserByTypeId,
  fetchUserByLockHash,
  parseUserData,
  extractTypeIdFromUserCell
} from "../ckb/user-cells";
import { NostrStorageService } from "./nostr-storage-service";
import { deploymentManager } from "../ckb/deployment-manager";
import { debug } from "../utils/debug";

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
    if (submissionContent.startsWith('nevent1')) {
      // It's already a nevent ID, don't store to Nostr again
      debug.log("Submission content is already a nevent ID", {
        neventId: submissionContent.slice(0, 20) + "..."
      });
      contentToStore = submissionContent;
      neventId = submissionContent;
    }
    // If using Nostr storage and content is not already a nevent ID, store the full content there first
    else if (this.useNostrStorage && this.nostrService) {
      const userAddress = await this.signer.getRecommendedAddress();
      
      debug.log("Storing submission on Nostr...", {
        campaignTypeId: campaignTypeId.slice(0, 10) + "...",
        questId,
        contentSize: submissionContent.length
      });
      
      try {
        neventId = await this.nostrService.storeSubmission({
          campaignTypeId,
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
        existingSubmissions: existingUserData.userData?.submission_records.length || 0,
        contentToStore: contentToStore.slice(0, 50) + "...",
        isNeventId: contentToStore.startsWith('nevent1')
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
      debug.log("Creating new user with first submission", {
        userName: userVerificationData?.name || "Anonymous",
        hasTwitter: !!userVerificationData?.twitter,
        hasDiscord: !!userVerificationData?.discord,
        contentToStore: contentToStore.slice(0, 50) + "...",
        isNeventId: contentToStore.startsWith('nevent1')
      });
      
      txHash = await this.createUserWithSubmission(
        campaignTypeId,
        questId,
        contentToStore,
        protocolCell,
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
    campaignTypeId: string;
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
      this.signer,
      this.protocolTypeHash  // Pass protocol type hash to ensure we get the right cell
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
        campaign: r.campaign_type_id?.slice(0, 10) + "...",
        questId: r.quest_id,
        timestamp: r.submission_timestamp
      }))
    });

    // Process each submission
    const submissionsWithContent = await Promise.all(
      userData.submission_records.map(async (record) => {
        // Convert campaign_type_id to hex string if it's bytes
        let campaignTypeId: string;
        
        // Log the raw campaign_type_id for debugging
        debug.log("Processing submission record:", {
          raw_campaign_type_id: record.campaign_type_id,
          type: typeof record.campaign_type_id,
          isUint8Array: record.campaign_type_id && typeof record.campaign_type_id === 'object' && ArrayBuffer.isView(record.campaign_type_id),
          length: (record.campaign_type_id as { length?: number })?.length || 'N/A'
        });
        
        if (typeof record.campaign_type_id === 'string') {
          // Already a string, use as-is
          campaignTypeId = record.campaign_type_id;
        } else if ((record.campaign_type_id && typeof record.campaign_type_id === 'object' && ArrayBuffer.isView(record.campaign_type_id)) || 
                   (record.campaign_type_id && typeof record.campaign_type_id === 'object' && 'length' in record.campaign_type_id)) {
          // It's a byte array (Uint8Array or array-like object)
          const bytes = (record.campaign_type_id && typeof record.campaign_type_id === 'object' && ArrayBuffer.isView(record.campaign_type_id)) 
            ? record.campaign_type_id 
            : new Uint8Array(Object.values(record.campaign_type_id));
          campaignTypeId = ccc.hexFrom(bytes);
        } else {
          // Try to convert whatever it is to bytes first, then to hex
          try {
            campaignTypeId = ccc.hexFrom(ccc.bytesFrom(record.campaign_type_id));
          } catch (e) {
            debug.error("Failed to convert campaign_type_id to hex:", e);
            campaignTypeId = "0x"; // Fallback to empty hex
          }
        }
        
        debug.log("Converted campaign type ID:", {
          original: record.campaign_type_id,
          converted: campaignTypeId,
          questId: record.quest_id
        });
        
        const submissionData = {
          campaignTypeId,
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
      this.protocolTypeHash  // Pass protocol type hash to ensure we get the right cell
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
        // Convert campaign_type_id for comparison
        let recordCampaignId: string;
        if (typeof record.campaign_type_id === 'string') {
          recordCampaignId = record.campaign_type_id;
        } else if (record.campaign_type_id && typeof record.campaign_type_id === 'object' && ArrayBuffer.isView(record.campaign_type_id)) {
          recordCampaignId = ccc.hexFrom(record.campaign_type_id);
        } else {
          try {
            recordCampaignId = ccc.hexFrom(ccc.bytesFrom(record.campaign_type_id));
          } catch {
            recordCampaignId = "0x";
          }
        }
        return recordCampaignId === campaignTypeId && Number(record.quest_id) === questId;
      }
    );

    // Create new submission record
    debug.log("Creating submission record with:", {
      campaignTypeId: campaignTypeId.slice(0, 10) + "...",
      questId,
      submissionContent: submissionContent.slice(0, 50) + "...",
      isNeventId: submissionContent.startsWith('nevent1'),
      fullLength: submissionContent.length
    });
    
    const newSubmissionBytes = ckboost.User.createSubmissionRecord(
      campaignTypeId,
      questId,
      submissionContent // This could be nevent ID or actual content
    );
    
    const newSubmission = ckboost.types.UserSubmissionRecord.decode(newSubmissionBytes);

    // Update or add submission
    const updatedSubmissions = [...currentUserData.submission_records];
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
    debug.log("Creating submission record with:", {
      campaignTypeId: campaignTypeId.slice(0, 10) + "...",
      questId,
      submissionContent: submissionContent.slice(0, 50) + "...",
      isNeventId: submissionContent.startsWith('nevent1'),
      fullLength: submissionContent.length
    });
    
    const newSubmissionBytes = ckboost.User.createSubmissionRecord(
      campaignTypeId,
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
    const connectedTypeId = ckboost.types.ConnectedTypeID.decode(userCellTypeArgs);
    
    // Update with the correct protocol type hash
    connectedTypeId.connected_key = this.protocolTypeHash as ccc.Hex;
    
    // Encode and update the args
    const updatedConnectedTypeIdBytes = ckboost.types.ConnectedTypeID.encode(connectedTypeId);
    const updatedConnectedTypeIdArgs = ccc.hexFrom(updatedConnectedTypeIdBytes);
    
    // Update the user cell's type script args with the ConnectedTypeID
    if (createTx.outputs[userCellOutputIndex].type) {
      createTx.outputs[userCellOutputIndex].type.args = updatedConnectedTypeIdArgs;
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
      this.signer,
      this.protocolTypeHash  // Pass protocol type hash to filter by protocol connection
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
      const network = deploymentManager.getCurrentNetwork();
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
   * Update user verification data (Telegram)
   */
  async updateTelegramVerification(
    telegramChatId: ccc.NumLike,
    telegramUsername: string,
    protocolCell: ccc.Cell,
    rawTelegramAuthData?: Record<string, unknown>,
    serverSignature?: string
  ): Promise<ccc.Hex> {
    // Ensure deployment info is loaded
    await this.ensureDeploymentInfo();

    // Get current user
    const lockScript = (await this.signer.getRecommendedAddressObj()).script;
    const lockHash = lockScript.hash();
    const existingUserData = await this.getUserByLockHash(lockHash);

    if (!existingUserData || !existingUserData.typeId) {
      throw new Error("User must exist before updating verification. Please create user first.");
    }

    // Convert NumLike to bigint for internal processing
    let chatIdBigInt: bigint;
    if (typeof telegramChatId === 'bigint') {
      chatIdBigInt = telegramChatId;
    } else if (typeof telegramChatId === 'number' || typeof telegramChatId === 'string') {
      chatIdBigInt = BigInt(telegramChatId);
    } else {
      // It's BytesLike, convert to hex then to bigint
      const hex = ccc.hexFrom(telegramChatId);
      chatIdBigInt = BigInt(hex);
    }
    
    debug.log("Updating Telegram verification for user", {
      userTypeId: existingUserData.typeId.slice(0, 10) + "...",
      telegramChatId: chatIdBigInt.toString(),
      telegramUsername
    });

    // Fetch current user cell
    const userCell = await fetchUserByTypeId(
      existingUserData.typeId,
      this.userTypeCodeHash,
      this.signer,
      this.protocolTypeHash
    );

    if (!userCell) {
      throw new Error("User cell not found");
    }

    // Parse current user data
    const currentUserData = parseUserData(userCell);
    if (!currentUserData) {
      throw new Error("Failed to parse user data");
    }

    // Create updated identity verification JSON
    const currentIdentityData = currentUserData.verification_data.identity_verification_data;
    let identityObject;
    
    try {
      // Try to parse existing identity data as JSON
      const identityString = Buffer.from(currentIdentityData).toString('utf8');
      identityObject = JSON.parse(identityString);
    } catch {
      // If parsing fails, start with empty object
      debug.log("No existing identity data found, creating new");
      identityObject = {};
    }

    // Add Telegram verification data
    identityObject.telegram = {
      username: telegramUsername,
      chat_id: chatIdBigInt.toString(),
      verified_at: Math.floor(Date.now() / 1000),
      verification_method: "bot_auth"
    };
    // Store the full Telegram login payload (including hash) for auditability/flexibility
    if (rawTelegramAuthData && typeof rawTelegramAuthData === 'object') {
      identityObject.telegram_login = rawTelegramAuthData;
    }

    // Include server-side signature if provided (authenticator attestation)
    if (serverSignature) {
      identityObject.telegram_server_signature = serverSignature;
    }

    // Update verification flags to include Telegram (bit 0)
    const VERIFICATION_TELEGRAM = 1;
    identityObject.verification_flags = (identityObject.verification_flags || 0) | VERIFICATION_TELEGRAM;

    debug.log("Updated identity data with Telegram verification", {
      telegramUsername,
      chatId: chatIdBigInt.toString(),
      hasRawLogin: !!rawTelegramAuthData,
      verificationFlags: identityObject.verification_flags
    });

    // Create updated user verification data
    const updatedVerificationData = {
      telegram_personal_chat_id: chatIdBigInt,
      identity_verification_data: ccc.bytesFrom(JSON.stringify(identityObject), "utf8")
    };

    // Create updated user data with the new verification data
    const updatedUserData = {
      verification_data: updatedVerificationData,
      total_points_earned: currentUserData.total_points_earned,
      last_activity_timestamp: BigInt(Date.now()),
      submission_records: currentUserData.submission_records
    };

    // Create executor for SSRI operations
    const executorUrl = process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
    const executor = new ssri.ExecutorJsonRpc(executorUrl);
    
    // Create User instance with current cell's script args and executor
    const userInstanceWithScript = new ckboost.User(
      this.userTypeCodeCell!,
      ccc.Script.from({
        codeHash: this.userTypeCodeHash,
        hashType: "type",
        args: userCell.cellOutput.type?.args || ""
      }),
      { executor }
    );

    // Build transaction using submitQuest method (which handles user updates)
    const result = await userInstanceWithScript.submitQuest(
      this.signer,
      updatedUserData,
      undefined // No base transaction needed
    );

    // Get the transaction from the result
    const updateTx = result.res;
    
    // Add the protocol cell as a dependency (required for validation)
    updateTx.addCellDeps({
      outPoint: protocolCell.outPoint,
      depType: "code",
    });

    // Complete fees and send transaction
    await updateTx.completeInputsByCapacity(this.signer);
    await updateTx.completeFeeBy(this.signer);
    
    debug.log("Updating user cell with Telegram verification", {
      userTypeId: existingUserData.typeId.slice(0, 10) + "...",
      telegramUsername,
      chatId: chatIdBigInt.toString()
    });
    
    const txHash = await this.signer.sendTransaction(updateTx);
    
    debug.log("User Telegram verification updated", {
      txHash: txHash.slice(0, 10) + "...",
      telegramUsername
    });

    return txHash;
  }

  /**
   * Prepare (but do not send) the transaction to update Telegram verification.
   * Returns a TransactionLike JSON that can be sent to a server for attestation/signature.
   */
  async prepareTelegramVerificationTx(
    telegramChatId: ccc.NumLike,
    telegramUsername: string,
    protocolCell: ccc.Cell,
    rawTelegramAuthData?: Record<string, unknown>
  ): Promise<any> {
    await this.ensureDeploymentInfo();

    const lockScript = (await this.signer.getRecommendedAddressObj()).script;
    const lockHash = lockScript.hash();
    const existingUserData = await this.getUserByLockHash(lockHash);
    if (!existingUserData || !existingUserData.typeId) {
      throw new Error("User must exist before updating verification. Please create user first.");
    }

    let chatIdBigInt: bigint;
    if (typeof telegramChatId === 'bigint') chatIdBigInt = telegramChatId;
    else if (typeof telegramChatId === 'number' || typeof telegramChatId === 'string') chatIdBigInt = BigInt(telegramChatId);
    else chatIdBigInt = BigInt(ccc.hexFrom(telegramChatId));

    const userCell = await fetchUserByTypeId(
      existingUserData.typeId,
      this.userTypeCodeHash,
      this.signer,
      this.protocolTypeHash
    );
    if (!userCell) throw new Error("User cell not found");

    const currentUserData = parseUserData(userCell);
    if (!currentUserData) throw new Error("Failed to parse user data");

    let identityObject: any;
    try {
      identityObject = JSON.parse(Buffer.from(currentUserData.verification_data.identity_verification_data).toString('utf8'));
    } catch {
      identityObject = {};
    }

    identityObject.telegram = {
      username: telegramUsername,
      chat_id: chatIdBigInt.toString(),
      verified_at: Math.floor(Date.now() / 1000),
      verification_method: "bot_auth"
    };
    if (rawTelegramAuthData && typeof rawTelegramAuthData === 'object') {
      identityObject.telegram_login = rawTelegramAuthData;
    }
    const VERIFICATION_TELEGRAM = 1;
    identityObject.verification_flags = (identityObject.verification_flags || 0) | VERIFICATION_TELEGRAM;

    const updatedVerificationData = {
      telegram_personal_chat_id: chatIdBigInt,
      identity_verification_data: ccc.bytesFrom(JSON.stringify(identityObject), "utf8")
    };

    const updatedUserData = {
      verification_data: updatedVerificationData,
      total_points_earned: currentUserData.total_points_earned,
      last_activity_timestamp: BigInt(Date.now()),
      submission_records: currentUserData.submission_records
    };

    const executorUrl = process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
    const executor = new ssri.ExecutorJsonRpc(executorUrl);
    const userInstanceWithScript = new ckboost.User(
      this.userTypeCodeCell!,
      ccc.Script.from({
        codeHash: this.userTypeCodeHash,
        hashType: "type",
        args: userCell.cellOutput.type?.args || ""
      }),
      { executor }
    );

    const result = await userInstanceWithScript.submitQuest(
      this.signer,
      updatedUserData,
      undefined
    );

    const updateTx = result.res;
    updateTx.addCellDeps({ outPoint: protocolCell.outPoint, depType: "code" });
    await updateTx.completeInputsByCapacity(this.signer);
    await updateTx.completeFeeBy(this.signer);

    // Serialize to TransactionLike JSON via stringify
    try {
      // @ts-ignore stringify exists in CCC core and is re-exported
      // If not available, fallback to manual shape later
      const json = (updateTx as any).stringify ? (updateTx as any).stringify() : JSON.stringify({
        version: updateTx.version,
        cellDeps: updateTx.cellDeps,
        headerDeps: updateTx.headerDeps,
        inputs: updateTx.inputs,
        outputs: updateTx.outputs,
        outputsData: updateTx.outputsData,
        witnesses: updateTx.witnesses
      });
      return JSON.parse(json);
    } catch {
      return {
        version: updateTx.version,
        cellDeps: updateTx.cellDeps.map((d: any) => ({ outPoint: d.outPoint, depType: d.depType })),
        headerDeps: updateTx.headerDeps,
        inputs: updateTx.inputs.map((i: any) => ({ previousOutput: i.previousOutput, since: i.since })),
        outputs: updateTx.outputs,
        outputsData: updateTx.outputsData,
        witnesses: updateTx.witnesses.map((w: any) => (typeof w === 'string' ? w : ccc.hexFrom(w)))
      };
    }
  }

  /**
   * Get user verification status
   */
  async getUserVerificationStatus(userTypeId?: ccc.Hex | null): Promise<{
    telegram: boolean;
    twitter: boolean;
    discord: boolean;
    reddit: boolean;
    kyc: boolean;
    did: boolean;
    manual_review: boolean;
    verification_flags: number;
    telegram_data?: {
      username: string;
      chat_id: string;
      verified_at: number;
    };
  }> {
    let targetTypeId = userTypeId;
    
    if (!targetTypeId) {
      // Get current user's type ID
      targetTypeId = await this.getCurrentUserTypeId();
      if (!targetTypeId) {
        // Return empty verification status if user doesn't exist
        return {
          telegram: false,
          twitter: false,
          discord: false,
          reddit: false,
          kyc: false,
          did: false,
          manual_review: false,
          verification_flags: 0
        };
      }
    }

    const userCell = await fetchUserByTypeId(
      targetTypeId,
      this.userTypeCodeHash,
      this.signer,
      this.protocolTypeHash
    );

    if (!userCell) {
      return {
        telegram: false,
        twitter: false,
        discord: false,
        reddit: false,
        kyc: false,
        did: false,
        manual_review: false,
        verification_flags: 0
      };
    }

    const userData = parseUserData(userCell);
    if (!userData) {
      return {
        telegram: false,
        twitter: false,
        discord: false,
        reddit: false,
        kyc: false,
        did: false,
        manual_review: false,
        verification_flags: 0
      };
    }

    // Parse identity verification data
    let identityData;
    try {
      const identityString = Buffer.from(userData.verification_data.identity_verification_data).toString('utf8');
      identityData = JSON.parse(identityString);
    } catch {
      debug.log("Failed to parse identity verification data");
      identityData = {};
    }

    // Determine Telegram binding strictly from telegram_personal_chat_id
    const chatId = userData.verification_data?.telegram_personal_chat_id as unknown;
    const telegramBound = typeof chatId === 'bigint'
      ? (chatId as bigint) > 0n
      : !!chatId && Number(chatId) > 0;

    // Start from stored flags (if any), but force-sync telegram bit with chat_id presence
    let verificationFlags = identityData.verification_flags || 0;
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

    const status = {
      telegram: telegramBound,
      twitter: (verificationFlags & VERIFICATION_TWITTER) !== 0,
      discord: (verificationFlags & VERIFICATION_DISCORD) !== 0,
      reddit: (verificationFlags & VERIFICATION_REDDIT) !== 0,
      kyc: (verificationFlags & VERIFICATION_KYC) !== 0,
      did: (verificationFlags & VERIFICATION_DID) !== 0,
      manual_review: (verificationFlags & VERIFICATION_MANUAL) !== 0,
      verification_flags: verificationFlags
    };

    // Add Telegram-specific data if available
    if (status.telegram && identityData.telegram) {
      return {
        ...status,
        telegram_data: {
          username: identityData.telegram.username,
          chat_id: identityData.telegram.chat_id,
          verified_at: identityData.telegram.verified_at
        }
      };
    }

    debug.log("User verification status", {
      userTypeId: targetTypeId.slice(0, 10) + "...",
      status,
      verificationFlags: verificationFlags.toString(2) // Binary representation
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
      1: 'telegram',
      2: 'kyc', 
      4: 'did',
      8: 'manual_review',
      16: 'twitter',
      32: 'discord',
      64: 'reddit'
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

    debug.log("Campaign eligibility check", {
      eligible,
      userFlags: userFlags.toString(2),
      requiredFlags: campaignVerificationRequirements.map(f => f.toString(2)),
      missingVerifications
    });

    return {
      eligible,
      userVerificationFlags: userFlags,
      requiredFlags: campaignVerificationRequirements,
      missingVerifications
    };
  }

  /**
   * Clean up resources
   */
  dispose() {
    // NostrStorageService doesn't have a close method
    // Cleanup handled automatically
  }
}

import { ccc } from "@ckb-ccc/core";
import { ckboost } from "ssri-ckboost";
import { 
  fetchUserByTypeId,
  fetchUserByLockHash,
  parseUserData,
  extractTypeIdFromUserCell
} from "../ckb/user-cells";

export class UserService {
  private signer: ccc.Signer;
  private userInstance: ckboost.User | null = null;
  private userTypeCodeHash: ccc.Hex;
  private userTypeCodeCell: ccc.OutPoint | null = null;

  constructor(signer: ccc.Signer, userTypeCodeHash: ccc.Hex) {
    this.signer = signer;
    this.userTypeCodeHash = userTypeCodeHash;
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
   * Submit a quest completion
   */
  async submitQuest(
    campaignTypeHash: ccc.Hex,
    questId: number,
    submissionContent: string, // URL to Neon storage
    userTypeId: ccc.Hex
  ): Promise<ccc.Hex> {
    if (!this.userTypeCodeCell) {
      throw new Error("User type code cell not initialized");
    }

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

    // Create new submission record - returns encoded bytes
    const newSubmissionBytes = ckboost.User.createSubmissionRecord(
      campaignTypeHash,
      questId,
      submissionContent
    );
    
    // Decode the bytes to get the submission record object
    const newSubmission = ckboost.types.UserSubmissionRecord.decode(newSubmissionBytes);

    // Add submission to user data
    const updatedSubmissions = [
      ...currentUserData.submission_records,
      newSubmission
    ];

    // Create updated user data
    const updatedUserData = {
      verification_data: currentUserData.verification_data,
      total_points_earned: currentUserData.total_points_earned,
      last_activity_timestamp: BigInt(Date.now()),
      submission_records: updatedSubmissions
    };

    // Create a new User instance with the correct script args
    // Note: We need to create a new instance since script is readonly
    const userInstanceWithScript = new ckboost.User(
      this.userTypeCodeCell!,
      ccc.Script.from({
        codeHash: this.userTypeCodeHash,
        hashType: "type",
        args: userCell.cellOutput.type?.args || ""
      })
    );

    // Build transaction using SSRI
    const result = await userInstanceWithScript.submitQuest(
      this.signer,
      updatedUserData
    );

    // Complete and send transaction
    await result.res.completeFeeChangeToOutput(this.signer, 0);
    const txHash = await this.signer.sendTransaction(result.res);

    return txHash;
  }

  /**
   * Get user submissions
   */
  async getUserSubmissions(userTypeId: ccc.Hex): Promise<ReturnType<typeof ckboost.types.UserSubmissionRecord.decode>[]> {
    const userCell = await fetchUserByTypeId(
      userTypeId,
      this.userTypeCodeHash,
      this.signer
    );

    if (!userCell) {
      return [];
    }

    const userData = parseUserData(userCell);
    if (!userData) {
      return [];
    }

    return userData.submission_records;
  }

  /**
   * Get complete user data
   */
  async getUserData(userTypeId: ccc.Hex): Promise<ReturnType<typeof ckboost.types.UserData.decode> | null> {
    const userCell = await fetchUserByTypeId(
      userTypeId,
      this.userTypeCodeHash,
      this.signer
    );

    if (!userCell) {
      return null;
    }

    return parseUserData(userCell);
  }

  /**
   * Get user by lock hash (fallback when type_id unknown)
   */
  async getUserByLockHash(lockHash: ccc.Hex): Promise<{
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
   * Check if user has submitted for a specific quest
   */
  async hasUserSubmittedQuest(
    userTypeId: ccc.Hex,
    campaignTypeHash: ccc.Hex,
    questId: number
  ): Promise<boolean> {
    const submissions = await this.getUserSubmissions(userTypeId);
    
    return submissions.some(
      submission => 
        submission.campaign_type_hash === campaignTypeHash &&
        submission.quest_id === questId
    );
  }
}
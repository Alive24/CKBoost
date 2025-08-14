import { ccc } from "@ckb-ccc/core";
import { ssri } from "@ckb-ccc/ssri";
import { 
  UserData, 
  type UserDataLike,
  UserSubmissionRecord
} from "../generated";

/**
 * Represents a CKBoost User contract for managing user operations.
 * 
 * This class provides methods for user verification, quest completion,
 * and reward claiming.
 * 
 * @public
 * @category User
 */
export class User extends ssri.Trait {
  public readonly script: ccc.Script;

  /**
   * Constructs a new User instance.
   * 
   * @param code - The script code cell of the User contract.
   * @param script - The type script of the User contract.
   * @param config - Optional configuration with executor.
   */
  constructor(
    code: ccc.OutPointLike,
    script: ccc.ScriptLike,
    config?: {
      executor?: ssri.Executor | null;
    } | null,
  ) {
    super(code, config?.executor);
    this.script = ccc.Script.from(script);
  }

  /**
   * Submit a quest completion
   * 
   * @param signer - The signer for the transaction
   * @param userData - The complete user data including new submission
   * @param tx - Optional existing transaction to build upon
   * @returns The updated transaction
   */
  async submitQuest(
    signer: ccc.Signer,
    userData: UserDataLike,
    tx?: ccc.Transaction
  ): Promise<ssri.ExecutorResponse<ccc.Transaction>> {
    if (!this.executor) {
      throw new Error("Executor required for SSRI operations");
    }

    let resTx;

    const txReq = ccc.Transaction.from(tx ?? {});
    // Ensure at least one input for the transaction
    if (txReq.inputs.length === 0) {
      await txReq.completeInputsAtLeastOne(signer);
      await txReq.completeInputsByCapacity(signer);
    }

    // Serialize user data
    const userDataBytes = UserData.encode(userData);
    const userDataHex = ccc.hexFrom(userDataBytes);
    const txHex = ccc.hexFrom(txReq.toBytes());

    console.log("Calling SSRI executor with:", {
      codeOutpoint: this.code,
      method: "CKBoostUser.submit_quest",
      scriptCodeHash: this.script.codeHash,
      scriptHashType: this.script.hashType,
      scriptArgs: this.script.args,
    });

    console.log("txHex", txHex);
    console.log("userDataHex", userDataHex);

    // Execute SSRI method
    try {
      const methodPath = "CKBoostUser.submit_quest";
      const res = await this.executor.runScript(
        this.code,
        methodPath,
        [txHex, userDataHex],
        { script: this.script }
      );

      // Parse the returned transaction
      if (res) {
        resTx = res.map((res) => ccc.Transaction.fromBytes(res));
        // Add the user code cell as a dependency
        resTx.res.addCellDeps({
          outPoint: this.code,
          depType: "code",
        });
      } else {
        throw new Error("No result from SSRI executor");
      }
    } catch (error) {
      console.error("SSRI execution error:", error);
      throw error;
    }

    return resTx!;
  }

  /**
   * Get user data from a cell
   * 
   * @param cell - The user cell to parse
   * @returns The parsed user data
   */
  static parseUserData(cell: ccc.Cell): ReturnType<typeof UserData.decode> {
    const rawData = cell.outputData;
    return UserData.decode(rawData);
  }

  /**
   * Create a new submission record
   * 
   * @param campaignTypeHash - The campaign type hash
   * @param questId - The quest ID
   * @param submissionContent - The submission content (URL to Neon storage)
   * @returns The submission record
   */
  static createSubmissionRecord(
    campaignTypeHash: ccc.HexLike,
    questId: number,
    submissionContent: string
  ): ReturnType<typeof UserSubmissionRecord.encode> {
    const timestamp = BigInt(Date.now());
    
    // mol.String expects the string directly, it handles the encoding internally
    return UserSubmissionRecord.encode({
      campaign_type_hash: ccc.hexFrom(campaignTypeHash),
      quest_id: questId,
      submission_timestamp: timestamp,
      submission_content: submissionContent
    });
  }
}
import { ccc } from "@ckb-ccc/core";
import { ssri } from "@ckb-ccc/ssri";

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

  // TODO: Implement user methods
  // - getVerificationData()
  // - getCompletedQuests()
  // - verify()
  // - completeQuest()
  // - claimRewards()
}
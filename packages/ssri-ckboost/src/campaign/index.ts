import { ccc } from "@ckb-ccc/core";
import { ssri } from "@ckb-ccc/ssri";

/**
 * Represents a CKBoost Campaign contract for managing campaign operations.
 * 
 * This class provides methods for managing campaigns including quests,
 * funding, and metadata updates.
 * 
 * @public
 * @category Campaign
 */
export class Campaign extends ssri.Trait {
  public readonly script: ccc.Script;

  /**
   * Constructs a new Campaign instance.
   * 
   * @param code - The script code cell of the Campaign contract.
   * @param script - The type script of the Campaign contract.
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

  // TODO: Implement campaign methods
  // - getMetadata()
  // - getQuests()
  // - getStatus()
  // - createQuest()
  // - updateMetadata()
  // - fund()
}
import { ccc } from "@ckb-ccc/core";
import { ssri } from "@ckb-ccc/ssri";
import { 
  CampaignData,
  QuestData,
  type CampaignDataLike,
  type QuestDataLike
} from "../generated";

/**
 * Represents a CKBoost Campaign contract for managing campaign operations.
 * 
 * This class provides methods for managing campaigns including creating,
 * updating, and managing quest completions.
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


  /**
   * Update a campaign with new data
   * 
   * @param _signer - The signer for the transaction
   * @param campaignData - The campaign data to update
   * @param tx - Optional existing transaction to build upon
   * @returns The updated transaction
   */
  async updateCampaign(
    _signer: ccc.Signer,
    campaignData: CampaignDataLike,
    tx?: ccc.Transaction
  ): Promise<{ res: ccc.Transaction }> {
    if (!this.executor) {
      throw new Error("Executor required for SSRI operations");
    }

    // Serialize campaign data
    const campaignDataBytes = CampaignData.encode(campaignData);

    // Prepare transaction or use existing
    const baseTx = tx || ccc.Transaction.from({
      version: 0,
      cellDeps: [],
      headerDeps: [],
      inputs: [],
      outputs: [],
      outputsData: [],
      witnesses: []
    });

    // Execute SSRI method
    const methodPath = "CKBoostCampaign.update_campaign";
    const result = await this.executor.runScript(
      this.code,
      methodPath,
      [
        ccc.hexFrom(baseTx.toBytes()),
        ccc.hexFrom(campaignDataBytes)
      ],
      { script: this.script }
    );

    // Parse the returned transaction - the result is a hex string that needs to be parsed
    const updatedTx = ccc.Transaction.from(JSON.parse(ccc.bytesFrom(result.res, "hex").toString()));
    return { res: updatedTx };
  }


  /**
   * Approve a quest completion
   * 
   * @param _signer - The signer for the transaction
   * @param campaignId - The campaign ID
   * @param questData - The quest completion data
   * @param tx - Optional existing transaction
   * @returns The updated transaction
   */
  async approveCompletion(
    _signer: ccc.Signer,
    campaignId: ccc.HexLike,
    questData: QuestDataLike,
    tx?: ccc.Transaction
  ): Promise<{ res: ccc.Transaction }> {
    if (!this.executor) {
      throw new Error("Executor required for SSRI operations");
    }

    // Prepare transaction or use existing
    const baseTx = tx || ccc.Transaction.from({
      version: 0,
      cellDeps: [],
      headerDeps: [],
      inputs: [],
      outputs: [],
      outputsData: [],
      witnesses: []
    });

    // Execute SSRI method
    const methodPath = "CKBoostCampaign.approve_completion";
    const result = await this.executor.runScript(
      this.code,
      methodPath,
      [
        ccc.hexFrom(baseTx.stringify()),
        ccc.hexFrom(campaignId),
        ccc.hexFrom(QuestData.encode(questData))
      ],
      { script: this.script }
    );

    // Parse the returned transaction - the result is a hex string that needs to be parsed
    const updatedTx = ccc.Transaction.from(JSON.parse(ccc.bytesFrom(result.res, "hex").toString()));
    return { res: updatedTx };
  }

  /**
   * Find a campaign cell by ID
   * 
   * @param client - The CKB client
   * @param campaignId - The campaign ID to find
   * @returns The campaign cell or null
   */
  async findCampaignCell(
    client: ccc.Client,
    campaignId: ccc.HexLike
  ): Promise<ccc.Cell | null> {
    // Search for cells with campaign type script
    const collector = client.findCells({
      script: {
        codeHash: this.script.codeHash,
        hashType: this.script.hashType,
        args: "0x" // We'll filter by campaign ID in the data
      },
      scriptType: "type",
      scriptSearchMode: "prefix"
    });

    // Look for the campaign with matching ID
    for await (const cell of collector) {
      try {
        // Parse campaign data to check ID
        const campaignData = CampaignData.decode(cell.outputData);
        
        if (ccc.hexFrom(campaignData.id) === ccc.hexFrom(campaignId)) {
          return cell;
        }
      } catch (error) {
        console.warn("Failed to parse campaign cell data:", error);
      }
    }

    return null;
  }

  /**
   * Get all campaigns
   * 
   * @param client - The CKB client
   * @param limit - Maximum number of campaigns to return
   * @returns Array of campaign cells
   */
  async getAllCampaigns(
    client: ccc.Client,
    limit: number = 100
  ): Promise<ccc.Cell[]> {
    const campaigns: ccc.Cell[] = [];

    // Search for all cells with campaign type script
    const collector = client.findCells({
      script: {
        codeHash: this.script.codeHash,
        hashType: this.script.hashType,
        args: "0x"
      },
      scriptType: "type",
      scriptSearchMode: "prefix"
    });

    let count = 0;
    for await (const cell of collector) {
      campaigns.push(cell);
      count++;
      if (count >= limit) break;
    }

    return campaigns;
  }

  /**
   * Get campaigns by endorser
   * 
   * @param client - The CKB client
   * @param endorserLockHash - Endorser's lock hash
   * @param limit - Maximum number of campaigns
   * @returns Array of campaign cells
   */
  async getCampaignsByEndorser(
    client: ccc.Client,
    endorserLockHash: ccc.HexLike,
    limit: number = 100
  ): Promise<ccc.Cell[]> {
    const allCampaigns = await this.getAllCampaigns(client, limit * 2);
    const endorserCampaigns: ccc.Cell[] = [];
    const targetEndorserHash = ccc.hexFrom(endorserLockHash);

    for (const cell of allCampaigns) {
      try {
        const campaignData = CampaignData.decode(cell.outputData);
        if (ccc.hexFrom(campaignData.endorser_info.endorser_lock_hash) === targetEndorserHash) {
          endorserCampaigns.push(cell);
        }
      } catch (error) {
        console.warn("Failed to parse campaign data:", error);
      }

      if (endorserCampaigns.length >= limit) break;
    }

    return endorserCampaigns;
  }
}
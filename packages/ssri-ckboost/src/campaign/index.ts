import { ccc } from "@ckb-ccc/core";
import { ssri } from "@ckb-ccc/ssri";
import { 
  CampaignData,
  QuestData,
  ConnectedTypeID,
  type CampaignDataLike,
  type QuestDataLike,
  type ConnectedTypeIDLike
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
   * Helper to ensure all required fields are present for encoding
   */
  private static ensureCampaignData(data: CampaignDataLike): Parameters<typeof CampaignData.encode>[0] {
    return {
      id: data.id || "0x" + "0".repeat(64),
      creator: data.creator || { codeHash: "0x", hashType: "type", args: "0x" },
      metadata: {
        funding_info: (data.metadata?.funding_info || []).map(funding => ({
          ckb_amount: funding.ckb_amount || 0n,
          nft_assets: funding.nft_assets || [],
          udt_assets: (funding.udt_assets || []).map(udt => ({
            udt_script: udt.udt_script || { codeHash: "0x", hashType: "type", args: "0x" },
            amount: udt.amount || 0n
          }))
        })),
        created_at: data.metadata?.created_at || 0n,
        starting_time: data.metadata?.starting_time || 0n,
        ending_time: data.metadata?.ending_time || 0n,
        verification_requirements: data.metadata?.verification_requirements || 0,
        last_updated: data.metadata?.last_updated || 0n,
        categories: data.metadata?.categories || [],
        difficulty: data.metadata?.difficulty || 0,
        image_cid: data.metadata?.image_cid || "0x",
        rules: data.metadata?.rules || []
      },
      status: data.status || 0,
      quests: (data.quests || []).map(quest => ({
        id: quest.id || "0x" + "0".repeat(64),
        campaign_id: quest.campaign_id || "0x" + "0".repeat(64),
        title: quest.title || "0x",
        description: quest.description || "0x",
        requirements: quest.requirements || "0x",
        rewards_on_completion: (quest.rewards_on_completion || []).map(asset => ({
          ckb_amount: asset.ckb_amount || 0n,
          nft_assets: asset.nft_assets || [],
          udt_assets: (asset.udt_assets || []).map(udt => ({
            udt_script: udt.udt_script || { codeHash: "0x", hashType: "type", args: "0x" },
            amount: udt.amount || 0n
          }))
        })),
        completion_records: (quest.completion_records || []).map(record => ({
          user_address: record.user_address || "0x",
          sub_task_id: record.sub_task_id || 0,
          completion_timestamp: record.completion_timestamp || 0n,
          completion_content: record.completion_content || "0x"
        })),
        completion_deadline: quest.completion_deadline || 0n,
        status: quest.status || 0,
        sub_tasks: (quest.sub_tasks || []).map(task => ({
          id: task.id || 0,
          title: task.title || "0x",
          type: task.type || "0x",
          description: task.description || "0x",
          proof_required: task.proof_required || "0x"
        })),
        points: quest.points || 0,
        difficulty: quest.difficulty || 0,
        time_estimate: quest.time_estimate || 0,
        completion_count: quest.completion_count || 0
      })),
      title: data.title || "0x",
      short_description: data.short_description || "0x",
      long_description: data.long_description || "0x",
      endorser_info: {
        endorser_lock_hash: data.endorser_info?.endorser_lock_hash || "0x" + "0".repeat(64),
        endorser_name: data.endorser_info?.endorser_name || "0x",
        endorser_description: data.endorser_info?.endorser_description || "0x",
        website: data.endorser_info?.website || "0x",
        social_links: data.endorser_info?.social_links || [],
        verified: data.endorser_info?.verified || 0
      },
      participants_count: data.participants_count || 0,
      total_completions: data.total_completions || 0
    };
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
    const completeData = Campaign.ensureCampaignData(campaignData);
    const campaignDataBytes = CampaignData.encode(completeData);

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
        ccc.hexFrom(baseTx.stringify()),
        ccc.hexFrom(campaignDataBytes)
      ],
      { script: this.script }
    );

    // Parse the returned transaction - the result is a hex string that needs to be parsed
    const updatedTx = ccc.Transaction.from(JSON.parse(ccc.bytesFrom(result.res, "hex").toString()));
    return { res: updatedTx };
  }

  /**
   * Create a new campaign
   * 
   * @param signer - The signer for the transaction
   * @param campaignData - The campaign data to create
   * @param protocolTypeHash - The protocol type hash to reference
   * @returns The transaction and campaign ID
   */
  async createCampaign(
    signer: ccc.Signer,
    campaignData: CampaignDataLike,
    protocolTypeHash: ccc.HexLike
  ): Promise<{ res: ccc.Transaction; campaignId: ccc.Hex }> {
    // Get user's recommended address for the lock
    const userLock = (await signer.getRecommendedAddressObj()).script;

    // Generate campaign ID (hash of initial data)
    const campaignId = ccc.hashCkb(CampaignData.encode(campaignData));

    // Create a new transaction
    const tx = ccc.Transaction.from({
      version: 0,
      cellDeps: [],
      headerDeps: [],
      inputs: [],
      outputs: [],
      outputsData: [],
      witnesses: []
    });

    // Complete inputs with at least one input for type ID calculation
    await tx.completeInputsAtLeastOne(signer);

    // Calculate type ID based on first input and output index
    const firstInput = tx.inputs[0];
    const outputIndex = 0; // Campaign cell will be the first output

    // Calculate type ID
    const typeIdHasher = new ccc.HasherCkb();
    typeIdHasher.update(firstInput.previousOutput.toBytes());
    typeIdHasher.update(ccc.numLeToBytes(outputIndex, 8));
    const typeId = typeIdHasher.digest();

    // Create ConnectedTypeID with protocol reference and type ID
    const connectedTypeId: ConnectedTypeIDLike = {
      type_id: typeId,
      connected_type_hash: protocolTypeHash
    };

    // Create the campaign type script with ConnectedTypeID as args
    const campaignTypeScript = ccc.Script.from({
      codeHash: this.script.codeHash,
      hashType: this.script.hashType,
      args: ccc.hexFrom(ConnectedTypeID.encode(connectedTypeId))
    });

    // Create campaign cell output
    const campaignOutput = {
      lock: userLock,
      type: campaignTypeScript,
      capacity: 0n // Will be calculated later
    };

    // Add output
    tx.addOutput(
      campaignOutput,
      CampaignData.encode(campaignData)
    );

    // Add cell dep for campaign type script
    tx.addCellDeps({
      outPoint: this.code,
      depType: "code"
    });

    // Call updateCampaign to finalize with SSRI
    const { res } = await this.updateCampaign(signer, campaignData, tx);

    return { res, campaignId };
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
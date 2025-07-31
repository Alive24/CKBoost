import { ccc } from "@ckb-ccc/core";
import { ssri } from "@ckb-ccc/ssri";
import { 
  ProtocolData,
  ProtocolConfig,
  TippingConfig,
  EndorserInfo,
  CampaignDataVec,
  type ProtocolDataLike,
  type ProtocolConfigLike,
  type TippingConfigLike,
  type EndorserInfoLike,
  type CampaignDataLike,
} from "../types";

/**
 * Represents the CKBoost Protocol contract for managing protocol operations.
 * 
 * This class provides methods for updating protocol data including campaigns,
 * tipping proposals, and endorsers whitelist.
 * 
 * @public
 * @category Protocol
 */
export class Protocol extends ssri.Trait {
  public readonly script: ccc.Script;

  /**
   * Constructs a new Protocol instance.
   * 
   * @param code - The script code cell of the Protocol contract.
   * @param script - The type script of the Protocol contract.
   * @param config - Optional configuration with executor.
   * @example
   * ```typescript
   * const protocol = new Protocol(
   *   { txHash: "0x...", index: 0 },
   *   { codeHash: "0x...", hashType: "type", args: "0x..." }
   * );
   * ```
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
   * Creates a properly typed ProtocolData object from a plain object.
   * 
   * @param data - Plain object with user-friendly property names
   * @returns ProtocolData object ready for encoding
   */
  static createProtocolData(data: ProtocolDataLike): Parameters<typeof ProtocolData.encode>[0] {
    // Build the protocol data with defaults for all required fields
    const protocolData: Parameters<typeof ProtocolData.encode>[0] = {
      campaigns_approved: (data.campaigns_approved || []).map(campaign => ({
        id: campaign.id || "0x" + "0".repeat(64),
        creator: campaign.creator || { codeHash: "0x", hashType: "type", args: "0x" },
        metadata: {
          funding_info: (campaign.metadata?.funding_info || []).map(funding => ({
            ckb_amount: funding.ckb_amount || 0n,
            nft_assets: funding.nft_assets || [],
            udt_assets: (funding.udt_assets || []).map(udt => ({
              udt_script: udt.udt_script || { codeHash: "0x", hashType: "type", args: "0x" },
              amount: udt.amount || 0n
            }))
          })),
          created_at: campaign.metadata?.created_at || 0n,
          starting_time: campaign.metadata?.starting_time || 0n,
          ending_time: campaign.metadata?.ending_time || 0n,
          verification_requirements: campaign.metadata?.verification_requirements || 0,
          last_updated: campaign.metadata?.last_updated || 0n,
          categories: campaign.metadata?.categories || [],
          difficulty: campaign.metadata?.difficulty || 0,
          image_cid: campaign.metadata?.image_cid || "0x",
          rules: campaign.metadata?.rules || []
        },
        status: campaign.status || 0,
        quests: (campaign.quests || []).map(quest => ({
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
        title: campaign.title || "0x",
        short_description: campaign.short_description || "0x",
        long_description: campaign.long_description || "0x",
        endorser_info: {
          endorser_lock_hash: campaign.endorser_info?.endorser_lock_hash || "0x" + "0".repeat(64),
          endorser_name: campaign.endorser_info?.endorser_name || "0x",
          endorser_description: campaign.endorser_info?.endorser_description || "0x",
          website: campaign.endorser_info?.website || "0x",
          social_links: campaign.endorser_info?.social_links || [],
          verified: campaign.endorser_info?.verified || 0
        },
        participants_count: campaign.participants_count || 0,
        total_completions: campaign.total_completions || 0
      })),
      
      tipping_proposals: (data.tipping_proposals || []).map(proposal => ({
        target_address: proposal.target_address || "0x",
        proposer_lock_hash: proposal.proposer_lock_hash || "0x" + "0".repeat(64),
        metadata: {
          contribution_title: proposal.metadata?.contribution_title || "0x",
          contribution_type_tags: proposal.metadata?.contribution_type_tags || [],
          description: proposal.metadata?.description || "0x",
          proposal_creation_timestamp: proposal.metadata?.proposal_creation_timestamp || 0n
        },
        amount: proposal.amount || 0n,
        tipping_transaction_hash: proposal.tipping_transaction_hash,
        approval_transaction_hash: proposal.approval_transaction_hash || []
      })),
      
      tipping_config: {
        approval_requirement_thresholds: data.tipping_config?.approval_requirement_thresholds || [],
        expiration_duration: data.tipping_config?.expiration_duration || 0n
      },
      
      endorsers_whitelist: (data.endorsers_whitelist || []).map(endorser => ({
        endorser_lock_hash: endorser.endorser_lock_hash || "0x" + "0".repeat(64),
        endorser_name: endorser.endorser_name || "0x",
        endorser_description: endorser.endorser_description || "0x",
        website: endorser.website || "0x",
        social_links: endorser.social_links || [],
        verified: endorser.verified || 0
      })),
      
      last_updated: data.last_updated || BigInt(Date.now()),
      
      protocol_config: {
        admin_lock_hash_vec: data.protocol_config?.admin_lock_hash_vec || [],
        script_code_hashes: {
          ckb_boost_protocol_type_code_hash: data.protocol_config?.script_code_hashes?.ckb_boost_protocol_type_code_hash || "0x" + "0".repeat(64),
          ckb_boost_protocol_lock_code_hash: data.protocol_config?.script_code_hashes?.ckb_boost_protocol_lock_code_hash || "0x" + "0".repeat(64),
          ckb_boost_campaign_type_code_hash: data.protocol_config?.script_code_hashes?.ckb_boost_campaign_type_code_hash || "0x" + "0".repeat(64),
          ckb_boost_campaign_lock_code_hash: data.protocol_config?.script_code_hashes?.ckb_boost_campaign_lock_code_hash || "0x" + "0".repeat(64),
          ckb_boost_user_type_code_hash: data.protocol_config?.script_code_hashes?.ckb_boost_user_type_code_hash || "0x" + "0".repeat(64),
          accepted_udt_type_code_hashes: data.protocol_config?.script_code_hashes?.accepted_udt_type_code_hashes || [],
          accepted_dob_type_code_hashes: data.protocol_config?.script_code_hashes?.accepted_dob_type_code_hashes || []
        }
      }
    };
    
    return protocolData;
  }


  /**
   * Updates the protocol data on-chain.
   * 
   * @param signer - The signer to authorize the transaction.
   * @param protocolData - The new protocol data to update (ProtocolDataType object).
   * @param tx - Optional existing transaction to build upon.
   * @returns The transaction containing the protocol update.
   * @tag Mutation - This method represents a mutation of the onchain state.
   * @example
   * ```typescript
   * // Using the helper method
   * const protocolData = Protocol.createProtocolData({
   *   tippingConfig: {
   *     approval_requirement_thresholds: [threshold1, threshold2],
   *     expiration_duration: expirationBuffer
   *   },
   *   protocolConfig: {
   *     admin_lock_hash_vec: [adminHash1, adminHash2],
   *     script_code_hashes: { ... }
   *   }
   * });
   * 
   * const { res: tx } = await protocol.updateProtocol(
   *   signer,
   *   protocolData
   * );
   * 
   * await tx.completeFeeBy(signer);
   * const txHash = await signer.sendTransaction(tx);
   * ```
   */
  async updateProtocol(
    signer: ccc.Signer,
    protocolData: ProtocolDataLike,
    tx?: ccc.TransactionLike | null,
  ): Promise<ssri.ExecutorResponse<ccc.Transaction>> {
    
    let resTx;
    
    if (this.executor) {
      const txReq = ccc.Transaction.from(tx ?? {});
      // Ensure at least one input for the transaction
      if (txReq.inputs.length === 0) {
        await txReq.completeInputsAtLeastOne(signer);
        await txReq.completeInputsByCapacity(signer);
      }

      // Convert protocolData to bytes
      // First ensure all required fields are present
      const completeProtocolData = Protocol.createProtocolData(protocolData);
      // The createProtocolData returns a decoded object, we need to encode it for the bytes
      const protocolDataBytes = ProtocolData.encode(completeProtocolData);

      // Convert to hex strings as expected by the contract
      const txHex = ccc.hexFrom(txReq.toBytes());
      const protocolDataHex = ccc.hexFrom(protocolDataBytes);

      console.log('Calling SSRI executor with:', {
        codeOutpoint: this.code,
        method: "CKBoostProtocol.update_protocol",
        scriptCodeHash: this.script.codeHash,
        scriptHashType: this.script.hashType,
        scriptArgs: this.script.args,
      });

      console.log('txHex', txHex);
      console.log('protocolDataHex', protocolDataHex);
      
      try {
        const res = await this.executor.runScriptTry(
          this.code,
          "CKBoostProtocol.update_protocol",
          [
            txHex,
            protocolDataHex,
          ],
          {
            script: this.script,
          },
        );
        
        if (res) {
          resTx = res.map((res) => ccc.Transaction.fromBytes(res));
        }
      } catch (error) {
        console.error('SSRI executor error:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        throw error;
      }
    }

    if (!resTx) {
      // Fallback implementation if no executor
      // Just returns the transaction as-is since we can't build it client-side
      // The actual cell update logic is in the contract
      const fallbackTx = ccc.Transaction.from(tx ?? {});
      resTx = ssri.ExecutorResponse.new(fallbackTx);
    }

    // Add the protocol code cell as a dependency
    resTx.res.addCellDeps({
      outPoint: this.code,
      depType: "code",
    });
    
    return resTx;
  }

  /**
   * Helper to create a TippingConfig with proper type conversions
   */
  static createTippingConfig(config: TippingConfigLike): Parameters<typeof TippingConfig.encode>[0] {
    // The new types expect bigint for numeric values
    return {
      approval_requirement_thresholds: config.approval_requirement_thresholds?.map(threshold => {
        // Convert NumLike to bigint
        if (typeof threshold === 'bigint') return threshold;
        if (typeof threshold === 'number') return BigInt(threshold);
        if (typeof threshold === 'string') return BigInt(threshold);
        // For other types, try to convert to string first
        return BigInt(threshold.toString());
      }) || [],
      expiration_duration: config.expiration_duration || 0n
    };
  }

  /**
   * Helper to create a ProtocolConfig with proper type conversions
   */
  static createProtocolConfig(config: ProtocolConfigLike): Parameters<typeof ProtocolConfig.encode>[0] {
    // The new types expect ccc.Hex for Byte32 values
    return {
      admin_lock_hash_vec: config.admin_lock_hash_vec || [],
      script_code_hashes: {
        ckb_boost_protocol_type_code_hash: config.script_code_hashes?.ckb_boost_protocol_type_code_hash || "0x" + "0".repeat(64),
        ckb_boost_protocol_lock_code_hash: config.script_code_hashes?.ckb_boost_protocol_lock_code_hash || "0x" + "0".repeat(64),
        ckb_boost_campaign_type_code_hash: config.script_code_hashes?.ckb_boost_campaign_type_code_hash || "0x" + "0".repeat(64),
        ckb_boost_campaign_lock_code_hash: config.script_code_hashes?.ckb_boost_campaign_lock_code_hash || "0x" + "0".repeat(64),
        ckb_boost_user_type_code_hash: config.script_code_hashes?.ckb_boost_user_type_code_hash || "0x" + "0".repeat(64),
        accepted_udt_type_code_hashes: config.script_code_hashes?.accepted_udt_type_code_hashes || [],
        accepted_dob_type_code_hashes: config.script_code_hashes?.accepted_dob_type_code_hashes || []
      }
    };
  }

  /**
   * Helper to create an EndorserInfo with proper type conversions
   */
  static createEndorserInfo(endorser: EndorserInfoLike): Parameters<typeof EndorserInfo.encode>[0] {
    // The new types expect ccc.Hex for Byte32 and Bytes values
    // For string fields (name, description), we need to convert to hex
    const nameHex = endorser.endorser_name ? ccc.hexFrom(ccc.bytesFrom(endorser.endorser_name.toString(), "utf8")) : "0x";
    const descHex = endorser.endorser_description ? ccc.hexFrom(ccc.bytesFrom(endorser.endorser_description.toString(), "utf8")) : "0x";
    const websiteHex = endorser.website ? ccc.hexFrom(ccc.bytesFrom(endorser.website.toString(), "utf8")) : "0x";
    const socialLinksHex = endorser.social_links?.map((link: ccc.BytesLike) => 
      ccc.hexFrom(ccc.bytesFrom(link.toString(), "utf8"))
    ) || [];

    return {
      endorser_lock_hash: endorser.endorser_lock_hash || "0x" + "0".repeat(64),
      endorser_name: nameHex,
      endorser_description: descHex,
      website: websiteHex,
      social_links: socialLinksHex,
      verified: endorser.verified || 0
    };
  }

  // TODO: Add more methods as needed
  // - getCampaigns()
  // - getTippingProposals()
  // - getEndorsers()
  // - approveCampaign()
  // - createTippingProposal()
  // - voteTippingProposal()
}
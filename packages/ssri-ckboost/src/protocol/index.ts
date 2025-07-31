import { ccc } from "@ckb-ccc/core";
import { ssri } from "@ckb-ccc/ssri";
import { 
  ProtocolData,
  ProtocolConfig,
  TippingConfig,
  EndorserInfo,
  type ProtocolDataLike,
  type ProtocolConfigLike,
  type TippingConfigLike,
  type EndorserInfoLike,
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
   * @param data - Plain object with all required fields
   * @returns ProtocolData object with the same structure as ProtocolData.decode()
   */
  static createProtocolData(data: ProtocolDataLike): ReturnType<typeof ProtocolData.decode> {
    // Since all fields are required in Like types, we can directly transform the data
    // This returns the same structure as ProtocolData.decode() would
    return {
      campaigns_approved: data.campaigns_approved.map(campaign => ({
        id: ccc.hexFrom(campaign.id),
        creator: ccc.Script.from(campaign.creator),
        metadata: {
          funding_info: campaign.metadata.funding_info.map(funding => ({
            ckb_amount: ccc.numFrom(funding.ckb_amount),
            nft_assets: funding.nft_assets.map(script => ccc.Script.from(script)),
            udt_assets: funding.udt_assets.map(udt => ({
              udt_script: ccc.Script.from(udt.udt_script),
              amount: ccc.numFrom(udt.amount)
            }))
          })),
          created_at: ccc.numFrom(campaign.metadata.created_at),
          starting_time: ccc.numFrom(campaign.metadata.starting_time),
          ending_time: ccc.numFrom(campaign.metadata.ending_time),
          verification_requirements: Number(ccc.numFrom(campaign.metadata.verification_requirements)),
          last_updated: ccc.numFrom(campaign.metadata.last_updated),
          categories: campaign.metadata.categories.map(cat => ccc.hexFrom(cat)),
          difficulty: Number(ccc.numFrom(campaign.metadata.difficulty)),
          image_cid: ccc.hexFrom(campaign.metadata.image_cid),
          rules: campaign.metadata.rules.map(rule => ccc.hexFrom(rule))
        },
        status: Number(ccc.numFrom(campaign.status)),
        quests: campaign.quests.map(quest => ({
          id: ccc.hexFrom(quest.id),
          campaign_id: ccc.hexFrom(quest.campaign_id),
          title: ccc.hexFrom(quest.title),
          description: ccc.hexFrom(quest.description),
          requirements: ccc.hexFrom(quest.requirements),
          rewards_on_completion: quest.rewards_on_completion.map(asset => ({
            ckb_amount: ccc.numFrom(asset.ckb_amount),
            nft_assets: asset.nft_assets.map(script => ccc.Script.from(script)),
            udt_assets: asset.udt_assets.map(udt => ({
              udt_script: ccc.Script.from(udt.udt_script),
              amount: ccc.numFrom(udt.amount)
            }))
          })),
          completion_records: quest.completion_records.map(record => ({
            user_address: ccc.hexFrom(record.user_address),
            sub_task_id: Number(ccc.numFrom(record.sub_task_id)),
            completion_timestamp: ccc.numFrom(record.completion_timestamp),
            completion_content: ccc.hexFrom(record.completion_content)
          })),
          completion_deadline: ccc.numFrom(quest.completion_deadline),
          status: Number(ccc.numFrom(quest.status)),
          sub_tasks: quest.sub_tasks.map(task => ({
            id: Number(ccc.numFrom(task.id)),
            title: ccc.hexFrom(task.title),
            type: ccc.hexFrom(task.type),
            description: ccc.hexFrom(task.description),
            proof_required: ccc.hexFrom(task.proof_required)
          })),
          points: Number(ccc.numFrom(quest.points)),
          difficulty: Number(ccc.numFrom(quest.difficulty)),
          time_estimate: Number(ccc.numFrom(quest.time_estimate)),
          completion_count: Number(ccc.numFrom(quest.completion_count))
        })),
        title: ccc.hexFrom(campaign.title),
        short_description: ccc.hexFrom(campaign.short_description),
        long_description: ccc.hexFrom(campaign.long_description),
        endorser_info: {
          endorser_lock_hash: ccc.hexFrom(campaign.endorser_info.endorser_lock_hash),
          endorser_name: ccc.hexFrom(campaign.endorser_info.endorser_name),
          endorser_description: ccc.hexFrom(campaign.endorser_info.endorser_description),
          website: ccc.hexFrom(campaign.endorser_info.website),
          social_links: campaign.endorser_info.social_links.map(link => ccc.hexFrom(link)),
          verified: Number(ccc.numFrom(campaign.endorser_info.verified))
        },
        participants_count: Number(ccc.numFrom(campaign.participants_count)),
        total_completions: Number(ccc.numFrom(campaign.total_completions))
      })),
      
      tipping_proposals: data.tipping_proposals.map(proposal => ({
        target_address: ccc.hexFrom(proposal.target_address),
        proposer_lock_hash: ccc.hexFrom(proposal.proposer_lock_hash),
        metadata: {
          contribution_title: ccc.hexFrom(proposal.metadata.contribution_title),
          contribution_type_tags: proposal.metadata.contribution_type_tags.map(tag => ccc.hexFrom(tag)),
          description: ccc.hexFrom(proposal.metadata.description),
          proposal_creation_timestamp: ccc.numFrom(proposal.metadata.proposal_creation_timestamp)
        },
        amount: ccc.numFrom(proposal.amount),
        tipping_transaction_hash: proposal.tipping_transaction_hash === null ? undefined : proposal.tipping_transaction_hash ? ccc.hexFrom(proposal.tipping_transaction_hash) : undefined,
        approval_transaction_hash: proposal.approval_transaction_hash.map(hash => ccc.hexFrom(hash))
      })),
      
      tipping_config: {
        approval_requirement_thresholds: data.tipping_config.approval_requirement_thresholds.map(threshold => ccc.numFrom(threshold)),
        expiration_duration: ccc.numFrom(data.tipping_config.expiration_duration)
      },
      
      endorsers_whitelist: data.endorsers_whitelist.map(endorser => ({
        endorser_lock_hash: ccc.hexFrom(endorser.endorser_lock_hash),
        endorser_name: ccc.hexFrom(endorser.endorser_name),
        endorser_description: ccc.hexFrom(endorser.endorser_description),
        website: ccc.hexFrom(endorser.website),
        social_links: endorser.social_links.map(link => ccc.hexFrom(link)),
        verified: Number(ccc.numFrom(endorser.verified))
      })),
      
      last_updated: ccc.numFrom(data.last_updated),
      
      protocol_config: {
        admin_lock_hash_vec: data.protocol_config.admin_lock_hash_vec.map(hash => ccc.hexFrom(hash)),
        script_code_hashes: {
          ckb_boost_protocol_type_code_hash: ccc.hexFrom(data.protocol_config.script_code_hashes.ckb_boost_protocol_type_code_hash),
          ckb_boost_protocol_lock_code_hash: ccc.hexFrom(data.protocol_config.script_code_hashes.ckb_boost_protocol_lock_code_hash),
          ckb_boost_campaign_type_code_hash: ccc.hexFrom(data.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash),
          ckb_boost_campaign_lock_code_hash: ccc.hexFrom(data.protocol_config.script_code_hashes.ckb_boost_campaign_lock_code_hash),
          ckb_boost_user_type_code_hash: ccc.hexFrom(data.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash),
          accepted_udt_type_code_hashes: data.protocol_config.script_code_hashes.accepted_udt_type_code_hashes.map(hash => ccc.hexFrom(hash)),
          accepted_dob_type_code_hashes: data.protocol_config.script_code_hashes.accepted_dob_type_code_hashes.map(hash => ccc.hexFrom(hash))
        }
      }
    } as ReturnType<typeof ProtocolData.decode>;
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
      // Encode the protocol data
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
  static createTippingConfig(config: TippingConfigLike): ReturnType<typeof TippingConfig.decode> {
    // Simple and clean conversion now that all fields are required
    return {
      approval_requirement_thresholds: config.approval_requirement_thresholds.map(threshold => ccc.numFrom(threshold)),
      expiration_duration: ccc.numFrom(config.expiration_duration)
    };
  }

  /**
   * Helper to create a ProtocolConfig with proper type conversions
   */
  static createProtocolConfig(config: ProtocolConfigLike): ReturnType<typeof ProtocolConfig.decode> {
    // Return object with the same structure as ProtocolConfig.decode()
    return {
      admin_lock_hash_vec: (config.admin_lock_hash_vec || []).map(hash => ccc.hexFrom(hash)),
      script_code_hashes: {
        ckb_boost_protocol_type_code_hash: config.script_code_hashes?.ckb_boost_protocol_type_code_hash ? ccc.hexFrom(config.script_code_hashes.ckb_boost_protocol_type_code_hash) : ccc.hexFrom("0x" + "0".repeat(64)),
        ckb_boost_protocol_lock_code_hash: config.script_code_hashes?.ckb_boost_protocol_lock_code_hash ? ccc.hexFrom(config.script_code_hashes.ckb_boost_protocol_lock_code_hash) : ccc.hexFrom("0x" + "0".repeat(64)),
        ckb_boost_campaign_type_code_hash: config.script_code_hashes?.ckb_boost_campaign_type_code_hash ? ccc.hexFrom(config.script_code_hashes.ckb_boost_campaign_type_code_hash) : ccc.hexFrom("0x" + "0".repeat(64)),
        ckb_boost_campaign_lock_code_hash: config.script_code_hashes?.ckb_boost_campaign_lock_code_hash ? ccc.hexFrom(config.script_code_hashes.ckb_boost_campaign_lock_code_hash) : ccc.hexFrom("0x" + "0".repeat(64)),
        ckb_boost_user_type_code_hash: config.script_code_hashes?.ckb_boost_user_type_code_hash ? ccc.hexFrom(config.script_code_hashes.ckb_boost_user_type_code_hash) : ccc.hexFrom("0x" + "0".repeat(64)),
        accepted_udt_type_code_hashes: (config.script_code_hashes?.accepted_udt_type_code_hashes || []).map(hash => ccc.hexFrom(hash)),
        accepted_dob_type_code_hashes: (config.script_code_hashes?.accepted_dob_type_code_hashes || []).map(hash => ccc.hexFrom(hash))
      }
    };
  }

  /**
   * Helper to create an EndorserInfo with proper type conversions
   */
  static createEndorserInfo(endorser: EndorserInfoLike): ReturnType<typeof EndorserInfo.decode> {
    // For string fields (name, description), we need to convert to hex
    const nameHex = endorser.endorser_name ? ccc.hexFrom(ccc.bytesFrom(endorser.endorser_name.toString(), "utf8")) : "0x";
    const descHex = endorser.endorser_description ? ccc.hexFrom(ccc.bytesFrom(endorser.endorser_description.toString(), "utf8")) : "0x";
    const websiteHex = endorser.website ? ccc.hexFrom(ccc.bytesFrom(endorser.website.toString(), "utf8")) : "0x";
    const socialLinksHex = endorser.social_links?.map((link: ccc.BytesLike) => 
      ccc.hexFrom(ccc.bytesFrom(link.toString(), "utf8"))
    ) || [];

    // Return object with the same structure as EndorserInfo.decode()
    return {
      endorser_lock_hash: endorser.endorser_lock_hash ? ccc.hexFrom(endorser.endorser_lock_hash) : ccc.hexFrom("0x" + "0".repeat(64)),
      endorser_name: nameHex,
      endorser_description: descHex,
      website: websiteHex,
      social_links: socialLinksHex,
      verified: endorser.verified !== undefined ? Number(ccc.numFrom(endorser.verified)) : 0
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
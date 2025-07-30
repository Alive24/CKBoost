import { ccc } from "@ckb-ccc/core";
import { ssri } from "@ckb-ccc/ssri";
import { SerializeProtocolData } from "../generated";
import type { 
  ProtocolDataType,
  ProtocolConfigType,
  TippingConfigType,
  EndorserInfoType,
  ProtocolDataInput,
  TippingConfigInput,
  ProtocolConfigInput,
  EndorserInfoInput
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
   * @returns ProtocolDataType object ready for serialization
   */
  static createProtocolData(data: ProtocolDataInput): ProtocolDataType {
    // The new types expect bigint for Uint64
    const protocolDataType: ProtocolDataType = {
      campaigns_approved: data.campaignsApproved || [],
      tipping_proposals: data.tippingProposals || [],
      tipping_config: Protocol.createTippingConfig(data.tippingConfig),
      endorsers_whitelist: (data.endorsersWhitelist || []).map(e => 
        Protocol.createEndorserInfo(e)
      ),
      last_updated: data.lastUpdated || BigInt(Date.now()),
      protocol_config: Protocol.createProtocolConfig(data.protocolConfig)
    };
    
    return protocolDataType;
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
    protocolData: ProtocolDataType,
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
      const protocolDataBytes = SerializeProtocolData(protocolData);

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
  static createTippingConfig(config: TippingConfigInput): TippingConfigType {
    // The new types expect bigint for numeric values
    return {
      approval_requirement_thresholds: config.approvalRequirementThresholds.map(threshold => 
        BigInt(threshold)
      ),
      expiration_duration: config.expirationDuration
    };
  }

  /**
   * Helper to create a ProtocolConfig with proper type conversions
   */
  static createProtocolConfig(config: ProtocolConfigInput): ProtocolConfigType {
    // The new types expect ccc.Hex for Byte32 values
    return {
      admin_lock_hash_vec: config.adminLockHashes,
      script_code_hashes: {
        ckb_boost_protocol_type_code_hash: config.scriptCodeHashes.ckbBoostProtocolTypeCodeHash,
        ckb_boost_protocol_lock_code_hash: config.scriptCodeHashes.ckbBoostProtocolLockCodeHash,
        ckb_boost_campaign_type_code_hash: config.scriptCodeHashes.ckbBoostCampaignTypeCodeHash,
        ckb_boost_campaign_lock_code_hash: config.scriptCodeHashes.ckbBoostCampaignLockCodeHash,
        ckb_boost_user_type_code_hash: config.scriptCodeHashes.ckbBoostUserTypeCodeHash,
        accepted_udt_type_code_hashes: config.scriptCodeHashes.acceptedUdtTypeCodeHashes || [],
        accepted_dob_type_code_hashes: config.scriptCodeHashes.acceptedDobTypeCodeHashes || [],
      }
    };
  }

  /**
   * Helper to create an EndorserInfo with proper type conversions
   */
  static createEndorserInfo(endorser: EndorserInfoInput): EndorserInfoType {
    // The new types expect ccc.Hex for Byte32 and Bytes values
    // For string fields (name, description), we need to convert to hex
    const nameHex = ccc.hexFrom(ccc.bytesFrom(endorser.name, "utf8"));
    const descHex = ccc.hexFrom(ccc.bytesFrom(endorser.description, "utf8"));
    const websiteHex = ccc.hexFrom(ccc.bytesFrom(endorser.website || "", "utf8"));
    const socialLinksHex = (endorser.socialLinks || []).map(link => 
      ccc.hexFrom(ccc.bytesFrom(link, "utf8"))
    );

    return {
      endorser_lock_hash: endorser.lockHash,
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
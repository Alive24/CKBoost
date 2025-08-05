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
    } | null
  ) {
    super(code, config?.executor);
    this.script = ccc.Script.from(script);
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
    tx?: ccc.TransactionLike | null
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

    // Convert protocolData to bytes
    const protocolDataBytes = ProtocolData.encode(protocolData);

    // Convert to hex strings as expected by the contract
    const txHex = ccc.hexFrom(txReq.toBytes());
    const protocolDataHex = ccc.hexFrom(protocolDataBytes);

    console.log("Calling SSRI executor with:", {
      codeOutpoint: this.code,
      method: "CKBoostProtocol.update_protocol",
      scriptCodeHash: this.script.codeHash,
      scriptHashType: this.script.hashType,
      scriptArgs: this.script.args,
    });

    console.log("txHex", txHex);
    console.log("protocolDataHex", protocolDataHex);

    try {
      const res = await this.executor.runScriptTry(
        this.code,
        "CKBoostProtocol.update_protocol",
        [txHex, protocolDataHex],
        {
          script: this.script,
        }
      );

      if (res) {
        resTx = res.map((res) => ccc.Transaction.fromBytes(res));
        // Add the campaign code cell as a dependency
        resTx.res.addCellDeps({
          outPoint: this.code,
          depType: "code",
        });

        return resTx;
      } else {
        throw new Error("Failed to update protocol");
      }
    } catch (error) {
      console.error("SSRI executor error:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      throw error;
    }
  }

  /**
   * Helper to create a TippingConfig with proper type conversions
   */
  static createTippingConfig(
    config: TippingConfigLike
  ): ReturnType<typeof TippingConfig.decode> {
    // Simple and clean conversion now that all fields are required
    return {
      approval_requirement_thresholds:
        config.approval_requirement_thresholds.map((threshold) =>
          ccc.numFrom(threshold)
        ),
      expiration_duration: ccc.numFrom(config.expiration_duration),
    };
  }

  /**
   * Helper to create a ProtocolConfig with proper type conversions
   */
  static createProtocolConfig(
    config: ProtocolConfigLike
  ): ReturnType<typeof ProtocolConfig.decode> {
    // Return object with the same structure as ProtocolConfig.decode()
    return {
      admin_lock_hash_vec: (config.admin_lock_hash_vec || []).map((hash) =>
        ccc.hexFrom(hash)
      ),
      script_code_hashes: {
        ckb_boost_protocol_type_code_hash: config.script_code_hashes
          ?.ckb_boost_protocol_type_code_hash
          ? ccc.hexFrom(
              config.script_code_hashes.ckb_boost_protocol_type_code_hash
            )
          : ccc.hexFrom("0x" + "0".repeat(64)),
        ckb_boost_protocol_lock_code_hash: config.script_code_hashes
          ?.ckb_boost_protocol_lock_code_hash
          ? ccc.hexFrom(
              config.script_code_hashes.ckb_boost_protocol_lock_code_hash
            )
          : ccc.hexFrom("0x" + "0".repeat(64)),
        ckb_boost_campaign_type_code_hash: config.script_code_hashes
          ?.ckb_boost_campaign_type_code_hash
          ? ccc.hexFrom(
              config.script_code_hashes.ckb_boost_campaign_type_code_hash
            )
          : ccc.hexFrom("0x" + "0".repeat(64)),
        ckb_boost_campaign_lock_code_hash: config.script_code_hashes
          ?.ckb_boost_campaign_lock_code_hash
          ? ccc.hexFrom(
              config.script_code_hashes.ckb_boost_campaign_lock_code_hash
            )
          : ccc.hexFrom("0x" + "0".repeat(64)),
        ckb_boost_user_type_code_hash: config.script_code_hashes
          ?.ckb_boost_user_type_code_hash
          ? ccc.hexFrom(config.script_code_hashes.ckb_boost_user_type_code_hash)
          : ccc.hexFrom("0x" + "0".repeat(64)),
        accepted_udt_type_scripts: (
          config.script_code_hashes?.accepted_udt_type_scripts || []
        ).map((script) => ccc.Script.from(script)),
        accepted_dob_type_scripts: (
          config.script_code_hashes?.accepted_dob_type_scripts || []
        ).map((script) => ccc.Script.from(script)),
      },
    };
  }

  /**
   * Helper to create an EndorserInfo with proper type conversions
   */
  static createEndorserInfo(
    endorser: EndorserInfoLike
  ): ReturnType<typeof EndorserInfo.decode> {
    // For string fields (name, description), we need to convert to hex
    const nameHex = endorser.endorser_name
      ? ccc.hexFrom(ccc.bytesFrom(endorser.endorser_name.toString(), "utf8"))
      : "0x";
    const descHex = endorser.endorser_description
      ? ccc.hexFrom(
          ccc.bytesFrom(endorser.endorser_description.toString(), "utf8")
        )
      : "0x";
    const websiteHex = endorser.website
      ? ccc.hexFrom(ccc.bytesFrom(endorser.website.toString(), "utf8"))
      : "0x";
    const socialLinksHex =
      endorser.social_links?.map((link: ccc.BytesLike) =>
        ccc.hexFrom(ccc.bytesFrom(link.toString(), "utf8"))
      ) || [];

    // Return object with the same structure as EndorserInfo.decode()
    return {
      endorser_lock_hash: endorser.endorser_lock_hash
        ? ccc.hexFrom(endorser.endorser_lock_hash)
        : ccc.hexFrom("0x" + "0".repeat(64)),
      endorser_name: nameHex,
      endorser_description: descHex,
      website: websiteHex,
      social_links: socialLinksHex,
      verified:
        endorser.verified !== undefined
          ? Number(ccc.numFrom(endorser.verified))
          : 0,
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

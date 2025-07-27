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
    // Convert to the format expected by Molecule
    const protocolDataType: ProtocolDataType = {
      campaigns_approved: data.campaignsApproved || [],
      tipping_proposals: data.tippingProposals || [],
      tipping_config: Protocol.createTippingConfig(data.tippingConfig),
      endorsers_whitelist: (data.endorsersWhitelist || []).map(e => 
        Protocol.createEndorserInfo(e)
      ),
      last_updated: data.lastUpdated 
        ? Protocol.numberToUint64Buffer(data.lastUpdated)
        : Protocol.numberToUint64Buffer(Date.now()),
      protocol_config: Protocol.createProtocolConfig(data.protocolConfig)
    };
    
    return protocolDataType;
  }

  /**
   * Helper to convert number to Uint64 ArrayBuffer (little-endian)
   */
  private static numberToUint64Buffer(num: number): ArrayBuffer {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setBigUint64(0, BigInt(num), true); // little-endian
    return buffer;
  }

  /**
   * Helper to convert hex string to Byte32 ArrayBuffer
   */
  private static hexToBytes32Buffer(hex: string): ArrayBuffer {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    if (cleanHex.length !== 64) {
      throw new Error('Invalid hex string length for Byte32');
    }
    const buffer = new ArrayBuffer(32);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < 32; i++) {
      view[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16);
    }
    return buffer;
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
        await txReq.completeInputsAll(signer);
      }

      // Convert protocolData to bytes
      const protocolDataBytes = SerializeProtocolData(protocolData);

      // Convert to hex strings as expected by the contract
      const txHex = ccc.hexFrom(txReq.toBytes());
      const protocolDataHex = ccc.hexFrom(protocolDataBytes);

      console.log('Running SSRI executor with:', {
        codeOutpoint: this.code,
        method: "CKBoostProtocol.update_protocol",
        scriptCodeHash: this.script.codeHash,
        scriptHashType: this.script.hashType,
        scriptArgs: this.script.args,
        txHex: txHex.slice(0, 100) + '...', // Log first 100 chars
        protocolDataHex: protocolDataHex.slice(0, 100) + '...'
      });
      
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
    return {
      approval_requirement_thresholds: config.approvalRequirementThresholds.map(threshold => 
        Protocol.bigintToUint128Buffer(BigInt(threshold))
      ),
      expiration_duration: Protocol.numberToUint64Buffer(config.expirationDuration)
    };
  }

  /**
   * Helper to create a ProtocolConfig with proper type conversions
   */
  static createProtocolConfig(config: ProtocolConfigInput): ProtocolConfigType {
    return {
      admin_lock_hash_vec: config.adminLockHashes.map(hash => 
        Protocol.hexToBytes32Buffer(hash)
      ),
      script_code_hashes: {
        ckb_boost_protocol_type_code_hash: Protocol.hexToBytes32Buffer(config.scriptCodeHashes.ckbBoostProtocolTypeCodeHash),
        ckb_boost_protocol_lock_code_hash: Protocol.hexToBytes32Buffer(config.scriptCodeHashes.ckbBoostProtocolLockCodeHash),
        ckb_boost_campaign_type_code_hash: Protocol.hexToBytes32Buffer(config.scriptCodeHashes.ckbBoostCampaignTypeCodeHash),
        ckb_boost_campaign_lock_code_hash: Protocol.hexToBytes32Buffer(config.scriptCodeHashes.ckbBoostCampaignLockCodeHash),
        ckb_boost_user_type_code_hash: Protocol.hexToBytes32Buffer(config.scriptCodeHashes.ckbBoostUserTypeCodeHash),
        accepted_udt_type_code_hashes: (config.scriptCodeHashes.acceptedUdtTypeCodeHashes || []).map(hash => 
          Protocol.hexToBytes32Buffer(hash)
        ),
        accepted_dob_type_code_hashes: (config.scriptCodeHashes.acceptedDobTypeCodeHashes || []).map(hash => 
          Protocol.hexToBytes32Buffer(hash)
        ),
      }
    };
  }

  /**
   * Helper to convert bigint to Uint128 ArrayBuffer (little-endian)
   */
  private static bigintToUint128Buffer(value: bigint): ArrayBuffer {
    const buffer = new ArrayBuffer(16); // 128 bits = 16 bytes
    const view = new DataView(buffer);
    // Write as little-endian
    view.setBigUint64(0, value & BigInt('0xFFFFFFFFFFFFFFFF'), true);
    view.setBigUint64(8, (value >> BigInt(64)) & BigInt('0xFFFFFFFFFFFFFFFF'), true);
    return buffer;
  }

  /**
   * Helper to create an EndorserInfo with proper type conversions
   */
  static createEndorserInfo(endorser: EndorserInfoInput): EndorserInfoType {
    return {
      endorser_lock_hash: Protocol.hexToBytes32Buffer(endorser.lockHash),
      endorser_name: new TextEncoder().encode(endorser.name).buffer as ArrayBuffer,
      endorser_description: new TextEncoder().encode(endorser.description).buffer as ArrayBuffer
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
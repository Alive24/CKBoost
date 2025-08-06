import { ccc } from "@ckb-ccc/core";
import { ssri } from "@ckb-ccc/ssri";
import { 
  CampaignData, 
  ConnectedTypeID, 
  type CampaignDataLike
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
  public readonly connectedProtocolCell: ccc.Cell;

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
    connectedProtocolCell: ccc.Cell,
    config?: {
      executor?: ssri.Executor | null;
    } | null
  ) {
    super(code, config?.executor);
    this.script = ccc.Script.from(script);
    this.connectedProtocolCell = connectedProtocolCell;
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
    signer: ccc.Signer,
    campaignData: CampaignDataLike,
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

    // Serialize campaign data
    const campaignDataBytes = CampaignData.encode(campaignData);
    const campaignDataHex = ccc.hexFrom(campaignDataBytes);
    const txHex = ccc.hexFrom(txReq.toBytes());

    console.log("Calling SSRI executor with:", {
      codeOutpoint: this.code,
      method: "CKBoostCampaign.update_campaign",
      scriptCodeHash: this.script.codeHash,
      scriptHashType: this.script.hashType,
      scriptArgs: this.script.args,
    });

    console.log("txHex", txHex);
    console.log("campaignDataHex", campaignDataHex);

    // Execute SSRI method
    try {
      const methodPath = "CKBoostCampaign.update_campaign";
      const res = await this.executor.runScript(
        this.code,
        methodPath,
        [txHex, campaignDataHex],
        { script: this.script }
      );

      // Parse the returned transaction - the result is a hex string that needs to be parsed
      if (res) {
        resTx = res.map((res) => ccc.Transaction.fromBytes(res));
        // Add the campaign code cell as a dependency
        resTx.res.addCellDeps({
          outPoint: this.code,
          depType: "code",
        });

        // Find the campaign cell output (should be the first output with the campaign type script)
        const campaignCellOutputIndex = resTx.res.outputs.findIndex(
          (output) => output.type?.codeHash === this.script.codeHash
        );
        
        if (campaignCellOutputIndex === -1) {
          throw new Error("Campaign cell output not found in transaction");
        }

        // Get the protocol cell type hash
        const connectedProtocolCellTypeHash = this.connectedProtocolCell.cellOutput.type?.hash();
        if (!connectedProtocolCellTypeHash) {
          throw new Error("ConnectedProtocolCellTypeHash is not found");
        }
        // Create ConnectedTypeID with the protocol cell type hash
        let campaignCellTypeArgs = resTx.res.outputs[campaignCellOutputIndex].type?.args;
        if (!campaignCellTypeArgs) {
          throw new Error("campaignCellTypeArgs is empty.")
        }
        let connectedTypeId = ConnectedTypeID.decode(campaignCellTypeArgs)

        connectedTypeId.connected_type_hash = connectedProtocolCellTypeHash;

        // Encode ConnectedTypeID and set it as the campaign type script args
        const connectedTypeIdBytes = ConnectedTypeID.encode(connectedTypeId);
        const connectedTypeIdHex = ccc.hexFrom(connectedTypeIdBytes);
        
        // Update the campaign cell's type script args with the ConnectedTypeID
        if (resTx.res.outputs[campaignCellOutputIndex].type) {
          resTx.res.outputs[campaignCellOutputIndex].type.args = connectedTypeIdHex;
        }

        // Add the protocol cell as a dependency
        resTx.res.addCellDeps({
          outPoint: this.connectedProtocolCell.outPoint,
          depType: "code",
        });
        return resTx;
      } else {
        throw new Error("Failed to update campaign");
      }
    } catch (error) {
      console.error("SSRI executor error:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      throw error;
    }
  }

  /**
   * Approve a quest completion
   *
   * @param _signer - The signer for the transaction
   * @param campaignTypeHash - The campaign type hash
   * @param questData - The quest completion data
   * @param tx - Optional existing transaction
   * @returns The updated transaction
   */
  async approveCompletion(
    _signer: ccc.Signer,
    campaignTypeHash: ccc.HexLike,
    questId: ccc.Num,
    userLockHash: ccc.HexLike,
    tx?: ccc.Transaction
  ): Promise<{ res: ccc.Transaction }> {
    if (!this.executor) {
      throw new Error("Executor required for SSRI operations");
    }

    // Prepare transaction or use existing
    const baseTx =
      tx ||
      ccc.Transaction.from({
        version: 0,
        cellDeps: [],
        headerDeps: [],
        inputs: [],
        outputs: [],
        outputsData: [],
        witnesses: [],
      });

    // Execute SSRI method
    const methodPath = "CKBoostCampaign.approve_completion";
    const result = await this.executor.runScript(
      this.code,
      methodPath,
      [
        baseTx.toBytes(),
        ccc.hexFrom(campaignTypeHash),
        ccc.hexFrom(ccc.numToBytes(questId)),
        ccc.hexFrom(userLockHash),
      ],
      { script: this.script }
    );

    // Parse the returned transaction - the result is a hex string that needs to be parsed
    const updatedTx = ccc.Transaction.from(
      JSON.parse(ccc.bytesFrom(result.res, "hex").toString())
    );
    return { res: updatedTx };
  }
}

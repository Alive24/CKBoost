import { ccc } from "@ckb-ccc/core";
import { fetchCampaignByTypeId } from "../ckb/campaign-cells";
import { fetchUDTCellsByCampaignLock } from "../ckb/udt-cells";
import { UDTAssetLike } from "ssri-ckboost/types";
import { debug } from "../utils/debug";
import { sendTransactionWithFeeRetry } from "../ckb/transaction-wrapper";

/**
 * Service for managing campaign funding with UDTs
 * Allows anyone to fund campaigns with various UDT types
 */
export class FundingService {
  private signer: ccc.Signer;
  private campaignTypeCodeHash: ccc.Hex;
  private campaignLockCodeHash: ccc.Hex;
  private protocolCell: ccc.Cell;

  constructor(
    signer: ccc.Signer,
    campaignTypeCodeHash: ccc.Hex,
    campaignLockCodeHash: ccc.Hex,
    protocolCell: ccc.Cell
  ) {
    this.signer = signer;
    this.campaignTypeCodeHash = campaignTypeCodeHash;
    this.campaignLockCodeHash = campaignLockCodeHash;
    this.protocolCell = protocolCell;
  }

  /**
   * Fund a campaign with UDT assets
   * Anyone can call this - no permission required
   */
  async fundCampaignWithUDT(
    campaignTypeId: ccc.Hex,
    udtAssets: UDTAssetLike[]
  ): Promise<string> {
    debug.log("Funding campaign", campaignTypeId, "with UDT assets:", udtAssets);

    try {
      // Fetch the campaign to verify it exists
      const campaignCell = await fetchCampaignByTypeId(
        campaignTypeId,
        this.campaignTypeCodeHash,
        this.signer,
        this.protocolCell
      );
      if (!campaignCell) {
        throw new Error("Campaign not found");
      }

      // Build the funding transaction
      const tx = ccc.Transaction.from({});

      // For each UDT asset to fund
      for (const udtAsset of udtAssets) {
        const udtScript = udtAsset.udt_script;
        const amount = ccc.numFrom(udtAsset.amount);

        // Find user's UDT cells to fund from
        const userUdtCells = await this.findUserUDTCells(
          udtScript,
          amount
        );

        if (!userUdtCells || userUdtCells.length === 0) {
          throw new Error(`Insufficient UDT balance for funding`);
        }

        // Add UDT cells as inputs
        for (const cell of userUdtCells) {
          await tx.addInput(cell);
        }

        // Create campaign-locked UDT output
        const campaignLockScript = this.createCampaignLockScript(campaignTypeId);
        const udtOutput = {
          lock: campaignLockScript,
          type: udtScript,
        };

        await tx.addOutput(
          udtOutput,
          ccc.numToBytes(amount, 16) // UDT amount as data
        );
      }

      // Complete the transaction with automatic fee retry
      await tx.completeFeeBy(this.signer);
      const txHash = await sendTransactionWithFeeRetry(this.signer, tx);

      debug.log("Campaign funded successfully. Transaction:", txHash);
      return txHash;
    } catch (error) {
      debug.error("Failed to fund campaign:", error);
      throw error;
    }
  }

  /**
   * Check if a campaign has sufficient funding for its rewards
   */
  async checkFundingSufficiency(
    campaignTypeId: ccc.Hex,
    requiredAssets: UDTAssetLike[]
  ): Promise<boolean> {
    debug.log("Checking funding sufficiency for campaign", campaignTypeId);

    try {
      // Fetch campaign-locked UDT cells
      const fundedCells = await fetchUDTCellsByCampaignLock(
        campaignTypeId,
        this.campaignLockCodeHash,
        this.signer
      );

      // Group funded cells by UDT type
      const fundedAmounts = new Map<string, bigint>();
      
      for (const cell of fundedCells) {
        const udtTypeHash = cell.cellOutput.type?.hash();
        if (udtTypeHash) {
          const currentAmount = fundedAmounts.get(udtTypeHash) || 0n;
          const cellAmount = ccc.numFromBytes(cell.outputData);
          fundedAmounts.set(udtTypeHash, currentAmount + cellAmount);
        }
      }

      // Check if funding meets requirements
      for (const required of requiredAssets) {
        const udtScript = ccc.Script.from(required.udt_script);
        const udtTypeHash = udtScript.hash();
        
        const funded = fundedAmounts.get(udtTypeHash) || 0n;
        const needed = ccc.numFrom(required.amount);
        
        if (funded < needed) {
          debug.log(`Insufficient funding: ${funded} < ${needed} for UDT ${udtTypeHash}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      debug.error("Failed to check funding sufficiency:", error);
      return false;
    }
  }

  /**
   * Get the current funding status of a campaign
   */
  async getCampaignFundingStatus(campaignTypeId: ccc.Hex): Promise<{
    fundedAssets: Map<string, bigint>;
    totalValueLocked: bigint;
  }> {
    debug.log("Getting funding status for campaign", campaignTypeId);

    try {
      // Fetch campaign-locked UDT cells
      const fundedCells = await fetchUDTCellsByCampaignLock(
        campaignTypeId,
        this.campaignLockCodeHash,
        this.signer
      );

      // Calculate funded amounts by UDT type
      const fundedAssets = new Map<string, bigint>();
      let totalValueLocked = 0n;

      for (const cell of fundedCells) {
        const udtTypeHash = cell.cellOutput.type?.hash();
        if (udtTypeHash) {
          const currentAmount = fundedAssets.get(udtTypeHash) || 0n;
          const cellAmount = ccc.numFromBytes(cell.outputData);
          fundedAssets.set(udtTypeHash, currentAmount + cellAmount);
          totalValueLocked += cellAmount;
        }
      }

      return {
        fundedAssets,
        totalValueLocked,
      };
    } catch (error) {
      debug.error("Failed to get funding status:", error);
      throw error;
    }
  }

  /**
   * Helper: Find user's UDT cells for funding
   */
  private async findUserUDTCells(
    udtScript: ccc.ScriptLike,
    requiredAmount: bigint
  ): Promise<ccc.Cell[]> {
    const collector = this.signer.client.findCells({
      script: ccc.Script.from(udtScript),
      scriptType: "type",
      scriptSearchMode: "exact",
      filter: {
        outputDataLenRange: [16, 17], // UDT amount is 16 bytes
      },
    });

    const cells: ccc.Cell[] = [];
    let totalAmount = 0n;

    for await (const cell of collector) {
      // Check if cell belongs to the signer
      const addresses = await this.signer.getAddresses();
      const cellLockHash = cell.cellOutput.lock.hash();
      
      let belongsToSigner = false;
      for (const addr of addresses) {
        const { script } = await ccc.Address.fromString(addr, this.signer.client);
        if (script.hash() === cellLockHash) {
          belongsToSigner = true;
          break;
        }
      }

      if (belongsToSigner) {
        cells.push(cell);
        const amount = ccc.numFromBytes(cell.outputData);
        totalAmount += amount;

        if (totalAmount >= requiredAmount) {
          break;
        }
      }
    }

    return cells;
  }

  /**
   * Helper: Create campaign-lock script for a campaign
   */
  private createCampaignLockScript(campaignTypeId: ccc.Hex): ccc.Script {
    return ccc.Script.from({
      codeHash: this.campaignLockCodeHash,
      hashType: "type" as ccc.HashType,
      args: campaignTypeId, // Campaign type ID as lock args
    });
  }
}
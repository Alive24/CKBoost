import { ccc, ssri, udt } from "@ckb-ccc/connector-react";
import { fetchCampaignByTypeId } from "../ckb/campaign-cells";
import { fetchUDTCellsByCampaignLock } from "../ckb/udt-cells";
import { UDTAssetLike } from "ssri-ckboost/types";
import { debug } from "../utils/debug";
import { sendTransactionWithFeeRetry } from "../ckb/transaction-wrapper";
import { udtRegistry } from "./udt-registry";

/**
 * Service for managing campaign funding with UDTs
 * Allows anyone to fund campaigns with various UDT types
 */
export class FundingService {
  private signer: ccc.Signer;
  private campaignTypeCodeHash: ccc.Hex;
  private campaignLockCodeHash: ccc.Hex;
  private protocolCell: ccc.Cell;
  private executor: ssri.Executor;
  private udtInstances: Map<string, udt.Udt>;

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
    
    // Initialize SSRI executor
    const executorUrl = process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
    this.executor = new ssri.ExecutorJsonRpc(executorUrl);
    
    // Initialize known UDT instances from registry
    this.udtInstances = new Map();
    this.initializeUDTsFromRegistry().catch(error => {
      debug.error("Failed to initialize UDT instances:", error);
    });
  }
  
  /**
   * Initialize UDT instances from the registry
   */
  private async initializeUDTsFromRegistry(): Promise<void> {
    // Get all tokens from registry
    const tokens = udtRegistry.getAllTokens();
    
    debug.log("Initializing UDT instances from registry");
    
    // Initialize a UDT instance for each token in the registry
    for (const token of tokens) {
      const script = ccc.Script.from(token.script);
      const scriptHash = script.hash();
      const contractScript = ccc.Script.from(token.contractScript);
      
      debug.log(`Initializing token ${token.symbol}:`, {
        script: token.script,
        contractScript: token.contractScript,
        ssri: token.ssri,
        scriptHash
      });
      
      try {
        // Find the deployment cell using contractScript
        debug.log(`Finding contract deployment for token ${token.symbol}`);
        
        const collector = this.signer.client.findCells({
          script: contractScript,
          scriptType: "type",
          scriptSearchMode: "exact"
        });
        
        let outPoint: ccc.OutPointLike | undefined;
        for await (const cell of collector) {
          if (cell.outPoint) {
            outPoint = cell.outPoint;
            debug.log(`Found contract deployment for ${token.symbol}:`, outPoint);
            break;
          }
        }
        
        if (!outPoint) {
          debug.warn(`Could not find contract deployment for token ${token.symbol}, skipping`);
          continue;
        }
        
        // Create UDT instance - only provide executor for SSRI tokens
        if (token.ssri) {
          this.udtInstances.set(scriptHash, new udt.Udt(outPoint, script, { executor: this.executor }));
          debug.log(`Initialized SSRI UDT instance for ${token.symbol} with executor`);
        } else {
          this.udtInstances.set(scriptHash, new udt.Udt(outPoint, script));
          debug.log(`Initialized regular UDT instance for ${token.symbol} without executor`);
        }
      } catch (error) {
        debug.error(`Failed to initialize UDT instance for ${token.symbol}:`, error);
      }
    }
    
    debug.log("Initialized UDT instances from registry:", {
      totalTokens: tokens.length,
      initializedInstances: this.udtInstances.size
    });
  }
  
  /**
   * Get or create a UDT instance for a specific UDT script
   */
  private async getUdtInstance(udtScript: ccc.Script): Promise<udt.Udt> {
    const scriptHash = udtScript.hash();
    
    // Check if we have a UDT instance for this specific script
    const udtInstance = this.udtInstances.get(scriptHash);
    if (udtInstance) {
      return udtInstance;
    }
    
    // If not found, try to create one on the fly
    const token = udtRegistry.getTokenByScriptHash(scriptHash);
    if (!token) {
      throw new Error(`Unknown UDT script: ${scriptHash}. Token not found in registry.`);
    }
    
    // Find the deployment cell using contractScript
    const contractScript = ccc.Script.from(token.contractScript);
    debug.log(`Finding contract deployment for token ${token.symbol} on demand`);
    
    const collector = this.signer.client.findCells({
      script: contractScript,
      scriptType: "type",
      scriptSearchMode: "exact"
    });
    
    let outPoint: ccc.OutPointLike | undefined;
    for await (const cell of collector) {
      if (cell.outPoint) {
        outPoint = cell.outPoint;
        break;
      }
    }
    
    if (!outPoint) {
      throw new Error(`Could not find contract deployment for token ${token.symbol}`);
    }
    
    // Create UDT instance - only provide executor for SSRI tokens
    let newInstance: udt.Udt;
    if (token.ssri) {
      newInstance = new udt.Udt(outPoint, udtScript, { executor: this.executor });
      debug.log(`Created SSRI UDT instance on demand for ${token.symbol}`);
    } else {
      newInstance = new udt.Udt(outPoint, udtScript);
      debug.log(`Created regular UDT instance on demand for ${token.symbol}`);
    }
    
    this.udtInstances.set(scriptHash, newInstance);
    return newInstance;
  }

  /**
   * Add UDT funding to an existing transaction (e.g., campaign creation/update)
   * This uses the proper @ckb-ccc/udt transfer method to add UDT transfers to the transaction
   * @param tx - The existing transaction (e.g., from updateCampaign)
   * @param campaignOwnerLock - The lock script to use for locking UDTs (campaign owner's address)
   * @param udtAssets - Array of UDT assets to fund
   * @returns Modified transaction with UDT funding
   */
  async addUDTFundingToTransaction(
    tx: ccc.Transaction,
    campaignOwnerLock: ccc.Script,
    udtAssets: UDTAssetLike[]
  ): Promise<ccc.Transaction> {
    console.log("===============================================");
    console.log("ADDING UDT FUNDING TO EXISTING TRANSACTION");
    console.log("===============================================");
    debug.log("Adding UDT funding for", udtAssets.length, "assets to existing transaction");
    debug.log("Campaign owner lock:", campaignOwnerLock.args);
    debug.log("Transaction before UDT funding:", {
      inputs: tx.inputs.length,
      outputs: tx.outputs.length,
      cellDeps: tx.cellDeps.length
    });

    if (!udtAssets || udtAssets.length === 0) {
      debug.log("No UDT assets to fund, returning transaction unchanged");
      return tx;
    }
    
    // Process each UDT asset
    for (const udtAsset of udtAssets) {
      const udtScript = ccc.Script.from(udtAsset.udt_script);
      const requiredAmount = ccc.numFrom(udtAsset.amount);

      debug.log("Processing UDT funding:", {
        scriptHash: udtScript.hash().slice(0, 10) + "...",
        requiredAmount: requiredAmount.toString(),
        udtScript
      });

      // First, let's check if the user has any UDT cells of this type
      debug.log("Checking user's UDT balance for script:", {
        codeHash: udtScript.codeHash,
        hashType: udtScript.hashType,
        args: udtScript.args,
        scriptHash: udtScript.hash()
      });
      
      try {
        // Try to find user's UDT cells manually first to debug
        const addresses = await this.signer.getAddresses();
        if (addresses.length > 0) {
          const { script: userLock } = await ccc.Address.fromString(addresses[0], this.signer.client);
          debug.log("User lock script:", userLock);
          
          // Search for UDT cells
          const collector = this.signer.client.findCellsByLock(
            userLock,
            udtScript,
            true,
          );
          
          let foundCells = 0;
          let totalAmount = 0n;
          let scannedCells = 0;
          for await (const cell of collector) {
            scannedCells++;
            
            // Log first few cells for debugging
            if (scannedCells <= 3) {
              const amountBytes = cell.outputData.slice(0, 16);
              const amount = ccc.numLeFromBytes(amountBytes);
              debug.log(`Cell #${scannedCells}:`, {
                lock: cell.cellOutput.lock.args.slice(0, 20) + "...",
                lockHash: cell.cellOutput.lock.hash().slice(0, 20) + "...",
                userLockHash: userLock.hash().slice(0, 20) + "...",
                isUserCell: cell.cellOutput.lock.hash() === userLock.hash(),
                amount: amount.toString()
              });
            }
            
            if (cell.cellOutput.lock.hash() === userLock.hash()) {
              foundCells++;
              // UDT amount is stored in the first 16 bytes (128 bits) as little-endian
              const amountBytes = cell.outputData.slice(0, 16);
              const amount = ccc.numLeFromBytes(amountBytes);
              totalAmount += amount;
              debug.log(`Found UDT cell #${foundCells}: amount=${amount.toString()}, lock=${cell.cellOutput.lock.args.slice(0, 10)}...`);
              
              if (foundCells >= 5) break; // Just check first 5 for debugging
            }
            
            if (scannedCells >= 10) {
              debug.log(`Scanned ${scannedCells} cells, found ${foundCells} belonging to user`);
              break;
            }
          }
          
          debug.log(`UDT balance check: found ${foundCells} cells with total amount ${totalAmount.toString()}`);
          
          if (totalAmount < requiredAmount) {
            throw new Error(`Insufficient UDT balance. Required: ${requiredAmount.toString()}, Available: ${totalAmount.toString()}`);
          }
        }
      } catch (error) {
        debug.error("Error checking UDT balance:", error);
        throw new Error(`Failed to verify UDT balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Get the UDT instance for this specific script
      const udt = await this.getUdtInstance(udtScript);

      // Use the UDT transfer method to create a transfer to the campaign owner
      debug.log("Creating UDT transfer to campaign owner");
      
      try {
        const { res: transferTx } = await udt.transfer(
          this.signer,
          [{
            to: campaignOwnerLock,
            amount: requiredAmount
          }],
          tx // Pass the existing transaction to build upon
        );
        
        if (!transferTx) {
          throw new Error("UDT transfer returned no transaction");
        }
        await udt.completeBy(transferTx, this.signer);
        tx = transferTx;
      } catch (error) {
        debug.error("UDT transfer failed:", error);
        
        // Provide more helpful error message
        if (error instanceof Error && error.message.includes("Cell not found")) {
          const token = udtRegistry.getTokenByScriptHash(udtScript.hash());
          const tokenName = token ? `${token.symbol} (${token.name})` : "Unknown Token";
          throw new Error(`No ${tokenName} tokens found in your wallet. Please ensure you have ${tokenName} tokens before funding.`);
        }
        
        throw error;
      }

      // The transfer method should have added the necessary inputs, outputs, and cell deps

      debug.log("UDT transfer added to transaction:", {
        amount: requiredAmount.toString(),
        to: campaignOwnerLock.args.slice(0, 10) + "..."
      });
    }

    // Log transaction structure after adding UDT funding
    debug.log("Transaction after adding UDT funding:", {
      inputs: tx.inputs.length,
      outputs: tx.outputs.length,
      cellDeps: tx.cellDeps.length
    });

    // Log detailed output info
    debug.log("UDT outputs added to transaction:");
    for (let i = 0; i < tx.outputs.length; i++) {
      const output = tx.outputs[i];
      if (output.type) {
        debug.log(`Output ${i}: Type script hash ${output.type.hash().slice(0, 10)}...`);
        debug.log(`  Lock: ${output.lock.args.slice(0, 10)}...`);
        debug.log(`  Capacity: ${output.capacity}`);
      }
    }

    

    return tx;
  }

  /**
   * Fund a campaign with UDT assets (standalone transaction)
   * Use this when funding an existing campaign separately
   */
  async fundCampaignWithUDT(
    campaignTypeId: ccc.Hex,
    udtAssets: UDTAssetLike[]
  ): Promise<string> {
    console.log("===============================================");
    console.log("CREATING STANDALONE UDT FUNDING TRANSACTION");
    console.log("===============================================");
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

      // Create a new transaction
      let tx = ccc.Transaction.from({});

      // Add UDT funding to the transaction using the proper transfer method
      tx = await this.addUDTFundingToTransaction(
        tx,
        campaignCell.cellOutput.lock, // Use campaign owner's lock
        udtAssets
      );

      // For each UDT, use the completeBy method to ensure proper completion
      for (const udtAsset of udtAssets) {
        const udtScript = ccc.Script.from(udtAsset.udt_script);
        
        // Get the UDT instance for this specific script
        const udt = await this.getUdtInstance(udtScript);
        
        // Complete the transaction for this UDT
        tx = await udt.completeBy(tx, this.signer);
      }

      // Complete the transaction with CKB capacity
      await tx.completeInputsByCapacity(this.signer);
      await tx.completeFeeBy(this.signer);

      // Log final transaction
      debug.log("Final standalone funding transaction:", {
        inputs: tx.inputs.length,
        outputs: tx.outputs.length,
        witnesses: tx.witnesses.length,
        cellDeps: tx.cellDeps.map((dep) => ({
          outPoint: dep.outPoint,
          depType: dep.depType
        }))
      });

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

}
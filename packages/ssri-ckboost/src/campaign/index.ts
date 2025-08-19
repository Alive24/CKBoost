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
        
        // Handle different type args formats
        let connectedTypeId;
        const argsBytes = ccc.bytesFrom(campaignCellTypeArgs);
        
        if (argsBytes.length === 0 || campaignCellTypeArgs === "0x") {
          // Empty args - create new ConnectedTypeID with a generated type_id
          // Generate a unique type_id based on the transaction hash and output index
          const txHash = resTx.res.hash();
          const typeIdBytes = ccc.bytesFrom(txHash).slice(0, 32);
          
          connectedTypeId = {
            type_id: ccc.hexFrom(typeIdBytes),
            connected_key: connectedProtocolCellTypeHash,
          };
        } else if (argsBytes.length === 32) {
          // Direct protocol reference - wrap in ConnectedTypeID
          // Use the existing 32 bytes as the type_id
          connectedTypeId = {
            type_id: campaignCellTypeArgs,
            connected_key: connectedProtocolCellTypeHash,
          };
        } else if (argsBytes.length === 76) {
          // Already a ConnectedTypeID - decode and update
          connectedTypeId = ConnectedTypeID.decode(campaignCellTypeArgs);
          connectedTypeId.connected_key = connectedProtocolCellTypeHash;
        } else {
          throw new Error(`Invalid campaign type args length: ${argsBytes.length}. Expected 0, 32, or 76 bytes.`);
        }

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
   * Approve quest completions and mint Points
   *
   * @param signer - The signer for the transaction
   * @param campaignData - The current campaign data
   * @param questId - The quest ID to approve completions for
   * @param userTypeIds - Array of user type IDs to approve (as Byte32)
   * @param tx - Optional existing transaction to build upon
   * @returns The updated transaction
   */
  async approveCompletion(
    signer: ccc.Signer,
    campaignData: CampaignDataLike,
    questId: number,
    userTypeIds: ccc.HexLike[],
    tx?: ccc.Transaction
  ): Promise<ssri.ExecutorResponse<ccc.Transaction>> {
    if (!this.executor) {
      throw new Error("Executor required for SSRI operations");
    }

    let resTx: ssri.ExecutorResponse<ccc.Transaction>;

    const txReq = ccc.Transaction.from(tx ?? {});
    // Ensure at least one input for the transaction
    if (txReq.inputs.length === 0) {
      await txReq.completeInputsAtLeastOne(signer);
      await txReq.completeInputsByCapacity(signer);
    }

    // Serialize the parameters
    const campaignDataBytes = CampaignData.encode(campaignData);
    const campaignDataHex = ccc.hexFrom(campaignDataBytes);
    const questIdHex = ccc.hexFrom(ccc.numToBytes(questId, 4)); // u32
    
    // Convert user type IDs to hex strings (they should already be 32 bytes each)
    // Each user type ID should be exactly 32 bytes
    const userTypeIdsList: string[] = [];
    for (const id of userTypeIds) {
      const bytes = ccc.bytesFrom(id);
      // Ensure exactly 32 bytes
      if (bytes.length !== 32) {
        // If the ID is shorter, pad it; if longer, truncate
        const paddedBytes = new Uint8Array(32);
        paddedBytes.set(bytes.slice(0, 32));
        userTypeIdsList.push(ccc.hexFrom(paddedBytes));
      } else {
        userTypeIdsList.push(ccc.hexFrom(bytes));
      }
    }
    const userTypeIdsHex = userTypeIdsList.join('');

    const txHex = ccc.hexFrom(txReq.toBytes());

    console.log("Calling SSRI executor for approve_completion with:", {
      codeOutpoint: this.code,
      method: "CKBoostCampaign.approve_completion",
      questId,
      userCount: userTypeIds.length,
      userTypeIdsHex: userTypeIdsHex.slice(0, 100) + "...",
    });

    // Execute SSRI method
    try {
      const methodPath = "CKBoostCampaign.approve_completion";
      const res = await this.executor.runScript(
        this.code,
        methodPath,
        [txHex, campaignDataHex, questIdHex, userTypeIdsHex],
        { script: this.script }
      );

      // Parse the returned transaction
      if (res) {
        resTx = res.map((res) => ccc.Transaction.fromBytes(res));
        
        // Add the campaign code cell as a dependency
        resTx.res.addCellDeps({
          outPoint: this.code,
          depType: "code",
        });

        // Add the protocol cell as a dependency
        resTx.res.addCellDeps({
          outPoint: this.connectedProtocolCell.outPoint,
          depType: "code",
        });

        // Parse protocol data to get Points UDT code hash
        const { ProtocolData } = await import("../generated");
        const protocolData = ProtocolData.decode(this.connectedProtocolCell.outputData);
        const pointsUdtCodeHash = ccc.hexFrom(protocolData.protocol_config.script_code_hashes.ckb_boost_points_udt_type_code_hash);
        const protocolTypeHash = this.connectedProtocolCell.cellOutput.type?.hash();

        if (!protocolTypeHash) {
          throw new Error("Protocol cell missing type script");
        }

        // Get the quest to find points amount
        const quest = campaignData.quests?.find(q => Number(q.quest_id) === questId);
        if (!quest) {
          throw new Error(`Quest ${questId} not found in campaign data`);
        }

        const pointsAmount = Number(quest.points) || 0;
        if (pointsAmount === 0) {
          throw new Error(`Quest ${questId} has no points reward`);
        }

        console.log("Creating Points UDT cells:", {
          pointsUdtCodeHash,
          protocolTypeHash,
          pointsAmount,
          userCount: userTypeIds.length
        });

        // Get user type code hash from protocol data to find user cells
        const userTypeCodeHash = ccc.hexFrom(protocolData.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash);

        // First, let's see what user cells exist
        console.log(`\n🔍 Searching for ALL user cells with type code hash: ${userTypeCodeHash}`);
        const allUserCells = signer.client.findCells({
          script: {
            codeHash: userTypeCodeHash,
            hashType: "type",
            args: "", // Empty args to find all cells with this type
          },
          scriptType: "type",
          scriptSearchMode: "prefix",
        });
        
        let debugCellCount = 0;
        for await (const cell of allUserCells) {
          debugCellCount++;
          console.log(`Found user cell #${debugCellCount}:`, {
            outPoint: cell.outPoint,
            typeArgs: cell.cellOutput.type?.args?.slice(0, 80) + "...",
            typeArgsLength: cell.cellOutput.type?.args?.length,
            lockCodeHash: cell.cellOutput.lock.codeHash.slice(0, 10) + "...",
          });
          if (debugCellCount >= 5) break; // Only show first 5 for debugging
        }
        console.log(`Total user cells found for debugging: ${debugCellCount}`);

        // Create Points UDT cells for each approved user
        for (const userTypeId of userTypeIds) {
          const userTypeIdHex = ccc.hexFrom(userTypeId);
          
          console.log(`\n🎯 Processing user ${userTypeIdHex.slice(0, 10)}...`);
          console.log(`Looking for user cell with type code hash: ${userTypeCodeHash}`);
          console.log(`User type ID to match: ${userTypeIdHex}`);

          const userConnectedTypeId = {
            type_id: userTypeIdHex,
            connected_key: protocolTypeHash,
          }
          console.log("userConnectedTypeId", userConnectedTypeId);
          
          // Encode the ConnectedTypeID for the search
          const encodedConnectedTypeId = ConnectedTypeID.encode(userConnectedTypeId);
          const encodedConnectedTypeIdHex = ccc.hexFrom(encodedConnectedTypeId);
          
          console.log(`📝 Encoded ConnectedTypeID for search:`, {
            encoded: encodedConnectedTypeIdHex,
            length: encodedConnectedTypeIdHex.length,
            typeId: userTypeIdHex,
            connectedKey: protocolTypeHash
          });
          
          // Find the user cell by their type_id
          // The user cell's type script args should match this exact ConnectedTypeID
          const userCells = signer.client.findCells({
            script: {
              codeHash: userTypeCodeHash,
              hashType: "type",
              args: encodedConnectedTypeIdHex,
            },
            scriptType: "type",
            scriptSearchMode: "exact", // Use exact match since we have the full ConnectedTypeID
          });

          const userCellResult = await userCells.next();
          console.log(`📊 User cell iterator result:`, {
            done: userCellResult?.done,
            hasValue: !!userCellResult?.value,
            valueType: userCellResult?.value ? typeof userCellResult.value : 'undefined',
            cellOutPoint: userCellResult?.value?.outPoint ? userCellResult.value.outPoint : 'no outPoint'
          });
          
          // The iterator returns {done: boolean, value: Cell}
          if (!userCellResult || userCellResult.done || !userCellResult.value) {
            console.warn(`❌ User cell not found for type ID: ${userTypeIdHex}, skipping Points minting`);
            console.warn(`Search criteria used:`, {
              codeHash: userTypeCodeHash,
              hashType: "type", 
              args: encodedConnectedTypeIdHex,
              argsLength: encodedConnectedTypeIdHex.length
            });
            console.warn(`Expected ConnectedTypeID structure:`, {
              typeId: userTypeIdHex,
              connectedKey: protocolTypeHash
            });
            continue;
          }
          
          const userCell = userCellResult.value;

          console.log(`Found user cell:`, {
            outPoint: userCell.outPoint,
            lockCodeHash: userCell.cellOutput.lock.codeHash,
            lockArgs: userCell.cellOutput.lock.args,
            typeCodeHash: userCell.cellOutput.type?.codeHash,
            typeArgs: userCell.cellOutput.type?.args,
          });

          // Get the user's lock script from their cell
          const userLock = userCell.cellOutput.lock;

          const pointsCell = {
            capacity: ccc.fixedPointFrom("142"), // Minimum UDT cell capacity
            lock: userLock,
            type: {
              codeHash: pointsUdtCodeHash,
              hashType: "type" as const,
              args: protocolTypeHash, // Protocol type hash as args for Points UDT
            },
          };

          console.log(`Creating Points UDT cell:`, {
            capacity: pointsCell.capacity.toString(),
            lockCodeHash: userLock.codeHash,
            lockArgs: userLock.args,
            typeCodeHash: pointsUdtCodeHash,
            typeArgs: protocolTypeHash,
            pointsAmount: pointsAmount
          });
          
          try {
            // Log transaction state before adding Points cell
            console.log(`📝 Transaction state before adding Points cell:`, {
              outputCount: resTx.res.outputs.length,
              outputsDataCount: resTx.res.outputsData.length
            });
            
            resTx.res.addOutput(pointsCell, ccc.numToBytes(pointsAmount, 16));
            console.log(`✅ Successfully added Points UDT cell for user ${userTypeIdHex.slice(0, 10)}... with ${pointsAmount} points`);
            
            // Log current transaction state after adding
            console.log(`📈 Transaction after adding Points cell:`, {
              outputCount: resTx.res.outputs.length,
              outputsDataCount: resTx.res.outputsData.length,
              lastOutputIndex: resTx.res.outputs.length - 1
            });
            
            const lastOutput = resTx.res.outputs[resTx.res.outputs.length - 1];
            console.log(`🎯 Output ${resTx.res.outputs.length - 1} (Points UDT):`, {
              capacity: lastOutput.capacity.toString(),
              lockCodeHash: lastOutput.lock.codeHash.slice(0, 10) + "...",
              lockArgs: lastOutput.lock.args.slice(0, 10) + "...",
              typeCodeHash: lastOutput.type?.codeHash?.slice(0, 10) + "..." || "None",
              typeArgs: lastOutput.type?.args?.slice(0, 10) + "..." || "None",
            });
            
            // Verify the output data was added correctly
            const lastOutputData = resTx.res.outputsData[resTx.res.outputsData.length - 1];
            console.log(`💾 Output data for Points UDT:`, {
              dataLength: lastOutputData.length,
              dataHex: ccc.hexFrom(lastOutputData).slice(0, 40) + "..."
            });
          } catch (error) {
            console.error(`❌ Failed to add Points UDT cell for user ${userTypeIdHex}:`, error);
            throw error;
          }
        }
        
        // Final transaction logging
        console.log(`🔍 Final transaction before return:`);
        console.log(`  Inputs: ${resTx.res.inputs.length}`);
        console.log(`  Outputs: ${resTx.res.outputs.length}`);
        console.log(`  OutputsData: ${resTx.res.outputsData.length}`);
        
        resTx.res.outputs.forEach((output, index) => {
          console.log(`  Output ${index}:`, {
            capacity: output.capacity.toString(),
            lockCodeHash: output.lock.codeHash.slice(0, 10) + "...",
            lockArgs: output.lock.args.slice(0, 10) + "...",
            typeCodeHash: output.type?.codeHash?.slice(0, 10) + "..." || "None",
            typeArgs: output.type?.args?.slice(0, 10) + "..." || "None",
            hasOutputData: index < resTx.res.outputsData.length,
            outputDataLength: index < resTx.res.outputsData.length ? resTx.res.outputsData[index].length : 0
          });
        });
        
        return resTx;
      } else {
        throw new Error("Failed to approve quest completions");
      }
    } catch (error) {
      console.error("SSRI executor error:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      throw error;
    }
  }
}

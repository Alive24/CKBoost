// Protocol Cell Deployment - Deploy new protocol cell to CKB blockchain
// This file handles deploying a new protocol cell when none exists

import { ccc } from "@ckb-ccc/core";
import { Protocol } from "ssri-ckboost";
import { ssri } from "@ckb-ccc/ssri";
import {
  deploymentManager,
  DeploymentManager,
  DeploymentRecord,
} from "./deployment-manager";
import { ProtocolDataLike } from "ssri-ckboost/types";

/**
 * Get the protocol type code cell outpoint from deployment information
 * @returns The outpoint of the cell containing the protocol code or null
 */
function getProtocolTypeCodeOutPoint(): {
  outPoint: { txHash: ccc.Hex; index: ccc.Num };
  deployment: DeploymentRecord;
} | null {
  try {
    // Get current network
    const network = DeploymentManager.getCurrentNetwork();

    // Get deployment info from deployment manager
    const outPoint = deploymentManager.getContractOutPoint(
      network,
      "ckboostProtocolType"
    );
    const deployment = deploymentManager.getCurrentDeployment(
      network,
      "ckboostProtocolType"
    );

    if (!outPoint || !deployment) {
      throw new Error(
        `Protocol type contract not found in deployments.json for ${network}. ` +
          `Please ensure the contract is deployed and recorded in deployments.json`
      );
    }

    console.log(
      `Using protocol type code cell from deployments.json:`,
      outPoint
    );

    return { outPoint, deployment };
  } catch (error) {
    console.error("Failed to get protocol type code outpoint:", error);
    return null;
  }
}

export interface DeploymentResult {
  txHash: ccc.Hex;
  protocolTypeScript: {
    codeHash: ccc.Hex;
    hashType: ccc.HashType;
    args: ccc.Hex;
  };
  protocolCellOutPoint: {
    txHash: ccc.Hex;
    index: number;
  };
}

/**
 * Check protocol configuration status
 * @returns 'none' | 'partial' | 'complete'
 */
export function getProtocolConfigStatus(): "none" | "partial" | "complete" {
  // First check if protocol type contract is deployed
  const network = DeploymentManager.getCurrentNetwork();
  const protocolTypeDeployment = deploymentManager.getCurrentDeployment(
    network,
    "ckboostProtocolType"
  );

  if (!protocolTypeDeployment) {
    return "none"; // No protocol contract deployed
  }

  // Then check if protocol cell exists (via args)
  const args = process.env.NEXT_PUBLIC_PROTOCOL_TYPE_ARGS;

  if (!args || args === "" || args === "0x") {
    return "partial"; // Protocol contract deployed but no protocol cell
  }

  // NOTE: Even if args are set, the actual protocol cell might not exist on blockchain
  // This function returns config status based on environment, not blockchain state
  // The actual cell existence is checked when fetching data
  return "complete"; // Both protocol contract and cell are configured
}

/**
 * Get protocol deployment template with sensible defaults
 */
export function getProtocolDeploymentTemplate(): ProtocolDataLike {
  const network = DeploymentManager.getCurrentNetwork();
  const deployment = deploymentManager.getCurrentDeployment(
    network,
    "ckboostProtocolType"
  );

  return {
    protocol_config: {
      admin_lock_hash_vec: [], // To be filled by user's lock hash
      script_code_hashes: {
        // Use the typeHash which is the actual protocol contract code hash
        ckb_boost_protocol_type_code_hash:
          deployment?.typeHash ||
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        ckb_boost_protocol_lock_code_hash:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        ckb_boost_campaign_type_code_hash:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        ckb_boost_campaign_lock_code_hash:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        ckb_boost_user_type_code_hash:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        accepted_udt_type_scripts: [],
        accepted_dob_type_scripts: [],
      },
    },
    campaigns_approved: [],
    tipping_proposals: [],
    tipping_config: {
      // Default thresholds: 1000 CKB, 5000 CKB, 10000 CKB (in shannon, 1 CKB = 10^8 shannon)
      approval_requirement_thresholds: [
        100000000000n, // 1000 CKB
        500000000000n, // 5000 CKB
        1000000000000n, // 10000 CKB
      ],
      expiration_duration: 2592000, // 30 days in seconds
    },
    endorsers_whitelist: [],
    last_updated: 0,
  };
}

/**
 * Deploy a new protocol cell to the CKB blockchain using ssri-ckboost
 *
 * Flow:
 * 1. SSRI creates a transaction with the protocol data and TransactionRecipe in witness
 * 2. We add capacity inputs from the user's wallet
 * 3. We prepare witnesses for the new inputs (while preserving SSRI's recipe witness)
 * 4. We complete the transaction with fees
 * 5. The wallet signs the transaction (SSRI doesn't sign, it only provides the recipe)
 * 6. We send the signed transaction to the network
 *
 * @param signer - CCC signer instance
 * @param params - Protocol deployment parameters
 * @returns Deployment result with transaction hash and cell info
 */
export async function deployProtocolCell(
  signer: ccc.Signer,
  protocolData: ProtocolDataLike
): Promise<DeploymentResult> {
  try {
    console.log("=== Starting Protocol Cell Deployment ===");
    console.log("Signer info:", {
      isConnected: !!signer,
      hasClient: !!signer.client,
      signerType: signer.constructor.name,
    });

    // Validate parameters
    if (
      !protocolData.protocol_config.admin_lock_hash_vec ||
      protocolData.protocol_config.admin_lock_hash_vec.length === 0
    ) {
      throw new Error("At least one admin lock hash is required");
    }

    // Get protocol type code outpoint from deployments.json
    const protocolTypeCodeCellInfo = getProtocolTypeCodeOutPoint();
    if (!protocolTypeCodeCellInfo) {
      throw new Error(
        "Protocol type contract code cell not found. Make sure the protocol contract is deployed and deployment information is available."
      );
    }

    const { outPoint: protocolTypeCodeCell, deployment } =
      protocolTypeCodeCellInfo;

    // Create initial protocol data using ssri-ckboost Protocol class
    // Note: The Protocol.createProtocolData expects camelCase properties
    console.log("Creating protocolData:", {
      adminLockHashes: protocolData.protocol_config.admin_lock_hash_vec,
      tippingConfigThresholds:
        protocolData.tipping_config.approval_requirement_thresholds,
      endorsersCount: protocolData.endorsers_whitelist?.length || 0,
    });

    // For new protocol cell creation, we need the actual protocol type script
    // Use the typeHash from deployment as the code hash
    const protocolTypeScript = {
      codeHash:
        deployment?.typeHash ||
        "0x0000000000000000000000000000000000000000000000000000000000000000",
      hashType: "type" as const,
      args: "0x", // Empty args - SSRI will calculate and fill the Type ID
    };

    // Create SSRI executor for protocol operations
    // The executor URL should be configured based on environment
    const executorUrl =
      process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
    const executor = new ssri.ExecutorJsonRpc(executorUrl);

    // Create Protocol instance with executor
    // Pass the type script of the protocol cell (with empty args)
    const protocol = new Protocol(protocolTypeCodeCell, protocolTypeScript, {
      executor: executor,
    });

    // Use the Protocol's updateProtocol method to create the transaction
    // This method will handle all the complex transaction building
    let tx: ccc.Transaction;

    console.log("Calling SSRI updateProtocol with executor:", executorUrl);
    console.log("Protocol type script:", protocolTypeScript);

    // Only try to log protocol data properties if it exists
    if (protocolData && typeof protocolData === "object") {
      // Log the entire protocolData to see its structure
      console.log("Full protocol data:", protocolData);

      // Try different property access patterns
      const props = Object.keys(protocolData);
      console.log("Protocol data properties:", props);

      console.log("Protocol data preview:", {
        adminLockHashes:
          protocolData.protocol_config?.admin_lock_hash_vec || "N/A",
        lastUpdated: protocolData.last_updated || "N/A",
        hasEndorsers: protocolData.endorsers_whitelist?.length > 0 || false,
      });
    }

    try {
      const response = await protocol.updateProtocol(signer, protocolData);
      tx = response.res;

      console.log("SSRI response received successfully");
      console.log("Transaction in Hex:");
      console.log(ccc.hexFrom(tx.toBytes()));
    } catch (error) {
      console.error("SSRI updateProtocol failed:", error);

      // Check if it's an executor error
      if (
        error instanceof Error &&
        (error.message.includes("executor") || error.message.includes("fetch"))
      ) {
        // Provide guidance when SSRI executor is not ready
        throw new Error(
          `SSRI executor is not ready or not configured.\n\n` +
            `To deploy a protocol cell, you need:\n` +
            `1. The protocol type contract deployed (found in deployments.json)\n` +
            `2. A running SSRI executor server at: ${executorUrl}\n` +
            `3. Sufficient CKB balance in your wallet\n\n` +
            `Please check:\n` +
            `- Your SSRI executor server is running at ${executorUrl}\n` +
            `- Set NEXT_PUBLIC_SSRI_EXECUTOR_URL env variable if using a different URL\n` +
            `- Your wallet is connected and has sufficient balance\n` +
            `- The protocol type contract is properly deployed\n` +
            `- Try refreshing the page if the issue persists`
        );
      }
      throw error;
    }

    // Since this is a new deployment, we need to ensure it creates a Type ID cell
    // The transaction from updateProtocol should have the protocol cell as an output
    if (!tx || !tx.outputs || tx.outputs.length === 0) {
      throw new Error("Transaction does not include any outputs");
    }

    // For new cell creation, we need to ensure the transaction has inputs for capacity
    // The transaction needs inputs to pay for the new cell
    // Let's add capacity inputs
    await tx.completeInputsByCapacity(signer);

    // The fee rate is already in the correct unit (shannon/byte)
    // Ensure minimum of 1000 shannon/KB (1 shannon/byte)
    await tx.completeFeeBy(signer);

    // Convert transaction to hex for debugging
    const txHex = ccc.hexFrom(tx.toBytes());

    // Always print transaction hex for debugging
    console.log("=== Transaction Generated ===");
    console.log("Transaction hex:");
    console.log(txHex);
    console.log("\nTo debug this transaction offline, run:");
    console.log(`cd contracts/utils && cargo run -- "${txHex}"`);
    console.log("=============================\n");

    // Check if transaction is ready for signing
    if (!tx.inputs || tx.inputs.length === 0) {
      console.error("WARNING: Transaction has no inputs!");
    }
    if (!tx.outputs || tx.outputs.length === 0) {
      console.error("WARNING: Transaction has no outputs!");
    }
    if (!tx.witnesses || tx.witnesses.length === 0) {
      console.error("WARNING: Transaction has no witnesses!");
    }

    try {
      // Send the transaction
      console.log("Sending transaction to network...");
      console.log("This should trigger wallet signing...");
      console.log("Signer state before send:", {
        isConnected: !!signer,
        hasClient: !!signer.client,
        signerType: signer.constructor.name,
        addressAvailable: !!(await signer.getRecommendedAddress()),
      });

      // Log transaction details
      console.log("Transaction summary:", {
        inputsCount: tx.inputs.length,
        outputsCount: tx.outputs.length,
        witnessesCount: tx.witnesses.length,
        cellDepsCount: tx.cellDeps.length,
        hasSignatures: tx.witnesses.some((w) => w && w.length > 0),
      });

      console.log("About to call signer.sendTransaction...");

      // SSRI provides the TransactionRecipe in the witness but doesn't sign the transaction
      // We need to sign the transaction with the wallet
      console.log(
        "Transaction has witness with TransactionRecipe, needs wallet signing..."
      );

      // Check witness structure
      if (tx.witnesses && tx.witnesses.length > 0) {
        console.log("Witness count:", tx.witnesses.length);
        for (let i = 0; i < tx.witnesses.length; i++) {
          const witness = tx.witnesses[i];
          console.log(`Witness ${i}:`, {
            length: witness?.length || 0,
            hex: witness
              ? ccc.hexFrom(witness.slice(0, Math.min(100, witness.length))) +
                "..."
              : "empty",
          });

          // Try to parse as WitnessArgs
          try {
            if (witness && witness.length > 0) {
              const witnessArgs = ccc.WitnessArgs.decode(witness);
              console.log(`  WitnessArgs ${i}:`, {
                lock: witnessArgs.lock
                  ? `${witnessArgs.lock.length} bytes`
                  : "empty",
                inputType: witnessArgs.inputType
                  ? `${witnessArgs.inputType.length} bytes`
                  : "empty",
                outputType: witnessArgs.outputType
                  ? `${witnessArgs.outputType.length} bytes`
                  : "empty",
              });
            }
          } catch (e) {
            console.log(`  Not a valid WitnessArgs structure ${e}`);
          }
        }
      }

      // Sign and send the transaction
      console.log("Requesting wallet to sign transaction...");

      try {
        const txHash = await signer.sendTransaction(tx);
        console.log("Transaction sent successfully! TxHash:", txHash);

        // Extract the protocol cell's type script from the transaction
        // The protocol cell should be the first output with a type script
        let protocolTypeScript: {
          codeHash: ccc.Hex;
          hashType: ccc.HashType;
          args: ccc.Hex;
        } = {
          codeHash: deployment?.typeHash || "0x",
          hashType: "type" as ccc.HashType,
          args: "0x",
        };

        // Find the protocol cell in outputs (it should have a type script)
        for (let i = 0; i < tx.outputs.length; i++) {
          const output = tx.outputs[i];
          if (output.type) {
            // This should be the protocol cell with the calculated Type ID
            protocolTypeScript = {
              codeHash: ccc.hexFrom(output.type.codeHash),
              hashType: output.type.hashType,
              args: ccc.hexFrom(output.type.args),
            };
            console.log("Found protocol cell type script:", protocolTypeScript);
            break;
          }
        }

        return {
          txHash,
          protocolTypeScript,
          protocolCellOutPoint: {
            txHash,
            index: 0,
          },
        };
      } catch (sendError) {
        console.error("Transaction send failed:", sendError);

        // Check if it's a ScriptNotFound error
        const errorMessage = sendError instanceof Error ? sendError.message : String(sendError);
        if (errorMessage.includes("ScriptNotFound")) {
          const match = errorMessage.match(
            /code_hash: Byte32\((0x[a-fA-F0-9]+)\)/
          );
          const missingCodeHash = match ? match[1] : "unknown";

          if (
            missingCodeHash ===
            "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8"
          ) {
            throw new Error(
              "System script not found: secp256k1_blake160.\n\n" +
                "This is the default lock script that needs to be deployed on your network.\n" +
                "If you are using a local devnet, make sure to deploy system scripts.\n\n" +
                "Possible solutions:\n" +
                "1. Use CKB devnet with pre-deployed system scripts\n" +
                "2. Deploy the secp256k1_blake160 script manually\n" +
                "3. Configure SSRI to use a different lock script"
            );
          } else {
            throw new Error(
              `Script not found on chain: ${missingCodeHash}\n\n` +
                "The transaction references a script that is not deployed on the current network.\n" +
                "Please ensure all required scripts are deployed before attempting this operation."
            );
          }
        }

        // Check if it's a signing error
        if (
          sendError instanceof Error &&
          (sendError.message.includes("sign") ||
            sendError.message.includes("wallet"))
        ) {
          console.error("Wallet signing error. Transaction hex for debugging:");
          console.error(txHex);
          throw new Error(
            `Wallet signing failed: ${sendError.message}\n\n` +
              "Please check:\n" +
              "1. Your wallet is connected and unlocked\n" +
              "2. You have sufficient CKB balance\n" +
              "3. The transaction is properly formatted"
          );
        }

        throw sendError;
      }
    } catch (sendError) {
      // If transaction fails, print the hex for debugging
      console.error(
        "Transaction failed to send. Transaction hex for debugging:"
      );
      console.error(txHex);
      console.error("\nTo debug this transaction, run:");
      console.error(`cd contracts/utils && cargo run -- "${txHex}"`);
      throw sendError;
    }
  } catch (error) {
    console.error("Failed to deploy protocol cell:", error);
    throw error;
  }
}

/**
 * Generate environment configuration for deployed protocol
 */
export function generateEnvConfig(result: DeploymentResult): string {
  return `# Generated CKBoost Protocol Configuration
# Add these to your .env file

NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH=${result.protocolTypeScript.codeHash}
NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE=${result.protocolTypeScript.hashType}
NEXT_PUBLIC_PROTOCOL_TYPE_ARGS=${result.protocolTypeScript.args}

# Protocol Cell Information (for reference)
# Transaction: ${result.txHash}
# Cell OutPoint: ${result.protocolCellOutPoint.txHash}:${result.protocolCellOutPoint.index}
`;
}

/**
 * Validate protocol deployment parameters
 */
export function validateDeploymentParams(
  protocolData: ProtocolDataLike
): string[] {
  const errors: string[] = [];

  if (
    !protocolData.protocol_config.admin_lock_hash_vec ||
    protocolData.protocol_config.admin_lock_hash_vec.length === 0
  ) {
    errors.push("At least one admin lock hash is required");
  }

  protocolData.protocol_config.admin_lock_hash_vec.forEach((hash, index) => {
    if (!/^0x[a-fA-F0-9]{64}$/.test(ccc.hexFrom(hash))) {
      errors.push(
        `Admin lock hash ${index + 1} is not a valid 32-byte hex string`
      );
    }
  });

  // Validate script code hashes
  const scriptFields = [
    "ckb_boost_protocol_type_code_hash",
    "ckb_boost_protocol_lock_code_hash",
    "ckb_boost_campaign_type_code_hash",
    "ckb_boost_campaign_lock_code_hash",
    "ckb_boost_user_type_code_hash",
  ] as const;

  scriptFields.forEach((field) => {
    const hash = protocolData.protocol_config.script_code_hashes[field];
    if (!/^0x[a-fA-F0-9]{64}$/.test(ccc.hexFrom(hash))) {
      errors.push(`${field} is not a valid 32-byte hex string`);
    }
  });

  // Validate tipping config
  if (
    !protocolData.tipping_config.approval_requirement_thresholds ||
    protocolData.tipping_config.approval_requirement_thresholds.length === 0
  ) {
    errors.push("At least one approval requirement threshold is required");
  }

  protocolData.tipping_config.approval_requirement_thresholds.forEach(
    (threshold, index) => {
      if (!/^\d+$/.test(threshold.toString())) {
        errors.push(`Approval threshold ${index + 1} must be a valid number`);
      }
    }
  );

  if (
    ccc.numFrom(protocolData.tipping_config.expiration_duration) <
    ccc.numFrom(3600)
  ) {
    errors.push("Expiration duration must be at least 1 hour (3600 seconds)");
  }

  if (
    ccc.numFrom(protocolData.tipping_config.expiration_duration) >
    ccc.numFrom(30 * 24 * 60 * 60)
  ) {
    errors.push(
      "Expiration duration must be at most 30 days (2592000 seconds)"
    );
  }

  return errors;
}

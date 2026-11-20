import { ccc, ssri } from "@ckb-ccc/connector-react";
import {
  fetchAchievementCell,
  toAchievementEntries,
  type AchievementEntry,
  type AchievementDefinitionInput,
  type AchievementCellDeploymentResult,
} from "../ckb/achievement-cells";
import { deploymentManager } from "../ckb/deployment-manager";
import { getLatestUserCellByAddress } from "../ckb/user-cells";
import type {
  AchievementRecordLike,
  AchievementDataLike,
  ProtocolDataLike,
} from "ssri-ckboost/types";
import type { AchievementQueryResponse } from "@/netlify/lib/achievement/types";
import { Achievement } from "ssri-ckboost";
import { AchievementDataVec, ConnectedTypeID } from "ssri-ckboost/types";
import { getAchievementTypeCodeOutPoint } from "../ckb/achievement-cells";
import { sendTransactionWithFeeRetry } from "../ckb/transaction-wrapper";
import { injectProxyAuthenticationCell } from "../utils/api";
import { fetchProtocolCell } from "../ckb/protocol-cells";
import { createScopedLogger } from "ssri-ckboost";
import { registerPendingTransaction } from "@/lib/pending-transactions";

const log = createScopedLogger("AchievementService");

const ZERO_TYPE_ID = ccc.hexFrom(
  "0x0000000000000000000000000000000000000000000000000000000000000000"
) as ccc.Hex;

/**
 * Shape of an achievement enriched with completion status for a particular
 * user.
 */
export interface UserAchievement {
  /** Canonical achievement identifier, sourced from metadata. */
  id: string;
  /** Human readable title. */
  title: string;
  /** Nostr nevent ID referencing the off-chain metadata payload. */
  metadataNeventId: string;
  /** Underlying Molecule data for advanced consumers. */
  raw: AchievementDataLike;
  /** Whether the referenced user already completed this achievement. */
  completed: boolean;
  /** Timestamp (CKB epoch time in shannon) when the achievement was granted. */
  grantedAt?: bigint;
  /** Receiver record that granted the achievement, if any. */
  record?: AchievementRecordLike;
}

/**
 * High-level service that exposes achievement-centric operations:
 *
 * - Enumerating achievements stored in the dedicated achievements cell.
 * - Resolving the completion status for a user wallet.
 * - Submitting prepared transactions to the Netlify validation endpoint.
 *
 * The class mirrors the ergonomics of other domain services in `dapp/lib`,
 * keeping blockchain access encapsulated while remaining framework agnostic.
 */
export class AchievementService {
  private readonly client: ccc.Client;
  private readonly achievementTypeCodeHash: ccc.Hex;
  private signer?: ccc.Signer;
  private achievementInstance: Achievement | null = null;

  /**
   * Instantiate an achievement service.
   *
   * @param client - CCC client used for chain queries.
   */
  constructor(
    client: ccc.Client,
    achievementTypeCodeHash: ccc.Hex,
    signer?: ccc.Signer
  ) {
    this.client = client;

    this.achievementTypeCodeHash = ccc.hexFrom(
      achievementTypeCodeHash
    ) as ccc.Hex;
    this.signer = signer;
  }

  setSigner(signer: ccc.Signer | undefined): void {
    this.signer = signer;
    this.achievementInstance = null;
  }

  /**
   * Retrieve the single achievements cell for the current protocol.
   *
   * @returns The achievements cell.
   * @throws Error when the cell is missing to surface misconfiguration early.
   */
  async getAchievementCell(protocolTypeHash?: ccc.Hex): Promise<ccc.Cell> {
    const cell = await fetchAchievementCell(
      this.client,
      this.achievementTypeCodeHash,
      {
        protocolTypeHash,
      }
    );
    if (!cell) {
      throw new Error(
        "Achievements cell not found on-chain. Ensure the achievements contract was deployed."
      );
    }
    return cell;
  }

  /**
   * List all achievements as defined in the on-chain achievements cell.
   *
   * @returns Achievements with metadata and raw Molecule structures.
   */
  async listAchievements(
    protocolTypeHash?: ccc.Hex
  ): Promise<AchievementEntry[]> {
    const cell = await this.getAchievementCell(protocolTypeHash);
    return toAchievementEntries(cell);
  }

  /**
   * Resolve achievement completion status for a particular user address.
   *
   * @param userAddress - CKB address identifying the user.
   * @returns Collection describing completion state for each achievement.
   */
  async getUserAchievements(
    userAddress: string,
    protocol_data: ProtocolDataLike,
    protocolTypeHash: ccc.Hex
  ): Promise<UserAchievement[]> {
    const achievementCell = await this.getAchievementCell(protocolTypeHash);
    const entries = toAchievementEntries(achievementCell);

    const userCell = await getLatestUserCellByAddress(
      userAddress,
      this.client,
      ccc.hexFrom(
        protocol_data.protocol_config.script_code_hashes
          .ckb_boost_user_type_code_hash
      ),
      protocolTypeHash
    );

    if (!userCell || !userCell.cellOutput.type) {
      log.warn("User cell not found for address:", userAddress);
      return entries.map((entry) => ({
        id: this.extractAchievementId(entry),
        title: entry.title,
        metadataNeventId: entry.metadataNeventId,
        raw: entry.raw,
        completed: false,
      }));
    }

    const userTypeHash = userCell.cellOutput.type.hash();
    const status: UserAchievement[] = [];

    for (const entry of entries) {
      const id = this.extractAchievementId(entry);
      const record = entry.records.find((receiver) => {
        const receiverHash = ccc
          .hexFrom(receiver.receiver_user_type_hash)
          .toLowerCase();
        return receiverHash === userTypeHash.toLowerCase();
      });

      status.push({
        id,
        title: entry.title,
        metadataNeventId: entry.metadataNeventId,
        raw: entry.raw,
        completed: Boolean(record),
        grantedAt: record ? BigInt(ccc.numFrom(record.granted_at)) : undefined,
        record,
      });
    }

    return status;
  }

  /**
   * Submit a prepared claim transaction to the Netlify validation endpoint for
   * final attestation. This helper does not build the transaction; instead, it
   * forwards the draft to the serverless function that performs deep checks and
   * re-signs the payload.
   *
   * @param params - Request parameters.
   * @param params.tx - Transaction instance or hex string representing the claim.
   * @param params.userAddress - Address of the claimant, forwarded to the validator.
   * @param params.endpoint - Optional relative endpoint. Defaults to `/api/achievement-validate`.
   * @returns Validation outcome as returned by the serverless function.
   */
  async claimAchievements(
    grantableAchievements: string[],
    userAddress: string,
    protocolTypeHash: ccc.Hex,
    signer: ccc.Signer
  ): Promise<ccc.Hex> {
    const achievementCell = await this.getAchievementCell(protocolTypeHash);
    const achievementDataVec = AchievementDataVec.decode(
      ccc.hexFrom(achievementCell.outputData)
    ) as AchievementDataLike[];
    const userTypeCodeHash = deploymentManager.getContractCodeHash(
      deploymentManager.getCurrentNetwork(),
      "ckboostUserType"
    );
    if (!userTypeCodeHash) {
      throw new Error("User type code hash not found");
    }
    const userCell = await getLatestUserCellByAddress(
      userAddress,
      this.client,
      userTypeCodeHash,
      protocolTypeHash
    );
    if (!userCell || !userCell.cellOutput.type) {
      throw new Error("User cell not found");
    }
    for (const achievement of achievementDataVec) {
      if (grantableAchievements.includes(achievement.achievement_title)) {
        achievement.receiver_user_record_vec.push({
          receiver_user_type_hash: userCell.cellOutput.type?.hash() ?? "",
          granted_at: ccc.numFrom(Date.now()),
        });
      }
    }
    const protocolCell = await fetchProtocolCell(this.client);
    if (!protocolCell) {
      throw new Error("Protocol cell not found");
    }
    const emptyTx = ccc.Transaction.from({});
    const achievementInstance = await this.ensureAchievementInstance(
      protocolCell,
      achievementCell
    );
    const txResponse = await achievementInstance.claimAchievement(emptyTx);
    if (!txResponse) {
      throw new Error("Failed to claim achievements");
    }
    const tx = txResponse.res;
    tx.addInput(achievementCell);
    tx.addOutput(
      achievementCell.cellOutput,
      ccc.hexFrom(AchievementDataVec.encode(achievementDataVec))
    );
    const protocolLockOutPoint = deploymentManager.getContractOutPoint(
      deploymentManager.getCurrentNetwork(),
      "ckboostProtocolLock"
    );
    if (!protocolLockOutPoint) {
      throw new Error("Protocol lock out point not found");
    }
    tx.addCellDeps({
      outPoint: protocolLockOutPoint,
      depType: "code",
    });

    const achievementTypeOutPoint = getAchievementTypeCodeOutPoint(
      deploymentManager.getCurrentNetwork()
    );
    if (!achievementTypeOutPoint) {
      throw new Error("Achievement type out point not found");
    }
    tx.addCellDeps({
      outPoint: achievementTypeOutPoint,
      depType: "code",
    });

    tx.addCellDeps({
      outPoint: protocolCell.outPoint,
      depType: "code",
    });

    await injectProxyAuthenticationCell(signer, tx);
    await tx.completeInputsByCapacity(signer);

    for (let i = 0; i < tx.inputs.length; i++) {
      const inputCell = await signer.client.getCell(
        tx.inputs[i].previousOutput
      );
      if (!inputCell) {
        throw new Error("Input cell not found");
      }
      tx.inputs[i] = ccc.CellInput.from({
        previousOutput: inputCell?.outPoint,
        since: "0x0",
        cellOutput: inputCell?.cellOutput,
      });
    }

    for (let i = 0; i < tx.outputs.length; i++) {
      const out = tx.outputs[i];
      if (out.type) {
        tx.outputs[i] = ccc.CellOutput.from(
          { lock: out.lock, type: out.type },
          tx.outputsData[i] as ccc.HexLike
        );
      }
    }
    await tx.completeFeeBy(signer);

    log.info("Calling /api/achievement-validate");
    log.log("tx", ccc.stringify(tx));
    log.log("txHex", ccc.hexFrom(tx.toBytes()));
    log.log("userAddress", userAddress);
    const resp = await fetch("/api/achievement-validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ txHex: ccc.hexFrom(tx.toBytes()), userAddress }),
    });
    if (!resp.ok) {
      log.error("Achievement validation failed at server");
      throw new Error("Achievement validation failed at server");
    }

    const responseJson = await resp.json();
    log.info("response from achievement-validate", responseJson);
    const validatedTx = ccc.Transaction.fromBytes(responseJson.txHex);
    log.log("validatedTx from bytes", ccc.stringify(validatedTx));
    for (let i = 0; i < validatedTx.inputs.length; i++) {
      const inputCell = await signer.client.getCell(
        validatedTx.inputs[i].previousOutput
      );
      if (!inputCell) {
        throw new Error("Input cell not found");
      }
      validatedTx.inputs[i] = ccc.CellInput.from({
        previousOutput: inputCell?.outPoint,
        since: "0x0",
        cellOutput: inputCell?.cellOutput,
      });
    }

    for (let i = 0; i < validatedTx.outputs.length; i++) {
      const out = validatedTx.outputs[i];
      if (out.type) {
        validatedTx.outputs[i] = ccc.CellOutput.from(
          { lock: out.lock, type: out.type },
          validatedTx.outputsData[i] as ccc.HexLike
        );
      }
    }
    log.info(
      "validatedTx after modifying inputs and outputs",
      ccc.stringify(validatedTx)
    );
    log.log("validatedTx after signing", ccc.stringify(validatedTx));
    const txHash = await signer.sendTransaction(validatedTx);
    registerPendingTransaction(txHash, {
      label: "Achievement claim",
      context: "AchievementService",
    });
    return txHash;
  }

  /**
   * Preview which achievements would be granted by submitting the provided
   * transaction without mutating anything on-chain. Leverages the Netlify
   * `achievement-query` function which performs the same validation checks as
   * the signing endpoint.
   *
   * @param params - Request parameters.
   * @param params.tx - Transaction instance or hex string representing the claim attempt.
   * @param params.userAddress - Address of the claimant.
   * @param params.endpoint - Optional relative endpoint. Defaults to `/api/achievement-query`.
   * @returns Server evaluation describing potential grants or validation errors.
   */
  async previewClaim(params: {
    tx?: ccc.Transaction | string;
    userAddress: string;
    endpoint?: string;
  }): Promise<AchievementQueryResponse> {
    const { tx, userAddress } = params;
    const endpoint = params.endpoint ?? "/api/achievement-query";
    const body: Record<string, unknown> = { userAddress };
    if (typeof tx !== "undefined") {
      const txHex = typeof tx === "string" ? tx : ccc.hexFrom(tx.toBytes());
      if (txHex && txHex.trim().length > 0) {
        body.txHex = txHex;
      }
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as AchievementQueryResponse;
    if (!response.ok) {
      return payload;
    }
    return payload;
  }

  async deployAchievementCell(params: {
    signer?: ccc.Signer;
    protocolCell: ccc.Cell;
    achievements: AchievementDefinitionInput[];
  }): Promise<AchievementCellDeploymentResult> {
    const signer = params.signer ?? this.requireSigner();
    const protocolTypeScript = params.protocolCell.cellOutput.type;
    if (!protocolTypeScript) {
      throw new Error("Protocol cell is missing a type script hash.");
    }

    const protocolTypeHash = ccc.hexFrom(protocolTypeScript.hash()) as ccc.Hex;
    const network = deploymentManager.getCurrentNetwork();
    const codeOutPoint = getAchievementTypeCodeOutPoint(network);
    if (!codeOutPoint) {
      throw new Error(
        "Achievement type contract out-point missing in deployments.json."
      );
    }

    const executorUrl =
      process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
    const executor = new ssri.ExecutorJsonRpc(executorUrl);

    const achievementTypeScript = ccc.Script.from({
      codeHash: this.achievementTypeCodeHash,
      hashType: "type" as const,
      args: "0x",
    });

    const achievementInstance = new Achievement(
      codeOutPoint,
      achievementTypeScript,
      params.protocolCell,
      { executor }
    );

    const dataLike = this.normalizeDefinitions(params.achievements);

    const response = await achievementInstance.updateAchievement(
      signer,
      dataLike
    );

    const tx = response.res;
    const achievementCellIndex = tx.outputs.findIndex(
      (output) => output.type?.codeHash === this.achievementTypeCodeHash
    );
    if (achievementCellIndex === -1) {
      throw new Error("Achievement cell output not found in transaction");
    }
    const rawConnectedTypeId = tx.outputs[achievementCellIndex].type?.args;
    if (!rawConnectedTypeId) {
      throw new Error("Raw connected type id not found in transaction");
    }
    const connectedTypeId = ConnectedTypeID.decode(rawConnectedTypeId);
    connectedTypeId.connected_key = protocolTypeHash;
    const updatedConnectedTypeIdBytes = ConnectedTypeID.encode(connectedTypeId);
    const updatedConnectedTypeIdArgs = ccc.hexFrom(updatedConnectedTypeIdBytes);
    if (tx.outputs[achievementCellIndex].type) {
      tx.outputs[achievementCellIndex].type.args = updatedConnectedTypeIdArgs;
    }

    tx.addCellDeps({
      outPoint: params.protocolCell.outPoint,
      depType: "code",
    });

    // Implement protocol lock for achievement cell
    const protocolLockCodeHash = deploymentManager.getContractCodeHash(
      network,
      "ckboostProtocolLock"
    );
    if (!protocolLockCodeHash) {
      throw new Error("Protocol lock code hash not found");
    }
    const protocolLockCodeOutPoint = deploymentManager.getContractOutPoint(
      network,
      "ckboostProtocolLock"
    );
    if (!protocolLockCodeOutPoint) {
      throw new Error("Protocol lock code out point not found");
    }
    tx.addCellDeps({
      outPoint: {
        txHash: protocolLockCodeOutPoint.txHash,
        index: protocolLockCodeOutPoint.index,
      },
      depType: "code",
    });
    const currentUserLock = (await signer.getRecommendedAddressObj()).script;
    const protocolLockConnectedTypeId = ConnectedTypeID.encode({
      type_id: currentUserLock.hash(),
      connected_key: protocolTypeHash,
    });
    const protocolLockConnectedTypeIdArgs = ccc.hexFrom(
      protocolLockConnectedTypeId
    );
    const protocolLockTypeScript = ccc.Script.from({
      codeHash: protocolLockCodeHash,
      hashType: "type",
      args: protocolLockConnectedTypeIdArgs,
    });
    tx.outputs[achievementCellIndex].lock = protocolLockTypeScript;
    const txHash = await sendTransactionWithFeeRetry(signer, tx);

    this.achievementInstance = null;
    return {
      txHash,
      typeId: connectedTypeId.type_id,
      outputIndex: tx.outputs.length - 1,
      connectedTypeId: {
        type_id: connectedTypeId.type_id,
        connected_key: connectedTypeId.connected_key,
      },
    };
  }

  async updateAchievementCell(params: {
    signer?: ccc.Signer;
    protocolCell: ccc.Cell;
    protocolTypeHash: ccc.Hex;
    achievements: AchievementDefinitionInput[];
  }): Promise<string> {
    console.log("Updating achievement cell", params);
    const signer = params.signer ?? this.requireSigner();
    const achievementCell = await this.getAchievementCell(
      params.protocolTypeHash
    );

    const achievementInstance = await this.ensureAchievementInstance(
      params.protocolCell,
      achievementCell
    );

    const dataLike = this.normalizeDefinitions(params.achievements);

    const txDraft = ccc.Transaction.from({});
    await txDraft.addInput(achievementCell);

    const response = await achievementInstance.updateAchievement(
      signer,
      dataLike,
      txDraft
    );

    const tx = response.res;
    await tx.addOutput(
      achievementCell.cellOutput,
      ccc.hexFrom(AchievementDataVec.encode(dataLike))
    );
    await tx.addCellDeps({
      outPoint: params.protocolCell.outPoint,
      depType: "code",
    });
    const protocolLockCodeOutPoint = deploymentManager.getContractOutPoint(
      deploymentManager.getCurrentNetwork(),
      "ckboostProtocolLock"
    );
    if (!protocolLockCodeOutPoint) {
      throw new Error("Protocol lock code out point not found");
    }
    tx.addCellDeps({
      outPoint: protocolLockCodeOutPoint,
      depType: "code",
    });
    const txHash = await sendTransactionWithFeeRetry(signer, tx);
    return txHash;
  }

  /**
   * Extract the canonical achievement identifier prioritising the stored nevent
   * reference and falling back to a normalized title when absent.
   *
   * @param entry - Achievement entry produced by {@link toAchievementEntries}.
   * @returns Stable identifier useful for React keys or state management.
   */
  private extractAchievementId(entry: AchievementEntry): string {
    const nevent = entry.metadataNeventId?.trim();
    if (nevent) {
      return nevent;
    }

    const title = entry.title.trim();
    if (title.length > 0) {
      return title.toLowerCase().replace(/\s+/g, "-");
    }

    return `achievement-${entry.raw.achievement_title.toString()}`;
  }

  private requireSigner(): ccc.Signer {
    if (!this.signer) {
      throw new Error("Wallet connection required");
    }
    return this.signer;
  }

  private normalizeDefinitions(
    defs: AchievementDefinitionInput[]
  ): AchievementDataLike[] {
    return defs.map((definition) => ({
      achievement_title: definition.achievement_title,
      achievement_metadata: definition.achievement_metadata,
      receiver_user_record_vec: definition.receiver_user_record_vec ?? [],
    }));
  }

  private async ensureAchievementInstance(
    protocolCell: ccc.Cell,
    achievementCell: ccc.Cell
  ): Promise<Achievement> {
    if (this.achievementInstance) {
      return this.achievementInstance;
    }

    const network = deploymentManager.getCurrentNetwork();
    const codeOutPoint = getAchievementTypeCodeOutPoint(network);
    if (!codeOutPoint) {
      throw new Error(
        "Achievement type contract out-point missing in deployments.json."
      );
    }

    const typeScript = achievementCell.cellOutput.type;
    if (!typeScript) {
      throw new Error("Achievement cell is missing type script");
    }

    const executorUrl =
      process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
    const executor = new ssri.ExecutorJsonRpc(executorUrl);

    this.achievementInstance = new Achievement(
      codeOutPoint,
      typeScript,
      protocolCell,
      { executor }
    );

    return this.achievementInstance;
  }
}

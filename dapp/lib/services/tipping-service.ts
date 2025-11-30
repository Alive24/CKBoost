import { ccc, ssri, udt } from "@ckb-ccc/connector-react";
import {
  ConnectedTypeID,
  TippingData,
  type TippingDataLike,
  type ProtocolDataLike,
  type UDTAssetLike,
  ProtocolData,
} from "ssri-ckboost/types";
import { Tipping, type FundingPoolSummary } from "ssri-ckboost";
import { deploymentManager } from "../ckb/deployment-manager";
import {
  fetchTippingByTypeId,
  fetchTippingsConnectedToProtocol,
  extractTypeIdFromTippingCell,
} from "../ckb/tipping-cells";
import { sendTransactionWithFeeRetry } from "../ckb/transaction-wrapper";
import { TippingInfo } from "../providers/tipping-provider";
import { udtRegistry } from "./udt-registry";
import { createScopedLogger } from "ssri-ckboost";
import { injectProxyAuthenticationCell } from "../utils/api";
import type {
  TippingReleaseRequestPayload,
  TippingReleaseResponse,
} from "@/netlify/lib/tipping-release";

const log = createScopedLogger("TippingService");

export class TippingService {
  private signer?: ccc.Signer;
  private tipping: Tipping | null;
  private readonly protocolCell: ccc.Cell;
  private readonly tippingTypeCodeHash: ccc.Hex;
  private udtInstances: Map<string, udt.Udt>;
  private protocolDataCache?: ReturnType<typeof ProtocolData.decode>;

  constructor(
    signer: ccc.Signer | undefined,
    tipping: Tipping | null,
    protocolCell: ccc.Cell
  ) {
    this.signer = signer;
    this.tipping = tipping;
    this.protocolCell = protocolCell;

    const network = deploymentManager.getCurrentNetwork();
    const codeHash = deploymentManager.getContractCodeHash(
      network,
      "ckboostTippingType"
    );
    if (!codeHash) {
      throw new Error("Tipping type contract not deployed");
    }
    this.tippingTypeCodeHash = codeHash;
    this.udtInstances = new Map();

    if (signer) {
      this.initializeUdtInstancesFromRegistry().catch((error) => {
        log.error("Failed to initialise tipping UDT instances", error);
      });
    }
  }

  setSigner(signer: ccc.Signer | undefined) {
    this.signer = signer;
    if (signer) {
      this.initializeUdtInstancesFromRegistry().catch((error) => {
        log.error("Failed to initialise tipping UDT instances", error);
      });
    }
  }

  setTipping(tipping: Tipping | null) {
    this.tipping = tipping;
  }

  /**
   * Propose or update a tipping on-chain via SSRI executor
   */
  async updateTipping(
    tippingData: TippingDataLike,
    tx?: ccc.Transaction
  ): Promise<string> {
    if (!this.signer) {
      throw new Error("Wallet connection required to propose tipping");
    }

    const tipping = await this.ensureTippingInstance();
    if (!tipping) {
      throw new Error("Unable to initialise tipping executor context");
    }

    const normalizedData = this.cloneTippingData(tippingData);
    const supportersCount = normalizedData.supporter_lock_hashes.length;
    const requiredApprovals = this.calculateRequiredApprovals(normalizedData);

    let draftTx = ccc.Transaction.from(tx ?? {});

    if (supportersCount >= requiredApprovals) {
      if (normalizedData.status?.toLowerCase?.() !== "granted") {
        normalizedData.status = "granted";
      }
      if (!normalizedData.granted_at) {
        normalizedData.granted_at = BigInt(Date.now());
      }

      const shortage = await this.calculateFundingShortage(normalizedData);
      if (shortage) {
        throw new InsufficientTippingFundingError(shortage);
      }

      draftTx = await this.prepareRewardDistribution(
        draftTx,
        tipping,
        normalizedData
      );
    } else if (normalizedData.status?.toLowerCase?.() === "granted") {
      normalizedData.status = supportersCount === 0 ? "created" : "approved";
    }

    try {
      const updateTippingTx = await tipping.updateTipping(
        this.signer,
        normalizedData,
        draftTx
      );
      const network = deploymentManager.getCurrentNetwork();
      const protocolLockCodeHash = deploymentManager.getContractCodeHash(
        network,
        "ckboostProtocolLock"
      );
      if (!protocolLockCodeHash) {
        throw new Error("Tipping type contract not deployed");
      }
      const protocolLockCodeOutPoint = deploymentManager.getContractOutPoint(
        network,
        "ckboostProtocolLock"
      );
      if (!protocolLockCodeHash || !protocolLockCodeOutPoint) {
        throw new Error("Tipping type contract not deployed");
      }
      updateTippingTx.res.addCellDeps({
        outPoint: {
          txHash: protocolLockCodeOutPoint.txHash,
          index: protocolLockCodeOutPoint.index,
        },
        depType: "code",
      });
      const currentUserLock = (await this.signer.getRecommendedAddressObj())
        .script;
      const protocolTypeHash = this.protocolCell.cellOutput.type?.hash();
      if (!protocolTypeHash) {
        throw new Error("Protocol type hash not found");
      }
      const connectedIDforProtocolLock = ConnectedTypeID.encode({
        type_id: currentUserLock.hash(),
        connected_key: protocolTypeHash,
      });

      // For new Find the tipping cell and replace the lock with the protocol lock
      const outputTippingCell = updateTippingTx.res.outputs.find(
        (output) => output.type?.codeHash === this.tippingTypeCodeHash
      );
      const inputTippingCell = updateTippingTx.res.inputs.find(
        (input) => input.cellOutput?.type?.codeHash === this.tippingTypeCodeHash
      );
      if (outputTippingCell && !inputTippingCell) {
        outputTippingCell.lock = ccc.Script.from({
          codeHash: protocolLockCodeHash,
          hashType: outputTippingCell.lock.hashType,
          args: ccc.hexFrom(connectedIDforProtocolLock),
        });
      }

      const shouldReleaseViaProxy =
        normalizedData.status?.toLowerCase?.() === "granted";
      if (shouldReleaseViaProxy) {
        return await this.releaseViaProxy(updateTippingTx.res);
      }

      return await sendTransactionWithFeeRetry(
        this.signer,
        updateTippingTx.res
      );
    } catch (error) {
      log.error("Failed to propose tipping", error);
      throw error;
    }
  }

  private async releaseViaProxy(tx: ccc.Transaction): Promise<string> {
    const signer = this.requireSigner();

    await injectProxyAuthenticationCell(signer, tx);
    await tx.completeInputsByCapacity(signer);
    await tx.completeFeeBy(signer);

    for (let i = 0; i < tx.inputs.length; i += 1) {
      const inputCell = await signer.client.getCell(tx.inputs[i].previousOutput);
      if (!inputCell) {
        throw new Error(
          "Input cell not found while preparing tipping release tx."
        );
      }
      tx.inputs[i] = ccc.CellInput.from({
        previousOutput: inputCell.outPoint,
        since: tx.inputs[i].since ?? "0x0",
        cellOutput: inputCell.cellOutput,
        outputData: inputCell.outputData,
      });
    }

    for (let i = 0; i < tx.outputs.length; i += 1) {
      const out = tx.outputs[i];
      if (out.type) {
        tx.outputs[i] = ccc.CellOutput.from(
          { lock: out.lock, type: out.type },
          tx.outputsData[i] as ccc.HexLike
        );
      }
    }

    const tippingTypeId = this.extractTippingTypeIdFromTx(tx);

    const requestBody: TippingReleaseRequestPayload = {
      txHex: ccc.hexFrom(tx.toBytes()),
      ...(tippingTypeId ? { tippingTypeId } : {}),
    };

    const response = await fetch("/api/tipping-release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const payload = (await response.json()) as TippingReleaseResponse;
    if (!payload.success) {
      throw new Error(
        payload.message ||
          payload.error ||
          "Tipping release validation failed on server."
      );
    }

    if (!response.ok) {
      throw new Error(
        `Tipping release validation failed (status ${response.status}).`
      );
    }

    const validatedTx = ccc.Transaction.fromBytes(payload.txHex as ccc.Hex);

    for (let i = 0; i < validatedTx.inputs.length; i += 1) {
      const inputCell = await signer.client.getCell(
        validatedTx.inputs[i].previousOutput
      );
      if (!inputCell) {
        throw new Error(
          "Input cell not found while finalising tipping release tx."
        );
      }
      validatedTx.inputs[i] = ccc.CellInput.from({
        previousOutput: inputCell.outPoint,
        since: validatedTx.inputs[i].since ?? "0x0",
        cellOutput: inputCell.cellOutput,
        outputData: inputCell.outputData,
      });
    }

    for (let i = 0; i < validatedTx.outputs.length; i += 1) {
      const out = validatedTx.outputs[i];
      if (out.type) {
        validatedTx.outputs[i] = ccc.CellOutput.from(
          { lock: out.lock, type: out.type },
          validatedTx.outputsData[i] as ccc.HexLike
        );
      }
    }

    const txHash = await signer.sendTransaction(validatedTx);
    log.info("Tipping release submitted via proxy", {
      txHash,
      tippingTypeId: tippingTypeId ?? "unknown",
    });

    return txHash;
  }

  private extractTippingTypeIdFromTx(
    tx: ccc.Transaction
  ): ccc.Hex | undefined {
    const tippingOutput = tx.outputs.find(
      (output) => output.type?.codeHash === this.tippingTypeCodeHash
    );
    if (!tippingOutput?.type?.args) {
      return undefined;
    }

    try {
      const decoded = ConnectedTypeID.decode(
        ccc.bytesFrom(tippingOutput.type.args)
      );
      return ccc.hexFrom(
        (decoded as unknown as { type_id: ccc.HexLike }).type_id
      ) as ccc.Hex;
    } catch (error) {
      log.warn("Failed to extract tipping type id from transaction", error);
      return undefined;
    }
  }

  /**
   * Aggregate the shared funding pool locked by the protocol funding lock
   */
  async getFundingSummary(): Promise<FundingPoolSummary | null> {
    if (!this.signer) {
      return null;
    }

    const tipping = await this.ensureTippingInstance();
    if (!tipping) {
      return null;
    }

    try {
      return await tipping.collectFundingPool(this.signer);
    } catch (error) {
      log.error("Failed to collect funding pool summary", error);
      return null;
    }
  }

  /**
   * Fund the protocol-level tipping pool with raw CKB capacity. Capacity value
   * must be provided in shannons.
   */
  async fundProtocolWithCKB(amount: bigint): Promise<string> {
    const signer = this.requireSigner();
    if (amount <= 0n) {
      throw new Error("Funding amount must be greater than zero");
    }

    const fundingLock = await this.getFundingLockScript();
    const tx = ccc.Transaction.from({});

    const output = ccc.CellOutput.from({
      capacity: amount,
      lock: fundingLock,
    });
    await tx.addOutput(output, "0x");

    await tx.completeInputsByCapacity(signer);
    await tx.completeFeeBy(signer);

    const txHash = await sendTransactionWithFeeRetry(signer, tx);
    return txHash;
  }

  /**
   * Fund the shared tipping pool with UDT assets. Amounts should already be
   * provided in minimal units according to each token's decimals.
   */
  async fundProtocolWithUDT(udtAssets: UDTAssetLike[]): Promise<string> {
    const signer = this.requireSigner();
    if (!udtAssets || udtAssets.length === 0) {
      throw new Error("No UDT assets specified for funding");
    }

    const fundingLock = await this.getFundingLockScript();
    let tx = ccc.Transaction.from({});

    for (const asset of udtAssets) {
      const udtScript = ccc.Script.from(asset.udt_script);
      const amount = ccc.numFrom(asset.amount);

      if (amount <= 0n) {
        throw new Error("UDT funding amount must be greater than zero");
      }

      const udtInstance = await this.getUdtInstance(udtScript);
      const transfer = await udtInstance.transfer(
        signer,
        [
          {
            to: fundingLock,
            amount,
          },
        ],
        tx
      );

      if (!transfer.res) {
        throw new Error("UDT transfer failed to produce a transaction");
      }

      tx = transfer.res;
      await udtInstance.completeBy(tx, signer);
    }

    await tx.completeInputsByCapacity(signer);
    await tx.completeFeeBy(signer);

    const txHash = await sendTransactionWithFeeRetry(signer, tx);
    return txHash;
  }

  /**
   * Fetch tippings referenced by protocol data (Byte32 identifiers)
   */
  async fetchTippingsByIds(
    typeIds: ccc.HexLike[],
    client: ccc.Client
  ): Promise<TippingInfo[]> {
    const results = await Promise.all(
      typeIds.map(async (typeId) => {
        const cell = await fetchTippingByTypeId(
          typeId as ccc.Hex,
          this.tippingTypeCodeHash,
          client,
          this.protocolCell
        );

        if (!cell) {
          return null;
        }

        try {
          const data = TippingData.decode(cell.outputData);
          const extractedTypeId =
            extractTypeIdFromTippingCell(cell) ?? (typeId as ccc.Hex);

          return {
            typeId: extractedTypeId,
            cell,
            data,
            metadata: data.metadata,
            comments: [],
            additionalTips: [],
          } as TippingInfo;
        } catch (error) {
          log.warn("Failed to decode tipping cell", error);
          return null;
        }
      })
    );

    return results.filter(
      (tipping): tipping is TippingInfo => tipping !== null
    );
  }

  /**
   * Discover all tippings associated with the protocol by scanning
   */
  async fetchTippingsForProtocol(client: ccc.Client): Promise<TippingInfo[]> {
    if (!client) {
      return [];
    }

    const protocolTypeHash = this.protocolCell.cellOutput.type?.hash();
    if (!protocolTypeHash) {
      return [];
    }

    const cells = await fetchTippingsConnectedToProtocol(
      client,
      this.tippingTypeCodeHash,
      protocolTypeHash
    );

    return cells
      .map((cell) => {
        try {
          const data = TippingData.decode(cell.outputData);
          const typeId = extractTypeIdFromTippingCell(cell);
          if (!typeId) {
            return null;
          }

          return {
            typeId,
            cell,
            data,
            metadata: data.metadata,
            comments: [],
            additionalTips: [],
          } as TippingInfo;
        } catch (error) {
          log.warn("Failed to decode tipping", error);
          return null;
        }
      })
      .filter((tipping): tipping is TippingInfo => tipping !== null);
  }

  /**
   * Convenience helper to combine protocol data and chain lookups
   */
  async loadApprovedTippings(
    protocolData: ProtocolDataLike | null | undefined,
    client: ccc.Client
  ): Promise<TippingInfo[]> {
    const approved = protocolData?.tippings_approved ?? [];

    if (approved.length > 0) {
      return this.fetchTippingsByIds(approved, client);
    }

    return this.fetchTippingsForProtocol(client);
  }

  private async ensureTippingInstance(): Promise<Tipping | null> {
    if (this.tipping) {
      return this.tipping;
    }

    const network = deploymentManager.getCurrentNetwork();
    const codeOutPoint = deploymentManager.getContractOutPoint(
      network,
      "ckboostTippingType"
    );
    if (!codeOutPoint) {
      log.warn(
        "Tipping type contract out point not found in deployments.json"
      );
      return null;
    }

    const executorUrl =
      process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";
    const executor = new ssri.ExecutorJsonRpc(executorUrl);

    const protocolTypeHash = this.protocolCell.cellOutput.type?.hash();
    if (!protocolTypeHash) {
      log.warn(
        "Protocol cell missing type hash; cannot initialise tipping SSRI"
      );
      return null;
    }

    const placeholderArgs = ConnectedTypeID.encode({
      type_id: ("0x" + "00".repeat(32)) as ccc.Hex,
      connected_key: protocolTypeHash,
    });

    const script = ccc.Script.from({
      codeHash: this.tippingTypeCodeHash,
      hashType: "type" as const,
      args: ccc.hexFrom(placeholderArgs),
    });

    this.tipping = new Tipping(codeOutPoint, script, this.protocolCell, {
      executor,
    });
    return this.tipping;
  }

  private requireSigner(): ccc.Signer {
    if (!this.signer) {
      throw new Error("Wallet connection required");
    }
    return this.signer;
  }

  private async initializeUdtInstancesFromRegistry(): Promise<void> {
    if (!this.signer) {
      return;
    }

    const tokens = udtRegistry.getAllTokens();
    const executorUrl =
      process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";

    for (const token of tokens) {
      const script = ccc.Script.from(token.script);
      const scriptHash = script.hash();
      if (this.udtInstances.has(scriptHash)) {
        continue;
      }

      const contractScript = ccc.Script.from(token.contractScript);
      let outPoint: ccc.OutPointLike | undefined;
      const collector = this.signer.client.findCells({
        script: contractScript,
        scriptType: "type",
        scriptSearchMode: "exact",
      });

      for await (const cell of collector) {
        if (cell.outPoint) {
          outPoint = cell.outPoint;
          break;
        }
      }

      if (!outPoint) {
        log.warn(
          `Could not find contract deployment for token ${token.symbol}, skipping initialisation`
        );
        continue;
      }

      const udtInstance = token.ssri
        ? new udt.Udt(outPoint, script, {
            executor: new ssri.ExecutorJsonRpc(executorUrl),
          })
        : new udt.Udt(outPoint, script);

      this.udtInstances.set(scriptHash, udtInstance);
    }
  }

  private async getUdtInstance(udtScript: ccc.Script): Promise<udt.Udt> {
    const scriptHash = udtScript.hash();
    const existing = this.udtInstances.get(scriptHash);
    if (existing) {
      return existing;
    }

    const token = udtRegistry.getTokenByScriptHash(scriptHash);
    if (!token) {
      throw new Error(
        `Unknown UDT script hash ${scriptHash}. Please register this token before funding.`
      );
    }

    const signer = this.requireSigner();
    const contractScript = ccc.Script.from(token.contractScript);
    const collector = signer.client.findCells({
      script: contractScript,
      scriptType: "type",
      scriptSearchMode: "exact",
    });

    let outPoint: ccc.OutPointLike | undefined;
    for await (const cell of collector) {
      if (cell.outPoint) {
        outPoint = cell.outPoint;
        break;
      }
    }

    if (!outPoint) {
      throw new Error(
        `Could not locate deployment cell for token ${token.symbol}.`
      );
    }

    const executorUrl =
      process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090";

    const udtInstance = token.ssri
      ? new udt.Udt(outPoint, udtScript, {
          executor: new ssri.ExecutorJsonRpc(executorUrl),
        })
      : new udt.Udt(outPoint, udtScript);

    this.udtInstances.set(scriptHash, udtInstance);
    return udtInstance;
  }

  private getProtocolTypeHash(): ccc.Hex {
    const typeScript = this.protocolCell.cellOutput.type;
    if (!typeScript) {
      throw new Error("Protocol cell is missing a type script");
    }
    return typeScript.hash();
  }

  private async getFundingLockCodeHash(): Promise<ccc.Hex> {
    const data = ProtocolData.decode(this.protocolCell.outputData);
    const codeHash =
      data.protocol_config?.script_code_hashes
        ?.ckb_boost_funding_lock_code_hash;

    if (!codeHash) {
      throw new Error(
        "Protocol configuration does not include the funding lock code hash"
      );
    }

    return ccc.hexFrom(codeHash);
  }

  private async getFundingLockScript(): Promise<ccc.Script> {
    const codeHash = await this.getFundingLockCodeHash();
    const protocolTypeHash = this.getProtocolTypeHash();

    return ccc.Script.from({
      codeHash,
      hashType: "type" as const,
      args: protocolTypeHash,
    });
  }

  private async prepareRewardDistribution(
    tx: ccc.Transaction,
    tipping: Tipping,
    tippingData: TippingDataLike
  ): Promise<ccc.Transaction> {
    const fundingLockOutPoint = deploymentManager.getContractOutPoint(
      deploymentManager.getCurrentNetwork(),
      "ckboostFundingLock"
    );
    if (!fundingLockOutPoint) {
      throw new Error("Funding lock contract not found in deployments.json");
    }

    tx.addCellDeps({
      outPoint: fundingLockOutPoint,
      depType: "code",
    });

    const targetLockScript = await this.resolveLockScript(
      ccc.hexFrom(tippingData.target_lock_hash)
    );

    let preparedTx = await this.addCkbRewardFunding(
      tx,
      tipping,
      tippingData,
      targetLockScript
    );

    preparedTx = await this.addPointsReward(
      preparedTx,
      tippingData,
      targetLockScript
    );

    return preparedTx;
  }

  private async addCkbRewardFunding(
    tx: ccc.Transaction,
    tipping: Tipping,
    tippingData: TippingDataLike,
    targetLockScript: ccc.Script
  ): Promise<ccc.Transaction> {
    let requiredCKB = this.parseBigInt(tippingData.rewards?.ckb_amount);
    if (requiredCKB <= 0n) {
      return tx;
    }
    if (requiredCKB < 6100000000n) {
      requiredCKB = 6100000000n;
    }

    const signer = this.requireSigner();
    const fundingSummary = await tipping.collectFundingPool(signer);

    let remaining = requiredCKB;
    const selectedCells: ccc.Cell[] = [];
    for (const cell of fundingSummary.ckbCells) {
      const capacity = this.capacityToBigInt(cell.cellOutput.capacity);
      selectedCells.push(cell);
      if (capacity >= remaining) {
        remaining = 0n;
        break;
      }
      remaining -= capacity;
    }

    if (remaining > 0n) {
      throw new InsufficientTippingFundingError({
        ckb: {
          required: requiredCKB,
          available: requiredCKB - remaining,
        },
        udts: [],
      });
    }

    for (const cell of selectedCells) {
      await tx.addInput(cell);
    }

    await tx.addOutput(
      ccc.CellOutput.from({
        capacity: requiredCKB,
        lock: targetLockScript,
      }),
      "0x"
    );

    const fundingLockCellsInputCapacity = selectedCells.reduce(
      (acc, cell) => acc + ccc.numFrom(cell.cellOutput.capacity),
      0n
    );
    log.log(
      "ssri-ckboost: addCkbRewardFunding: fundingLockCellsInputCapacity",
      fundingLockCellsInputCapacity
    );

    const changeAmount = fundingLockCellsInputCapacity - requiredCKB;
    log.log("ssri-ckboost: addCkbRewardFunding: changeAmount", changeAmount);

    if (changeAmount > 0n) {
      const fundingLockScript = await this.getFundingLockScript();
      await tx.addOutput(
        ccc.CellOutput.from({
          capacity: changeAmount,
          lock: fundingLockScript,
        }),
        "0x"
      );
    }

    return tx;
  }

  private async addPointsReward(
    tx: ccc.Transaction,
    tippingData: TippingDataLike,
    targetLockScript: ccc.Script
  ): Promise<ccc.Transaction> {
    const pointsAmount = this.parseBigInt(tippingData.rewards?.points_amount);
    if (pointsAmount <= 0n) {
      return tx;
    }

    const protocolData = this.getProtocolDataDecoded();
    const pointsCodeHash = ccc.hexFrom(
      protocolData.protocol_config.script_code_hashes
        .ckb_boost_points_udt_type_code_hash
    );
    const protocolTypeHash = this.getProtocolTypeHash();

    const network = deploymentManager.getCurrentNetwork();
    const pointsOutPoint = deploymentManager.getContractOutPoint(
      network,
      "ckboostPointsUdt"
    );

    if (!pointsOutPoint) {
      throw new Error("Points UDT contract not found in deployments.json");
    }

    tx.addCellDeps({
      outPoint: {
        txHash: pointsOutPoint.txHash,
        index: pointsOutPoint.index,
      },
      depType: "code",
    });

    const pointsTypeScript = ccc.Script.from({
      codeHash: pointsCodeHash,
      hashType: "type" as const,
      args: protocolTypeHash,
    });

    const pointsOutput = ccc.CellOutput.from({
      lock: targetLockScript,
      type: pointsTypeScript,
    });

    const pointsData = ccc.hexFrom(ccc.numLeToBytes(pointsAmount, 16));

    await tx.addOutput(pointsOutput, pointsData);

    return tx;
  }

  private capacityToBigInt(capacity: ccc.Num | ccc.NumLike): bigint {
    const value = typeof capacity === "string" ? capacity : capacity.toString();
    return BigInt(value);
  }

  private async resolveLockScript(lockHash: ccc.Hex): Promise<ccc.Script> {
    const url = new URL("/api/resolve-lock-script", window.location.origin);
    url.searchParams.set("hash", lockHash);

    const response = await fetch(url.toString(), {
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to resolve lock script (status ${response.status})`
      );
    }

    const lockScript = (await response.json()) as {
      code_hash: string;
      hash_type: "data" | "type" | "data1";
      args: string;
    };

    return ccc.Script.from({
      codeHash: lockScript.code_hash,
      hashType: lockScript.hash_type,
      args: lockScript.args,
    });
  }

  private cloneTippingData(data: TippingDataLike): TippingDataLike {
    return {
      ...data,
      supporter_lock_hashes: [...(data.supporter_lock_hashes ?? [])],
      metadata: { ...data.metadata },
      rewards: {
        ...data.rewards,
        udt_assets: [...(data.rewards?.udt_assets ?? [])],
        nft_assets: [...(data.rewards?.nft_assets ?? [])],
      },
    };
  }

  private getProtocolDataDecoded(): ReturnType<typeof ProtocolData.decode> {
    if (!this.protocolDataCache) {
      this.protocolDataCache = ProtocolData.decode(
        this.protocolCell.outputData
      );
    }
    return this.protocolDataCache;
  }

  private getApprovalThresholds(): bigint[] {
    const data = this.getProtocolDataDecoded();
    const raw = data.tipping_config?.approval_requirement_thresholds ?? [];
    return raw.map((threshold) => this.parseBigInt(threshold));
  }

  private calculateRequiredApprovals(data: TippingDataLike): number {
    const thresholds = this.getApprovalThresholds();
    const ckbAmount = this.parseBigInt(data.rewards?.ckb_amount);
    const matched = thresholds.filter((threshold) => ckbAmount >= threshold);
    return matched.length + 1;
  }

  private parseBigInt(value: ccc.NumLike | undefined | null): bigint {
    if (value === undefined || value === null) {
      return 0n;
    }
    try {
      return BigInt(ccc.numFrom(value));
    } catch {
      return 0n;
    }
  }

  private async calculateFundingShortage(
    data: TippingDataLike
  ): Promise<FundingShortage | null> {
    const signer = this.requireSigner();
    const tipping = await this.ensureTippingInstance();
    if (!tipping) {
      throw new Error("Unable to initialise tipping executor context");
    }

    const summary = await tipping.collectFundingPool(signer);

    const shortage: FundingShortage = {
      udts: [],
    };
    let hasShortage = false;

    const requiredCKB = this.parseBigInt(data.rewards?.ckb_amount);
    if (requiredCKB > summary.totalCapacity) {
      shortage.ckb = {
        required: requiredCKB,
        available: summary.totalCapacity,
      };
      hasShortage = true;
    }

    for (const asset of data.rewards?.udt_assets ?? []) {
      const script = ccc.Script.from(asset.udt_script);
      const hash = script.hash().toLowerCase();
      const required = this.parseBigInt(asset.amount);
      const available = summary.udtTotalsByType.get(hash) ?? 0n;
      if (required > available) {
        shortage.udts.push({
          scriptHash: hash,
          required,
          available,
        });
        hasShortage = true;
      }
    }

    return hasShortage ? shortage : null;
  }
}

export interface FundingShortage {
  ckb?: {
    required: bigint;
    available: bigint;
  };
  udts: Array<{
    scriptHash: string;
    required: bigint;
    available: bigint;
  }>;
}

export class InsufficientTippingFundingError extends Error {
  public shortage: FundingShortage;

  constructor(shortage: FundingShortage) {
    super("Insufficient protocol funding for tipping rewards");
    this.name = "InsufficientTippingFundingError";
    this.shortage = shortage;
  }
}

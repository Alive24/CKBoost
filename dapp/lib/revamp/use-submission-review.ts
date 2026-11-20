"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ccc, ssri } from "@ckb-ccc/connector-react";
import { Campaign } from "ssri-ckboost";
import { CampaignData, ConnectedTypeID, ProtocolData, UserData, type CampaignDataLike, type ProtocolDataLike } from "ssri-ckboost/types";
import { ProtocolService } from "@/lib/services/protocol-service";
import { CampaignAdminService } from "@/lib/services/campaign-admin-service";
import { fetchCampaignByTypeId } from "@/lib/ckb/campaign-cells";
import { deploymentManager } from "@/lib/ckb/deployment-manager";
import { usePendingTransactions } from "@/lib/providers/pending-transaction-provider";
import { getCampaignCapabilities, verifyCampaignOwnership } from "./campaign-permissions";
import { normalizeReviewId, unsupportedReviewRewardReason, type ReviewRow } from "./submission-review";
import { createContributorSigner } from "./contributor-transaction";
import { createReviewReadSigner, REVIEW_AUTH_TIMEOUT_MS, REVIEW_SCAN_TIMEOUT_MS, withReviewDeadline } from "./review-request";

type ReviewContext = {
  protocolCell: ccc.Cell;
  protocolData: ProtocolDataLike;
  campaignCell: ccc.Cell;
  campaignData: CampaignDataLike;
  lockHash: string;
  capabilities: ReturnType<typeof getCampaignCapabilities>;
};
type ServiceData = Awaited<ReturnType<CampaignAdminService["fetchCampaignSubmissions"]>>;
export type ReviewDataset = ServiceData & {context: ReviewContext; signer: ccc.Signer; campaignTypeId: string};
export type ReviewApprovalState = {
  phase: "checking" | "signing" | "confirming" | "pending" | "confirmed" | "error";
  questId: number;
  userTypeIds: string[];
  txHash?: string;
  confirmedAt?: number;
  message?: string;
};

const messageOf = (error: unknown) => error instanceof Error ? error.message : "Unable to load submissions.";
const vectorHex = (values: readonly ccc.HexLike[]) => values.map(value => ccc.hexFrom(value));

/** Read both protocol membership and campaign assignments before exposing the
 * queue, and again at the approval boundary. No cached global role flag grants
 * access to this screen. */
async function readReviewContextOnce(signer: ccc.Signer, campaignTypeId: string): Promise<ReviewContext> {
  if (!/^0x[0-9a-f]{64}$/i.test(campaignTypeId)) throw new Error("Invalid campaign type ID.");
  const protocolCell = await new ProtocolService(signer.client).getProtocolCell();
  const protocolData = ProtocolData.decode(protocolCell.outputData) as ProtocolDataLike;
  const codeHash = ccc.hexFrom(protocolData.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash);
  const campaignCell = await fetchCampaignByTypeId(campaignTypeId as ccc.Hex, codeHash, signer.client, protocolCell);
  if (!campaignCell) throw new Error("Campaign not found.");
  const campaignData = CampaignData.decode(campaignCell.outputData) as CampaignDataLike;
  const lockHash = (await signer.getRecommendedAddressObj()).script.hash();
  const protocolTypeHash = protocolCell.cellOutput.type?.hash();
  if (!protocolTypeHash) throw new Error("Protocol type script is unavailable.");
  const ownershipVerified = verifyCampaignOwnership({campaignTypeId, protocolTypeHash,
    campaignTypeCodeHash: codeHash,
    protocolLockCodeHash: ccc.hexFrom(protocolData.protocol_config.script_code_hashes.ckb_boost_protocol_lock_code_hash),
    protocolLockHashType: protocolCell.cellOutput.lock.hashType, cell: campaignCell});
  if (!ownershipVerified) throw new Error("Campaign input ownership, code or protocol binding is invalid. Refresh the current campaign before reviewing.");
  const capabilities = getCampaignCapabilities({
    signerLockHash: lockHash,
    protocol: {
      adminLockHashes: vectorHex(protocolData.protocol_config.admin_lock_hash_vec),
      endorserLockHashes: protocolData.endorsers_whitelist.map(endorser => ccc.hexFrom(endorser.endorser_lock_hash)),
      approvedCampaignTypeIds: vectorHex(protocolData.campaigns_approved),
      protocolTypeHash,
    },
    campaign: {
      typeId: campaignTypeId,
      ownershipVerified,
      endorserLockHash: ccc.hexFrom(campaignData.endorser_lock_hash),
      staffLockHashes: vectorHex(campaignData.staff_lock_hash_vec),
      startDate: Number(campaignData.starting_time) * 1000,
      endDate: Number(campaignData.ending_time) * 1000,
    },
  });
  return {protocolCell, protocolData, campaignCell, campaignData, lockHash, capabilities};
}

function readReviewContext(signer: ccc.Signer, campaignTypeId: string, isCurrent?: () => boolean): Promise<ReviewContext> {
  return withReviewDeadline(active => readReviewContextOnce(createReviewReadSigner(signer, active), campaignTypeId), REVIEW_AUTH_TIMEOUT_MS, "Review access check timed out. Try again to check the latest permissions.", isCurrent);
}

function createReviewService(signer: ccc.Signer, context: ReviewContext, forApproval = false) {
  const codeHash = ccc.hexFrom(context.protocolData.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash);
  const userCodeHash = ccc.hexFrom(context.protocolData.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash);
  const protocolTypeHash = context.protocolCell.cellOutput.type?.hash();
  if (!protocolTypeHash) throw new Error("Protocol type script is unavailable.");
  let campaign: Campaign | null = null;
  if (forApproval) {
    const network = deploymentManager.getCurrentNetwork();
    const outPoint = deploymentManager.getContractOutPoint(network, "ckboostCampaignType");
    const deployedHash = deploymentManager.getContractCodeHash(network, "ckboostCampaignType");
    if (!outPoint || deployedHash?.toLowerCase() !== codeHash.toLowerCase() || !context.campaignCell.cellOutput.type) {
      throw new Error("Campaign contract configuration changed. Refresh before approving.");
    }
    campaign = new Campaign(outPoint, context.campaignCell.cellOutput.type, context.protocolCell, {
      executor: new ssri.ExecutorJsonRpc(process.env.NEXT_PUBLIC_SSRI_EXECUTOR_URL || "http://localhost:9090"),
    });
  }
  return new CampaignAdminService(signer, userCodeHash, protocolTypeHash, codeHash, context.protocolCell, campaign);
}

async function readCurrentContributorResponseOnce(signer: ccc.Signer, context: ReviewContext, userTypeId: string, questId: number, campaignTypeId: string) {
  const protocolHash = context.protocolCell.cellOutput.type!.hash();
  const typeScript = {
    codeHash: ccc.hexFrom(context.protocolData.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash),
    hashType: "type" as const,
    args: ccc.hexFrom(ConnectedTypeID.encode({type_id: userTypeId, connected_key: protocolHash})),
  };
  for await (const cell of signer.client.findCellsByType(typeScript)) {
    const data = UserData.decode(cell.outputData);
    const records = data.submission_records.filter(record => normalizeReviewId(record.campaign_type_id) === campaignTypeId.toLowerCase() && Number(record.quest_id) === questId);
    return records.reduce<typeof records[number] | null>((latest, record) => !latest || Number(record.submission_timestamp) >= Number(latest.submission_timestamp) ? record : latest, null);
  }
  return null;
}

function readCurrentContributorResponse(signer: ccc.Signer, context: ReviewContext, userTypeId: string, questId: number, campaignTypeId: string, isCurrent: () => boolean) {
  return withReviewDeadline(active => readCurrentContributorResponseOnce(createReviewReadSigner(signer, active), context, userTypeId, questId, campaignTypeId), REVIEW_AUTH_TIMEOUT_MS, "Response freshness check timed out. Refresh and review the latest evidence before approving.", isCurrent);
}

export function useSubmissionReview(rawCampaignTypeId: string) {
  const campaignTypeId = rawCampaignTypeId.toLowerCase();
  const signer = ccc.useSigner();
  const {confirmationTarget, explorerBaseUrl} = usePendingTransactions();
  const [dataset, setDataset] = useState<ReviewDataset | null>(null);
  const [access, setAccess] = useState<"loading" | "allowed" | "denied" | "disconnected" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approval, setApproval] = useState<ReviewApprovalState | null>(null);
  const [approvalTimes, setApprovalTimes] = useState<Record<string, number>>({});
  const [operationBusy, setOperationBusy] = useState(false);
  const request = useRef(0);
  const current = useRef({signer, campaignTypeId, epoch: 0});
  if (current.current.signer !== signer || current.current.campaignTypeId !== campaignTypeId) current.current = {signer, campaignTypeId, epoch: current.current.epoch + 1};
  const approvalLock = useRef(false);
  const confirmationWait = useRef(false);
  const pendingContext = useRef<{signer: ccc.Signer; campaignTypeId: string; epoch: number; context: ReviewContext; state: ReviewApprovalState} | null>(null);

  const refresh = useCallback(async (initial = false) => {
    if (approvalLock.current && !initial) return;
    const generation = ++request.current;
    if (!signer) {setDataset(null); setAccess("disconnected"); return;}
    if (initial) {setDataset(null); setAccess("loading");}
    else setRefreshing(true);
    setError(null);
    const isCurrent = () => generation === request.current && current.current.signer === signer && current.current.campaignTypeId === campaignTypeId;
    try {
      const context = await readReviewContext(signer, campaignTypeId, isCurrent);
      if (generation !== request.current || current.current.signer !== signer) return;
      if (!context.capabilities.canReviewSubmissions) {setDataset(null); setAccess("denied"); return;}
      const data = await withReviewDeadline(active => createReviewService(createReviewReadSigner(signer, active), context).fetchCampaignSubmissions(campaignTypeId.toLowerCase() as ccc.Hex), REVIEW_SCAN_TIMEOUT_MS, "Submission scan timed out after 30 seconds. Try again to reload this campaign's responses.", isCurrent);
      if (generation !== request.current || current.current.signer !== signer) return;
      // Review membership and accepted IDs can change during the contributor scan.
      const latestContext = await readReviewContext(signer, campaignTypeId, isCurrent);
      if (generation !== request.current || current.current.signer !== signer) return;
      if (!latestContext.capabilities.canReviewSubmissions) {setDataset(null); setAccess("denied"); return;}
      if (latestContext.lockHash.toLowerCase() !== context.lockHash.toLowerCase()) throw new Error("Wallet changed. Reopen the submission queue.");
      setDataset({...data, userDetails: new Map(Array.from(data.userDetails, ([id, user]) => [normalizeReviewId(id), user])), campaignData: latestContext.campaignData, context: latestContext, signer, campaignTypeId});
      setAccess("allowed");
    } catch (failure) {
      if (generation !== request.current) return;
      setError(messageOf(failure));
      setDataset(null);
      setAccess("error");
    } finally {
      if (generation === request.current) setRefreshing(false);
    }
  }, [signer, campaignTypeId]);

  useEffect(() => {
    setApprovalTimes({});
    if (!pendingContext.current) setApproval(null);
    void refresh(true);
    return () => { request.current++; };
  }, [refresh]);

  const waitForApproval = useCallback(async () => {
    const pending = pendingContext.current;
    if (!pending?.state.txHash || confirmationWait.current) return;
    confirmationWait.current = true;
    const hash = pending.state.txHash as ccc.Hex;
    setApproval({...pending.state, phase: "confirming", message: undefined});
    let receivedConfirmedTransaction = false;
    try {
      const receipt = await pending.signer.client.waitTransaction(hash, confirmationTarget, 180000, 3000);
      if (receipt?.status !== "committed") throw new Error("Transaction is still awaiting confirmation.");
      receivedConfirmedTransaction = true;
      let confirmedAt: number | undefined;
      try { confirmedAt = Number((await pending.signer.client.getTransactionWithHeader(hash))?.header?.timestamp) || undefined; } catch { /* Receipt confirmation is sufficient; time is optional. */ }
      const outputIndex = receipt.transaction.outputs.findIndex(output => output.type?.hash() === pending.context.campaignCell.cellOutput.type?.hash());
      if (outputIndex < 0) throw new Error("Confirmed transaction did not contain the expected campaign. Refresh to inspect its current status.");
      const confirmedCampaign = CampaignData.decode(receipt.transaction.outputsData[outputIndex]) as CampaignDataLike;
      const accepted = new Set(confirmedCampaign.quests.find(quest => Number(quest.quest_id) === pending.state.questId)?.accepted_submission_user_type_ids.map(normalizeReviewId) ?? []);
      if (pending.state.userTypeIds.some(id => !accepted.has(normalizeReviewId(id)))) throw new Error("Confirmed transaction did not approve all selected submissions. Refresh to inspect their current status.");
      if (current.current.signer === pending.signer && current.current.campaignTypeId === pending.campaignTypeId && current.current.epoch === pending.epoch) {
        setDataset(previous => previous?.signer === pending.signer && previous.campaignTypeId === pending.campaignTypeId ? {...previous, campaignData: confirmedCampaign, context: {...previous.context, campaignData: confirmedCampaign}} : previous);
        if (confirmedAt) setApprovalTimes(previous => ({...previous, ...Object.fromEntries(pending.state.userTypeIds.map(id => [`${pending.state.questId}:${id.toLowerCase()}`, confirmedAt!]))}));
      }
      setApproval({...pending.state, phase: "confirmed", confirmedAt, message: "Approval confirmed on-chain."});
      pendingContext.current = null;
      approvalLock.current = false;
      setOperationBusy(false);
    } catch (failure) {
      let status: string | undefined;
      try { status = (await pending.signer.client.getTransactionNoCache(hash))?.status; } catch { /* An unavailable RPC is not a rejected transaction. */ }
      const finalFailure = status === "rejected" || receivedConfirmedTransaction;
      setApproval({...pending.state, phase: finalFailure ? "error" : "pending", message: finalFailure ? messageOf(failure) : "Confirmation is still pending. Check this transaction before approving again."});
      if (finalFailure) {pendingContext.current = null; approvalLock.current = false;setOperationBusy(false);}
    } finally {
      confirmationWait.current = false;
    }
  }, [confirmationTarget]);

  const approve = useCallback(async (questId: number, rows: readonly ReviewRow[]) => {
    if (approvalLock.current || !signer || !dataset || dataset.signer !== signer || dataset.campaignTypeId !== campaignTypeId) return;
    const pendingRows = rows.filter(row => row.status === "pending" && Number(row.quest_id) === questId && normalizeReviewId(row.campaign_type_id) === campaignTypeId.toLowerCase());
    if (!pendingRows.length) return;
    approvalLock.current = true;
    setOperationBusy(true);
    request.current++; // An older refresh must not replace a later confirmed result.
    setRefreshing(false);
    const epoch = current.current.epoch;
    const isScopeCurrent = () => current.current.epoch === epoch && current.current.signer === signer && current.current.campaignTypeId === campaignTypeId;
    const assertScope = () => {if (!isScopeCurrent()) throw new Error("Wallet or campaign changed. Review again before approving.");};
    const state: ReviewApprovalState = {phase: "checking", questId, userTypeIds: pendingRows.map(row => row.userTypeId)};
    setApproval(state);
    try {
      let context = await readReviewContext(signer, campaignTypeId, isScopeCurrent);
      assertScope();
      if (context.lockHash.toLowerCase() !== dataset.context.lockHash.toLowerCase()) {setDataset(null);setAccess("error");throw new Error("Wallet account changed. Reload its review access before approving.");}
      if (!context.capabilities.canReviewSubmissions) {setAccess("denied"); setDataset(null); throw new Error("You are no longer assigned to review this campaign.");}
      const quest = context.campaignData.quests.find(quest => Number(quest.quest_id) === questId);
      if (!quest) throw new Error("This quest is no longer available. Refresh the queue.");
      const unsupported = unsupportedReviewRewardReason(quest);
      if (unsupported) throw new Error(unsupported);
      const displayedQuest = dataset.campaignData.quests.find(item => Number(item.quest_id) === questId);
      if (!displayedQuest || ccc.stringify(quest.metadata) !== ccc.stringify(displayedQuest.metadata) || ccc.stringify(quest.sub_tasks) !== ccc.stringify(displayedQuest.sub_tasks)) throw new Error("Quest requirements changed. Refresh and review the latest requirements before approving.");
      const accepted = new Set(quest.accepted_submission_user_type_ids.map(normalizeReviewId));
      if (pendingRows.some(row => accepted.has(row.userTypeId))) throw new Error("One of these submissions has already been approved. Refresh the queue.");
      for (let index = 0; index < pendingRows.length; index += 4) {
        await Promise.all(pendingRows.slice(index, index + 4).map(async row => {
          const latest = await readCurrentContributorResponse(signer, context, row.userTypeId, questId, campaignTypeId, isScopeCurrent);
          if (!latest || Number(latest.submission_timestamp) !== Number(row.submission_timestamp) || latest.submission_content !== row.submission_content) throw new Error("A contributor updated their response. Refresh and review the latest evidence before approving.");
        }));
        assertScope();
      }
      const finalContext = await readReviewContext(signer, campaignTypeId, isScopeCurrent);
      assertScope();
      if (!finalContext.capabilities.canReviewSubmissions) {setAccess("denied"); setDataset(null); throw new Error("You are no longer assigned to review this campaign.");}
      if (current.current.signer !== signer || current.current.campaignTypeId !== campaignTypeId || finalContext.lockHash.toLowerCase() !== context.lockHash.toLowerCase()) throw new Error("Wallet changed before signing. Please review again.");
      const finalQuest = finalContext.campaignData.quests.find(item => Number(item.quest_id) === questId);
      if (!finalQuest) throw new Error("This quest is no longer available. Refresh the queue.");
      const latestUnsupported = unsupportedReviewRewardReason(finalQuest);
      if (latestUnsupported) throw new Error(latestUnsupported);
      if (ccc.stringify(finalQuest.metadata) !== ccc.stringify(quest.metadata) || ccc.stringify(finalQuest.sub_tasks) !== ccc.stringify(quest.sub_tasks)) throw new Error("Quest requirements changed before signing. Refresh and review again.");
      const latestAccepted = new Set(finalQuest.accepted_submission_user_type_ids.map(normalizeReviewId));
      if (pendingRows.some(row => latestAccepted.has(normalizeReviewId(row.userTypeId)))) throw new Error("One of these submissions has already been approved. Refresh the queue.");
      context = finalContext;
      const guardedSigner = createContributorSigner(signer, async () => {
        assertScope();
        const latest = await readReviewContext(signer, campaignTypeId, isScopeCurrent);
        assertScope();
        if (latest.lockHash.toLowerCase() !== context.lockHash.toLowerCase()) throw new Error("Wallet changed before broadcast. Review again before approving.");
        if (!latest.capabilities.canReviewSubmissions) {setDataset(null);setAccess("denied");throw new Error("Review permission was revoked before broadcast.");}
        if (latest.campaignCell.outPoint.txHash !== context.campaignCell.outPoint.txHash || latest.campaignCell.outPoint.index !== context.campaignCell.outPoint.index) throw new Error("Campaign changed while the approval was being built. Refresh and review again.");
        for (let index = 0; index < pendingRows.length; index += 4) {
          await Promise.all(pendingRows.slice(index, index + 4).map(async row => {
            const response = await readCurrentContributorResponse(signer, latest, row.userTypeId, questId, campaignTypeId, isScopeCurrent);
            if (!response || Number(response.submission_timestamp) !== Number(row.submission_timestamp) || response.submission_content !== row.submission_content) throw new Error("A response changed before broadcast. Refresh and review the latest evidence.");
          }));
          assertScope();
        }
      }, () => {});
      const service = createReviewService(guardedSigner, context, true);
      setApproval({...state, phase: "signing"});
      // The same-protocol campaign input authorizes exact Points minting for
      // the real reviewer. No server administrator co-signature is needed.
      const txHash = await service.approveCompletion(campaignTypeId as ccc.Hex, questId, state.userTypeIds as ccc.Hex[]);
      pendingContext.current = {signer, campaignTypeId, epoch, context, state: {...state, txHash}};
      setApproval({...state, phase: "confirming", txHash});
      await waitForApproval();
    } catch (failure) {
      if (!pendingContext.current) {approvalLock.current = false;setOperationBusy(false); if (current.current.epoch === epoch) setApproval({...state, phase: "error", message: messageOf(failure)});}
    }
  }, [signer, dataset, campaignTypeId, waitForApproval]);

  return {dataset: dataset && dataset.signer === signer && dataset.campaignTypeId === campaignTypeId ? dataset : null, access: signer ? access : "disconnected" as const, refreshing, error, refresh, approval, approvalTimes, approve, checkConfirmation: waitForApproval, explorerBaseUrl, busy: operationBusy};
}

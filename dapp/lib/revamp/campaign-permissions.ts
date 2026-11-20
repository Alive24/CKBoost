import { getDiscoveryStatus, type CampaignDate, type CampaignDiscoveryStatus } from "./campaign-discovery";

export interface CampaignPermissionProtocol {
  adminLockHashes: readonly string[];
  /** On-chain endorser whitelist is the current Organizer grant registry. */
  endorserLockHashes?: readonly string[];
  approvedCampaignTypeIds: readonly string[];
  /** Required when using verified ownership, to bind it to this protocol. */
  protocolTypeHash?: string;
}

const ownershipVerification: unique symbol = Symbol("verifiedCampaignOwnership");

export interface VerifiedCampaignOwnership {
  readonly campaignTypeId: string;
  readonly protocolTypeHash: string;
  readonly ownerLockHash: string;
  readonly [ownershipVerification]: true;
}

interface CampaignPermissionScript {
  codeHash: string;
  hashType: string;
  args: string;
}

export interface CampaignOwnershipSource {
  campaignTypeId: string;
  protocolTypeHash: string;
  campaignTypeCodeHash: string;
  protocolLockCodeHash: string;
  /** The hash type used by the protocol's configured lock deployment. */
  protocolLockHashType: string;
  cell: {cellOutput: {type?: CampaignPermissionScript | null; lock: CampaignPermissionScript}};
  /** Legacy metadata endorser is a separate relation; never an authority. */
  declaredOwnerLockHash?: string;
}

export interface CampaignPermissionCampaign {
  typeId: string;
  /** Legacy display fact only; it never grants ownership or editing rights. */
  ownerLockHash?: string | null;
  /** Construct with verifyCampaignOwnership from authoritative cell facts. */
  ownershipVerified?: VerifiedCampaignOwnership | null;
  endorserLockHash?: string | null;
  staffLockHashes?: readonly string[];
  startDate: CampaignDate;
  endDate: CampaignDate;
}

export interface CampaignPermissionSubmission {
  campaignTypeId: string;
  questId: string | number | bigint;
  contributorLockHash: string;
  /** Derive from the latest quest accepted-user IDs, not transaction state. */
  accepted: boolean;
}

export interface CampaignPermissionFacts {
  /** Null while disconnected or still resolving the current signer. */
  signerLockHash: string | null;
  protocol: CampaignPermissionProtocol | null;
  campaign?: CampaignPermissionCampaign | null;
  questId?: string | number | bigint;
  /** Evaluated separately against the latest eligibility requirements. */
  eligible?: boolean;
  submission?: CampaignPermissionSubmission | null;
  now?: number;
}

/** Normalize comparison only; missing/malformed identities never grant rights. */
export function normalizePermissionHash(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/i.test(value)) return null;
  return value.toLowerCase();
}

/** Canonical Molecule table: total length + two offsets + two Byte32 fields.
 * Keeping this tiny structural decoder here avoids loading CKB/SSRI runtimes
 * into the lean homepage merely to decide whether Create is visible. */
function connectedTypeId(args: string): {typeId: string; connectedKey: string} | null {
  if (typeof args !== "string" || !/^0x[0-9a-f]{152}$/i.test(args)) return null;
  const bytes = args.slice(2).toLowerCase();
  if (bytes.slice(0, 24) !== "4c0000000c0000002c000000") return null;
  return {typeId: `0x${bytes.slice(24, 88)}`, connectedKey: `0x${bytes.slice(88)}`};
}

/** Verify the ownership relation of one authoritative campaign cell. Its type
 * must identify this campaign and protocol. Its configured protocol lock must
 * identify the same protocol and carry the owner wallet in type_id.
 * CampaignData.endorser_lock_hash is separate legacy endorsement metadata and
 * never grants or blocks ownership. connected_key is never the owner wallet.
 * The branded result cannot be recreated by JSON metadata or a route claim.
 * Callers still fetch fresh chain facts again before every transaction. */
export function verifyCampaignOwnership(source: CampaignOwnershipSource): VerifiedCampaignOwnership | null {
  if (!source || !source.cell?.cellOutput?.lock) return null;
  const campaignTypeId = normalizePermissionHash(source.campaignTypeId);
  const protocolTypeHash = normalizePermissionHash(source.protocolTypeHash);
  const campaignCodeHash = normalizePermissionHash(source.campaignTypeCodeHash);
  const lockCodeHash = normalizePermissionHash(source.protocolLockCodeHash);
  const type = source.cell.cellOutput.type;
  const lock = source.cell.cellOutput.lock;
  if (!campaignTypeId || !protocolTypeHash || !campaignCodeHash || !lockCodeHash || !type ||
    type.hashType !== "type" || normalizePermissionHash(type.codeHash) !== campaignCodeHash ||
    !["data", "type", "data1", "data2"].includes(source.protocolLockHashType) ||
    lock.hashType !== source.protocolLockHashType || normalizePermissionHash(lock.codeHash) !== lockCodeHash) return null;
  const campaignArgs = connectedTypeId(type.args);
  const ownerArgs = connectedTypeId(lock.args);
  if (!campaignArgs || !ownerArgs || campaignArgs.typeId !== campaignTypeId ||
    campaignArgs.connectedKey !== protocolTypeHash || ownerArgs.connectedKey !== protocolTypeHash) return null;
  return Object.freeze({campaignTypeId, protocolTypeHash, ownerLockHash: ownerArgs.typeId, [ownershipVerification]: true as const});
}

function includesHash(values: readonly string[] | undefined, hash: string | null): boolean {
  return Boolean(hash && values?.some(value => normalizePermissionHash(value) === hash));
}

function questKey(value: string | number | bigint | undefined): string | null {
  if (value === undefined || (typeof value === "number" && !Number.isSafeInteger(value))) return null;
  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** Figma role policy. This pure decision does not authorize a
 * transaction by itself: callers must refresh signer/protocol/campaign facts
 * before writes, and preserve the existing contract/API checks.
 *
 * Admin retains its management override. A currently granted Organizer can
 * create, and can edit/assign reviewers only on its verified own campaigns.
 * An authorized Organizer may review its verified own campaign. Platform
 * approval remains an Admin action; assigned reviewers receive no settings rights.
 */
export function getCampaignCapabilities(facts: CampaignPermissionFacts) {
  const hash = normalizePermissionHash(facts.signerLockHash);
  const campaignId = normalizePermissionHash(facts.campaign?.typeId);
  const hasCampaign = Boolean(facts.protocol && campaignId);
  const admin = includesHash(facts.protocol?.adminLockHashes, hash);
  const endorser = includesHash(facts.protocol?.endorserLockHashes, hash);
  const organizer = endorser;
  const ownership = facts.campaign?.ownershipVerified;
  const owner = Boolean(hasCampaign && hash && ownership?.[ownershipVerification] === true &&
    ownership.campaignTypeId === campaignId && ownership.protocolTypeHash === normalizePermissionHash(facts.protocol?.protocolTypeHash) &&
    ownership.ownerLockHash === hash);
  const staff = Boolean(hasCampaign && includesHash(facts.campaign?.staffLockHashes, hash));
  const isApproved = Boolean(hasCampaign && includesHash(facts.protocol?.approvedCampaignTypeIds, campaignId));

  let status: CampaignDiscoveryStatus | null = null;
  const now = facts.now ?? Date.now();
  if (facts.campaign && hasCampaign && Number.isFinite(now)) {
    try { status = getDiscoveryStatus(facts.campaign, now); } catch { /* Unreadable schedule fails closed. */ }
  }
  const submissionsOpen = Boolean(isApproved && (status === "active" || status === "ending-soon"));
  const currentQuest = questKey(facts.questId);
  const submission = facts.submission;
  const submissionInScope = Boolean(submission && campaignId &&
    normalizePermissionHash(submission.campaignTypeId) === campaignId &&
    currentQuest && questKey(submission.questId) === currentQuest);
  const isOwnSubmission = Boolean(submissionInScope && hash &&
    normalizePermissionHash(submission?.contributorLockHash) === hash);
  const canParticipate = Boolean(hash && hasCampaign && currentQuest && submissionsOpen && facts.eligible === true);
  const canEditSubmission = Boolean(canParticipate && isOwnSubmission && submission?.accepted === false);

  return {
    // Any connected actor can also participate as a contributor; management
    // roles do not authorize editing another contributor's response.
    roles: { admin, organizer, endorser, owner, staff, contributor: Boolean(hash) },
    isOwnSubmission,
    isApproved,
    status,
    submissionsOpen,
    canCreateCampaign: Boolean(facts.protocol && (admin || organizer)),
    canEditCampaign: Boolean(hasCampaign && (admin || (organizer && owner))),
    canManageStaff: Boolean(hasCampaign && (admin || (organizer && owner))),
    canReviewSubmissions: Boolean(hasCampaign && (admin || staff || (organizer && owner))),
    canApproveCampaign: Boolean(hasCampaign && admin && !isApproved),
    canSubmitQuest: Boolean(canParticipate && !submission),
    canEditSubmission,
    canDeleteSubmission: canEditSubmission,
  };
}

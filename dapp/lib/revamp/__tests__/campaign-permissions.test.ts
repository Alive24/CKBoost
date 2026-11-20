import { ConnectedTypeID } from "ssri-ckboost/types";
import { getCampaignCapabilities, normalizePermissionHash, verifyCampaignOwnership, type CampaignPermissionFacts, type CampaignOwnershipSource, type VerifiedCampaignOwnership } from "../campaign-permissions";

const admin = `0x${"a1".repeat(32)}`;
const viewer = `0x${"b2".repeat(32)}`;
const campaignId = `0x${"c3".repeat(32)}`;
const otherId = `0x${"d4".repeat(32)}`;
const protocolHash = `0x${"e5".repeat(32)}`;
const campaignCodeHash = `0x${"f6".repeat(32)}`;
const protocolLockCodeHash = `0x${"19".repeat(32)}`;
function connected(typeId:string,protocol=protocolHash):string {
  return `0x${Buffer.from(ConnectedTypeID.encode({type_id:typeId as `0x${string}`,connected_key:protocol as `0x${string}`})).toString("hex")}`;
}
function ownershipSource():CampaignOwnershipSource {
  return {campaignTypeId:campaignId,protocolTypeHash:protocolHash,campaignTypeCodeHash:campaignCodeHash,protocolLockCodeHash,protocolLockHashType:"type",declaredOwnerLockHash:viewer,
    cell:{cellOutput:{type:{codeHash:campaignCodeHash,hashType:"type",args:connected(campaignId)},lock:{codeHash:protocolLockCodeHash,hashType:"type",args:connected(viewer)}}}};
}
const ownership = verifyCampaignOwnership(ownershipSource());
const now = Date.parse("2026-11-18T08:00:00Z");
const hour = 3_600_000;
const base: CampaignPermissionFacts = {
  signerLockHash: viewer,
  protocol: {adminLockHashes: [admin], endorserLockHashes: [], approvedCampaignTypeIds: [campaignId],protocolTypeHash:protocolHash},
  campaign: {typeId: campaignId, ownershipVerified:ownership, staffLockHashes: [], startDate: now - hour, endDate: now + 72 * hour},
  questId: 1,
  eligible: true,
  now,
};
const pending = {campaignTypeId: campaignId, questId: 1, contributorLockHash: viewer, accepted: false};

describe("campaign capabilities from current facts", () => {
  it("allows a currently granted Organizer to manage and review its verified own campaign without platform approval rights", () => {
    const result = getCampaignCapabilities({...base,
      protocol: {...base.protocol!, endorserLockHashes: [viewer]},
      submission: pending,
    });
    expect(result.roles).toEqual({admin: false, organizer:true,endorser: true, owner: true, staff: false, contributor: true});
    expect(result).toMatchObject({canCreateCampaign: true, canEditCampaign: true, canManageStaff: true,
      canReviewSubmissions: true, canApproveCampaign: false, canEditSubmission: true});
  });

  it("preserves admin overrides and limits assigned reviewers to submission review", () => {
    const adminResult = getCampaignCapabilities({...base, signerLockHash: admin});
    expect(adminResult).toMatchObject({canCreateCampaign: true, canEditCampaign: true, canManageStaff: true, canReviewSubmissions: true});
    const reviewer = getCampaignCapabilities({...base, campaign: {...base.campaign!, staffLockHashes: [viewer]}});
    expect(reviewer).toMatchObject({canCreateCampaign: false, canEditCampaign: false, canManageStaff: false, canReviewSubmissions: true});
    const anotherCampaign = getCampaignCapabilities({...base, campaign: {...base.campaign!, typeId: otherId, staffLockHashes: []}});
    expect(anotherCampaign.canReviewSubmissions).toBe(false);
  });

  it("revokes management when the Organizer grant is removed while keeping the ownership relation independent",()=>{
    const result=getCampaignCapabilities(base);
    expect(result.roles).toMatchObject({owner:true,organizer:false});
    expect(result).toMatchObject({canCreateCampaign:false,canEditCampaign:false,canManageStaff:false,canReviewSubmissions:false});
  });

  it("does not allow another organizer to edit this campaign",()=>{
    const result=getCampaignCapabilities({...base,signerLockHash:otherId,protocol:{...base.protocol!,endorserLockHashes:[viewer,otherId]}});
    expect(result).toMatchObject({canCreateCampaign:true,canEditCampaign:false,canManageStaff:false,canReviewSubmissions:false,roles:{organizer:true,owner:false}});
  });

  it("ignores raw metadata owner claims and JSON copies of a verified token",()=>{
    const protocol={...base.protocol!,endorserLockHashes:[viewer]};
    for(const ownershipVerified of [null,JSON.parse(JSON.stringify(ownership)) as VerifiedCampaignOwnership]) {
      const result=getCampaignCapabilities({...base,protocol,campaign:{...base.campaign!,ownerLockHash:viewer,endorserLockHash:viewer,ownershipVerified}});
      expect(result).toMatchObject({canCreateCampaign:true,canEditCampaign:false,canManageStaff:false,canReviewSubmissions:false,roles:{owner:false}});
    }
  });

  it("binds verified ownership to the current campaign and current protocol",()=>{
    const protocol={...base.protocol!,endorserLockHashes:[viewer]};
    expect(getCampaignCapabilities({...base,protocol,campaign:{...base.campaign!,typeId:otherId}}).canEditCampaign).toBe(false);
    expect(getCampaignCapabilities({...base,protocol:{...protocol,protocolTypeHash:otherId}}).canEditCampaign).toBe(false);
    expect(getCampaignCapabilities({...base,protocol:{...protocol,protocolTypeHash:undefined}}).canEditCampaign).toBe(false);
    expect(getCampaignCapabilities({...base,protocol,campaign:{...base.campaign!,typeId:otherId}}).canReviewSubmissions).toBe(false);
    expect(getCampaignCapabilities({...base,protocol:{...protocol,protocolTypeHash:otherId}}).canReviewSubmissions).toBe(false);
  });

  it("allows an admin to approve only a loaded campaign not already listed", () => {
    expect(getCampaignCapabilities({...base, signerLockHash: admin}).canApproveCampaign).toBe(false);
    expect(getCampaignCapabilities({...base, signerLockHash: admin, protocol: {...base.protocol!, approvedCampaignTypeIds: []}}).canApproveCampaign).toBe(true);
    expect(getCampaignCapabilities({...base, signerLockHash: admin, campaign: null}).canApproveCampaign).toBe(false);
  });

  it("can submit before a response exists and can edit/delete only an own pending response", () => {
    expect(getCampaignCapabilities(base)).toMatchObject({isApproved: true, submissionsOpen: true, canSubmitQuest: true, canEditSubmission: false});
    expect(getCampaignCapabilities({...base, submission: pending})).toMatchObject({canSubmitQuest: false, canEditSubmission: true, canDeleteSubmission: true});
    expect(getCampaignCapabilities({...base, submission: {...pending, accepted: true}})).toMatchObject({canSubmitQuest: false, canEditSubmission: false, canDeleteSubmission: false});
  });

  it.each([
    {submission: {...pending, contributorLockHash: admin}},
    {submission: {...pending, campaignTypeId: otherId}},
    {submission: {...pending, questId: 2}},
  ])("rejects editing another contributor/campaign/quest response", overrides => {
    expect(getCampaignCapabilities({...base, ...overrides})).toMatchObject({canEditSubmission: false, canDeleteSubmission: false});
  });

  it.each([
    {eligible: false}, {eligible: undefined}, {signerLockHash: null}, {protocol: null},
    {questId: undefined}, {questId: -1}, {questId: Number.MAX_SAFE_INTEGER + 1},
    {protocol: {...base.protocol!, approvedCampaignTypeIds: []}},
    {campaign: {...base.campaign!, startDate: now + hour}},
    {campaign: {...base.campaign!, endDate: now}},
    {campaign: {...base.campaign!, endDate: "invalid"}},
    {now: Number.NaN},
  ])("fails closed for unavailable, ineligible or closed contributor state", overrides => {
    const facts = {...base, ...overrides};
    expect(getCampaignCapabilities(facts).canSubmitQuest).toBeFalsy();
    expect(getCampaignCapabilities({...facts, submission: pending}).canEditSubmission).toBe(false);
  });

  it("keeps Ending soon open until the absolute deadline and closes exactly then", () => {
    const facts = {...base, campaign: {...base.campaign!, endDate: now + hour}};
    expect(getCampaignCapabilities(facts)).toMatchObject({status: "ending-soon", canSubmitQuest: true});
    expect(getCampaignCapabilities({...facts, now: now + hour})).toMatchObject({status: "completed", canSubmitQuest: false});
  });

  it("normalizes complete IDs without granting on display prefixes or a missing identity", () => {
    expect(normalizePermissionHash(admin.toUpperCase())).toBe(admin);
    expect(normalizePermissionHash(admin.slice(0, 8))).toBeNull();
    expect(normalizePermissionHash(null)).toBeNull();
    expect(getCampaignCapabilities({...base, signerLockHash: admin.toUpperCase()}).roles.admin).toBe(true);
    expect(getCampaignCapabilities({...base, signerLockHash: admin.slice(0, 8)}).canCreateCampaign).toBe(false);
  });

  it("does not give even admins authority over someone else's pending response", () => {
    expect(getCampaignCapabilities({...base, signerLockHash: admin, submission: pending})).toMatchObject({canReviewSubmissions: true, canEditSubmission: false, canDeleteSubmission: false});
  });
  it("scopes a legitimate legacy Quest0 response without confusing it with Quest1",()=>{
    const zero={...pending,questId:0};
    expect(getCampaignCapabilities({...base,questId:0})).toMatchObject({canSubmitQuest:true});
    expect(getCampaignCapabilities({...base,questId:0,submission:zero})).toMatchObject({canSubmitQuest:false,canEditSubmission:true,isOwnSubmission:true});
    expect(getCampaignCapabilities({...base,questId:1,submission:zero}).canEditSubmission).toBe(false);
    expect(getCampaignCapabilities({...base,questId:0,submission:{...zero,accepted:true}}).canEditSubmission).toBe(false);
  });
});

describe("authoritative campaign ownership verification",()=>{
  it("matches the SDK's ConnectedTypeID encoding and derives the owner from lock.type_id",()=>{
    expect(ownership).toMatchObject({campaignTypeId:campaignId,protocolTypeHash:protocolHash,ownerLockHash:viewer});
    expect(verifyCampaignOwnership({...ownershipSource(),declaredOwnerLockHash:protocolHash})).toMatchObject({ownerLockHash:viewer});
  });
  it.each([
    ["wrong campaign code hash",(source:CampaignOwnershipSource)=>{source.cell.cellOutput.type!.codeHash=otherId;}],
    ["campaign code hash prefix",(source:CampaignOwnershipSource)=>{source.cell.cellOutput.type!.codeHash=campaignCodeHash.slice(0,34);}],
    ["wrong campaign hash type",(source:CampaignOwnershipSource)=>{source.cell.cellOutput.type!.hashType="data";}],
    ["missing campaign type",(source:CampaignOwnershipSource)=>{source.cell.cellOutput.type=null;}],
    ["another campaign ID",(source:CampaignOwnershipSource)=>{source.cell.cellOutput.type!.args=connected(otherId);}],
    ["wrong type protocol relation",(source:CampaignOwnershipSource)=>{source.cell.cellOutput.type!.args=connected(campaignId,otherId);}],
    ["wrong lock code hash",(source:CampaignOwnershipSource)=>{source.cell.cellOutput.lock.codeHash=otherId;}],
    ["wrong lock hash type",(source:CampaignOwnershipSource)=>{source.cell.cellOutput.lock.hashType="data1";}],
    ["wrong lock protocol relation",(source:CampaignOwnershipSource)=>{source.cell.cellOutput.lock.args=connected(viewer,otherId);}],
    ["malformed Molecule offsets",(source:CampaignOwnershipSource)=>{source.cell.cellOutput.lock.args=source.cell.cellOutput.lock.args.replace("0c000000","10000000");}],
    ["trailing lock arguments",(source:CampaignOwnershipSource)=>{source.cell.cellOutput.lock.args+="00";}],
  ] as const)("rejects %s",(_label,mutate)=>{
    const source=ownershipSource();mutate(source);expect(verifyCampaignOwnership(source)).toBeNull();
  });
  it("uses the verified cell-lock owner even when legacy endorsement metadata names someone else",()=>{
    const source=ownershipSource();source.declaredOwnerLockHash=otherId;
    expect(verifyCampaignOwnership(source)).toMatchObject({ownerLockHash:viewer});
    source.cell.cellOutput.lock.args=connected(otherId);source.declaredOwnerLockHash=viewer;
    const result=getCampaignCapabilities({...base,protocol:{...base.protocol!,endorserLockHashes:[viewer]},campaign:{...base.campaign!,ownerLockHash:viewer,ownershipVerified:verifyCampaignOwnership(source)}});
    expect(result).toMatchObject({roles:{owner:false},canEditCampaign:false,canManageStaff:false,canReviewSubmissions:false});
  });
});

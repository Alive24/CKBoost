// Type converters between SDK types and UI types
// The SDK types use snake_case and ArrayBuffer/Uint8Array for data
// UI types use camelCase and strings for display

// Type alias for SDK buffer types
type SDKBuffer = ArrayBuffer | Uint8Array | { toArrayBuffer(): ArrayBuffer }

import type {
  CampaignDataType,
  QuestDataType,
  QuestSubTaskDataType,
  SponsorInfoType,
  AssetListType,
  UDTFundingType,
  ScriptType,
  CompletionRecordType,
  UserProgressDataType,
  TokenRewardInfoType,
  TippingProposalDataType,
  TippingProposalMetadataType,
  EndorserInfoType,
  ProtocolDataType,
} from 'ssri-ckboost/types'

import type {
  Campaign,
  Quest,
  Subtask,
  Sponsor,
  TokenReward,
  VerificationRequirements,
} from '../types/campaign'

// Utility to convert SDK buffer types to string
export function bufferToString(buffer: SDKBuffer): string {
  if ('toArrayBuffer' in buffer && typeof buffer.toArrayBuffer === 'function') {
    return new TextDecoder().decode(buffer.toArrayBuffer())
  }
  if (buffer instanceof ArrayBuffer) {
    return new TextDecoder().decode(buffer)
  }
  if (buffer instanceof Uint8Array) {
    return new TextDecoder().decode(buffer)
  }
  throw new Error('Invalid buffer type')
}

// Utility to convert SDK buffer types to hex string
export function bufferToHex(buffer: SDKBuffer): string {
  let arrayBuffer: ArrayBuffer
  if ('toArrayBuffer' in buffer && typeof buffer.toArrayBuffer === 'function') {
    arrayBuffer = buffer.toArrayBuffer()
  } else if (buffer instanceof ArrayBuffer) {
    arrayBuffer = buffer
  } else if (buffer instanceof Uint8Array) {
    // Create a new ArrayBuffer from Uint8Array
    arrayBuffer = new ArrayBuffer(buffer.length)
    new Uint8Array(arrayBuffer).set(buffer)
  } else {
    throw new Error('Invalid buffer type')
  }
  const uint8Array = new Uint8Array(arrayBuffer)
  return '0x' + Array.from(uint8Array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Utility to convert hex string to ArrayBuffer
export function hexToBuffer(hex: string): ArrayBuffer {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex
  const buffer = new ArrayBuffer(cleanHex.length / 2)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < cleanHex.length; i += 2) {
    view[i / 2] = parseInt(cleanHex.substr(i, 2), 16)
  }
  return buffer
}

// Utility to convert string to ArrayBuffer
export function stringToBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder()
  const uint8Array = encoder.encode(str)
  // Create a new ArrayBuffer from Uint8Array
  const arrayBuffer = new ArrayBuffer(uint8Array.length)
  new Uint8Array(arrayBuffer).set(uint8Array)
  return arrayBuffer
}

// Convert number stored as Uint32/Uint64 to number
export function bufferToNumber(buffer: SDKBuffer): number {
  let arrayBuffer: ArrayBuffer
  if ('toArrayBuffer' in buffer && typeof buffer.toArrayBuffer === 'function') {
    arrayBuffer = buffer.toArrayBuffer()
  } else if (buffer instanceof ArrayBuffer) {
    arrayBuffer = buffer
  } else if (buffer instanceof Uint8Array) {
    // Create a new ArrayBuffer from Uint8Array
    arrayBuffer = new ArrayBuffer(buffer.length)
    new Uint8Array(arrayBuffer).set(buffer)
  } else {
    throw new Error('Invalid buffer type')
  }
  const uint8Array = new Uint8Array(arrayBuffer)
  
  // Handle different byte lengths
  if (uint8Array.length === 0) {
    return 0
  }
  
  // Handle little-endian encoding
  let value = 0
  const maxBytes = Math.min(uint8Array.length, 8) // Max 8 bytes for JavaScript number
  
  for (let i = 0; i < maxBytes; i++) {
    // Use bitwise operations for first 4 bytes, Math.pow for the rest
    if (i < 4) {
      value += (uint8Array[i] << (i * 8)) >>> 0
    } else {
      value += uint8Array[i] * Math.pow(256, i)
    }
  }
  
  // Check if the value is within safe integer range
  if (value > Number.MAX_SAFE_INTEGER) {
    console.warn('Buffer value exceeds MAX_SAFE_INTEGER:', value)
  }
  
  return value
}

// Convert number to buffer (little-endian)
export function numberToBuffer(num: number, bytes: number = 4): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < bytes; i++) {
    view[i] = (num >> (i * 8)) & 0xff
  }
  return buffer
}

// Convert number to Uint64 buffer (8 bytes, little-endian)
export function numberToUint64(num: number): ArrayBuffer {
  return numberToBuffer(num, 8)
}

// Convert number to Uint32 buffer (4 bytes, little-endian)
export function numberToUint32(num: number): ArrayBuffer {
  return numberToBuffer(num, 4)
}

// Convert number to Uint8 buffer (1 byte)
export function numberToUint8(num: number): ArrayBuffer {
  return numberToBuffer(num, 1)
}

// Convert verification requirements bitmask to object
export function parseVerificationRequirements(bitmask: number): VerificationRequirements {
  return {
    telegram: (bitmask & 1) !== 0,
    kyc: (bitmask & 2) !== 0,
    did: (bitmask & 4) !== 0,
    manualReview: (bitmask & 8) !== 0,
    twitter: (bitmask & 16) !== 0,
    discord: (bitmask & 32) !== 0,
    reddit: (bitmask & 64) !== 0,
  }
}

// Convert verification requirements object to bitmask
export function serializeVerificationRequirements(reqs: VerificationRequirements): number {
  let bitmask = 0
  if (reqs.telegram) bitmask |= 1
  if (reqs.kyc) bitmask |= 2
  if (reqs.did) bitmask |= 4
  if (reqs.manualReview) bitmask |= 8
  if (reqs.twitter) bitmask |= 16
  if (reqs.discord) bitmask |= 32
  if (reqs.reddit) bitmask |= 64
  return bitmask
}

// Convert SDK Script type to UI Script type
export function convertScript(script: ScriptType): any {
  return {
    codeHash: bufferToHex(script.code_hash),
    hashType: script.hash_type === 0 ? 'data' : script.hash_type === 1 ? 'type' : 'data1',
    args: bufferToHex(script.args),
  }
}

// Convert UI Script to SDK Script type
export function convertScriptToSDK(script: any): ScriptType {
  return {
    code_hash: hexToBuffer(script.codeHash),
    hash_type: script.hashType === 'data' ? 0 : script.hashType === 'type' ? 1 : 2,
    args: hexToBuffer(script.args),
  }
}

// Convert SDK SponsorInfo to UI Sponsor
export function convertSponsorInfo(sponsorInfo: SponsorInfoType): Sponsor {
  const socialLinks = sponsorInfo.social_links.map(link => bufferToString(link))
  
  // Extract Twitter and GitHub from social links
  const twitter = socialLinks.find(link => link.includes('twitter.com')) || ''
  const github = socialLinks.find(link => link.includes('github.com')) || ''
  
  return {
    name: bufferToString(sponsorInfo.name),
    logo: '🏢', // Default logo, can be enhanced later
    verified: bufferToNumber(sponsorInfo.verified) === 1,
    description: bufferToString(sponsorInfo.description),
    website: bufferToString(sponsorInfo.website),
    social: {
      twitter: twitter.split('/').pop() || '',
      github: github.split('/').pop() || '',
    },
  }
}

// Convert SDK QuestSubTaskData to UI Subtask
export function convertSubtask(subtask: QuestSubTaskDataType, index: number): Subtask {
  return {
    id: bufferToNumber(subtask.id),
    title: bufferToString(subtask.title),
    type: bufferToString(subtask.type),
    completed: false, // This should come from completion records
    description: bufferToString(subtask.description),
    proofRequired: bufferToString(subtask.proof_required),
  }
}

// Convert SDK QuestData to UI Quest
export function convertQuest(quest: QuestDataType): Quest {
  const difficultyMap = ['easy', 'medium', 'hard']
  const difficulty = bufferToNumber(quest.difficulty)
  
  // Calculate token rewards from rewards_on_completion
  const tokenRewards: TokenReward[] = []
  if (quest.rewards_on_completion && quest.rewards_on_completion.length > 0) {
    const assetList = quest.rewards_on_completion[0]
    assetList.udt_assets.forEach((udt: UDTFundingType) => {
      tokenRewards.push({
        symbol: 'TOKEN', // This should come from TokenRewardInfo
        amount: bufferToNumber(udt.amount),
      })
    })
  }
  
  return {
    id: parseInt(bufferToHex(quest.id).slice(2, 10), 16), // Convert first 4 bytes to number
    title: bufferToString(quest.title),
    description: bufferToString(quest.description),
    points: bufferToNumber(quest.points),
    difficulty: difficultyMap[difficulty] || 'medium',
    timeEstimate: `${bufferToNumber(quest.time_estimate)} min`,
    icon: '🎯', // Default icon
    completions: bufferToNumber(quest.completion_count),
    rewards: {
      points: bufferToNumber(quest.points),
      tokens: tokenRewards,
    },
    subtasks: quest.sub_tasks.map((st, i) => convertSubtask(st, i)),
  }
}

// Convert SDK CampaignData to UI Campaign
export function convertCampaign(campaign: CampaignDataType): Campaign {
  const statusMap = ['created', 'funding', 'reviewing', 'approved', 'active', 'completed']
  const difficultyMap = ['easy', 'medium', 'hard']
  
  const metadata = campaign.metadata
  const verificationReqs = parseVerificationRequirements(bufferToNumber(metadata.verification_requirements))
  
  // Calculate total rewards from all quests
  let totalPoints = 0
  const tokenRewardMap = new Map<string, number>()
  
  campaign.quests.forEach(quest => {
    totalPoints += bufferToNumber(quest.points)
    if (quest.rewards_on_completion && quest.rewards_on_completion.length > 0) {
      const assetList = quest.rewards_on_completion[0]
      assetList.udt_assets.forEach((udt: UDTFundingType) => {
        const symbol = 'TOKEN' // Should come from TokenRewardInfo
        const current = tokenRewardMap.get(symbol) || 0
        tokenRewardMap.set(symbol, current + bufferToNumber(udt.amount))
      })
    }
  })
  
  const tokenRewards: TokenReward[] = Array.from(tokenRewardMap.entries()).map(([symbol, amount]) => ({
    symbol,
    amount,
  }))
  
  return {
    id: parseInt(bufferToHex(campaign.id).slice(2, 10), 16), // Convert first 4 bytes to number
    title: bufferToString(campaign.title),
    shortDescription: bufferToString(campaign.short_description),
    longDescription: bufferToString(campaign.long_description),
    sponsor: convertSponsorInfo(campaign.sponsor_info),
    totalRewards: {
      points: totalPoints,
      tokens: tokenRewards,
    },
    participants: bufferToNumber(campaign.participants_count),
    questsCount: campaign.quests.length,
    questsCompleted: bufferToNumber(campaign.total_completions),
    startDate: new Date(bufferToNumber(metadata.starting_time) * 1000).toISOString(),
    endDate: new Date(bufferToNumber(metadata.ending_time) * 1000).toISOString(),
    status: statusMap[campaign.status] || 'unknown',
    difficulty: difficultyMap[bufferToNumber(metadata.difficulty)] || 'medium',
    categories: metadata.categories.map(cat => bufferToString(cat)),
    image: bufferToString(metadata.image_cid), // IPFS CID
    verificationRequirements: verificationReqs,
    rules: metadata.rules.map(rule => bufferToString(rule)),
    quests: campaign.quests.map(quest => convertQuest(quest)),
    completedQuests: bufferToNumber(campaign.total_completions),
  }
}

// Convert UI Campaign to SDK CampaignData
export function convertCampaignToSDK(campaign: Campaign): Partial<CampaignDataType> {
  const statusMap: Record<string, number> = {
    created: 0,
    funding: 1,
    reviewing: 2,
    approved: 3,
    active: 4,
    completed: 5,
  }
  
  const difficultyMap: Record<string, number> = {
    easy: 0,
    medium: 1,
    hard: 2,
  }
  
  return {
    id: hexToBuffer(`0x${campaign.id.toString(16).padStart(64, '0')}`),
    title: stringToBuffer(campaign.title),
    short_description: stringToBuffer(campaign.shortDescription),
    long_description: stringToBuffer(campaign.longDescription),
    status: statusMap[campaign.status] || 0,
    participants_count: numberToBuffer(campaign.participants),
    total_completions: numberToBuffer(campaign.completedQuests),
    // Other fields would need to be filled in based on context
  }
}

// Convert SDK EndorserInfo to UI format
export function convertEndorserInfo(endorser: EndorserInfoType): any {
  return {
    endorserLockHash: bufferToHex(endorser.endorser_lock_hash),
    endorserName: bufferToString(endorser.endorser_name),
    endorserDescription: bufferToString(endorser.endorser_description),
  }
}

// Convert SDK TippingProposalData to UI format
export function convertTippingProposal(proposal: TippingProposalDataType): any {
  return {
    targetAddress: bufferToString(proposal.target_address),
    proposerLockHash: bufferToHex(proposal.proposer_lock_hash),
    metadata: {
      contributionTitle: bufferToString(proposal.metadata.contribution_title),
      contributionTypeTags: proposal.metadata.contribution_type_tags.map(tag => bufferToString(tag)),
      description: bufferToString(proposal.metadata.description),
      proposalCreationTimestamp: bufferToNumber(proposal.metadata.proposal_creation_timestamp),
    },
    amount: bufferToNumber(proposal.amount),
    tippingTransactionHash: proposal.tipping_transaction_hash 
      ? bufferToHex(proposal.tipping_transaction_hash) 
      : undefined,
    approvalTransactionHash: proposal.approval_transaction_hash.map(hash => bufferToHex(hash)),
  }
}

// Convert SDK ProtocolData to UI format
export function convertProtocolData(protocol: ProtocolDataType): any {
  return {
    protocolConfig: {
      adminLockHashVec: protocol.protocol_config.admin_lock_hash_vec.map(hash => bufferToHex(hash)),
      scriptCodeHashes: {
        ckbBoostProtocolTypeCodeHash: bufferToHex(protocol.protocol_config.script_code_hashes.ckb_boost_protocol_type_code_hash),
        ckbBoostProtocolLockCodeHash: bufferToHex(protocol.protocol_config.script_code_hashes.ckb_boost_protocol_lock_code_hash),
        ckbBoostCampaignTypeCodeHash: bufferToHex(protocol.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash),
        ckbBoostCampaignLockCodeHash: bufferToHex(protocol.protocol_config.script_code_hashes.ckb_boost_campaign_lock_code_hash),
        ckbBoostUserTypeCodeHash: bufferToHex(protocol.protocol_config.script_code_hashes.ckb_boost_user_type_code_hash),
        acceptedUdtTypeCodeHashes: protocol.protocol_config.script_code_hashes.accepted_udt_type_code_hashes.map(h => bufferToHex(h)),
        acceptedDobTypeCodeHashes: protocol.protocol_config.script_code_hashes.accepted_dob_type_code_hashes.map(h => bufferToHex(h)),
      },
    },
    tippingConfig: {
      approvalRequirementThresholds: protocol.tipping_config.approval_requirement_thresholds.map(t => bufferToNumber(t).toString()),
      expirationDuration: bufferToNumber(protocol.tipping_config.expiration_duration),
    },
    endorsersWhitelist: protocol.endorsers_whitelist.map(e => convertEndorserInfo(e)),
    tippingProposals: protocol.tipping_proposals.map(p => convertTippingProposal(p)),
    campaignsApproved: protocol.campaigns_approved.map(c => ({
      id: bufferToHex(c.id),
      name: bufferToString(c.title),
      description: bufferToString(c.short_description),
      status: c.status,
      createdAt: new Date(bufferToNumber(c.metadata.created_at) * 1000).toISOString(),
      adminLockHash: bufferToHex(c.creator.code_hash),
    })),
    lastUpdated: new Date(bufferToNumber(protocol.last_updated) * 1000).toISOString(),
  }
}
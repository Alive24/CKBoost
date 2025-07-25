// MOCK DATA - Replace this with real CKB blockchain data fetching

import type { ProtocolDataType } from 'ssri-ckboost/types'
import { 
  hexToBuffer, 
  stringToBuffer, 
  numberToUint64, 
  numberToUint32, 
  numberToUint8 
} from '../utils/type-converters'

// Mock endorsers data - using SDK format
const MOCK_ENDORSERS = [
  {
    endorser_lock_hash: hexToBuffer("0x608e6846ba5e83c969aa93349551db03fd450b92dfd6e1ed55970fa5f4635b6a"),
    endorser_name: stringToBuffer("Primary CKB Endorser"),
    endorser_description: stringToBuffer("Official endorser using the specified CKB address for protocol validation")
  },
  {
    endorser_lock_hash: hexToBuffer("0xb8d6e5f4c3b2a190f8e7d6c5b4a39281f0e7d6c5b4a39281f0e7d6c5b4a39281"),
    endorser_name: stringToBuffer("CKB Community Lead"),
    endorser_description: stringToBuffer("Active community leader with extensive experience in blockchain governance")
  },
  {
    endorser_lock_hash: hexToBuffer("0xc7e5f4d3b2a09f8e7d6c5b4a39281e0d9c8b7a6c5b4a39281e0d9c8b7a6c5b4"),
    endorser_name: stringToBuffer("DeFi Protocol Expert"),
    endorser_description: stringToBuffer("Senior developer with deep expertise in DeFi protocols and smart contract security")
  }
]

// Mock tipping proposals - using SDK format
const MOCK_TIPPING_PROPOSALS = [
  {
    target_address: stringToBuffer("ckb1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq2qf8keemy2p5uu0g0gn8cd"),
    proposer_lock_hash: hexToBuffer("0x36c329ed630d6ce750712a477543672adab57f4c36c329ed630d6ce750712a47"),
    metadata: {
      contribution_title: stringToBuffer("Outstanding Documentation Contribution"),
      contribution_type_tags: ["documentation", "tutorial", "community"].map(tag => stringToBuffer(tag)),
      description: stringToBuffer("Created comprehensive guides for new developers joining the CKB ecosystem"),
      proposal_creation_timestamp: numberToUint64(Math.floor(Date.now() / 1000))
    },
    amount: numberToUint64(50000000000), // 500 CKB in shannon
    approval_transaction_hash: [],
    tipping_transaction_hash: undefined
  },
  {
    target_address: stringToBuffer("ckb1qyqvsv5240xeh85wvnau2eky8pwrhh4jr8ts8vyj37"),
    proposer_lock_hash: hexToBuffer("0x4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b"),
    metadata: {
      contribution_title: stringToBuffer("Smart Contract Security Audit"),
      contribution_type_tags: ["security", "audit", "development"].map(tag => stringToBuffer(tag)),
      description: stringToBuffer("Comprehensive security review of core protocol contracts with detailed vulnerability assessment"),
      proposal_creation_timestamp: numberToUint64(Math.floor((Date.now() - 86400000) / 1000)) // 1 day ago
    },
    amount: numberToUint64(100000000000), // 1000 CKB in shannon
    approval_transaction_hash: [hexToBuffer("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef")],
    tipping_transaction_hash: hexToBuffer("0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890")
  },
  {
    target_address: stringToBuffer("ckb1qyqrdscej43ry6dqm8j9dzc44czwqmqq0q0q6qyqg3"),
    proposer_lock_hash: hexToBuffer("0x5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6"),
    metadata: {
      contribution_title: stringToBuffer("Community Event Organization"),
      contribution_type_tags: ["community", "events", "outreach"].map(tag => stringToBuffer(tag)),
      description: stringToBuffer("Successfully organized and executed CKB developer meetup with 100+ participants"),
      proposal_creation_timestamp: numberToUint64(Math.floor((Date.now() - 172800000) / 1000)) // 2 days ago
    },
    amount: numberToUint64(25000000000), // 250 CKB in shannon
    approval_transaction_hash: [],
    tipping_transaction_hash: undefined
  }
]

// Mock approved campaigns - using SDK format
const MOCK_APPROVED_CAMPAIGNS = [
  {
    id: hexToBuffer("0x1111111111111111111111111111111111111111111111111111111111111111"),
    creator: {
      code_hash: hexToBuffer("0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8"),
      hash_type: 1, // type
      args: hexToBuffer("0x")
    },
    metadata: {
      funding_info: [],
      created_at: numberToUint64(Math.floor((Date.now() - 604800000) / 1000)), // 1 week ago
      starting_time: numberToUint64(Math.floor((Date.now() - 604800000) / 1000)),
      ending_time: numberToUint64(Math.floor((Date.now() + 2592000000) / 1000)), // 30 days from now
      verification_requirements: numberToUint32(1),
      last_updated: numberToUint64(Math.floor(Date.now() / 1000)),
      categories: [],
      difficulty: numberToUint8(0),
      image_cid: stringToBuffer(''),
      rules: []
    },
    status: 4, // Active
    quests: [],
    title: stringToBuffer('DeFi Education Campaign'),
    short_description: stringToBuffer('Learn DeFi basics and earn rewards'),
    long_description: stringToBuffer('A comprehensive campaign to help users understand DeFi concepts'),
    sponsor_info: {
      name: stringToBuffer('CKB Foundation'),
      description: stringToBuffer('Supporting blockchain education'),
      website: stringToBuffer('https://ckb.foundation'),
      social_links: [],
      verified: numberToUint8(1)
    },
    participants_count: numberToUint32(0),
    total_completions: numberToUint32(0)
  },
  {
    id: hexToBuffer("0x2222222222222222222222222222222222222222222222222222222222222222"),
    creator: {
      code_hash: hexToBuffer("0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8"),
      hash_type: 1, // type
      args: hexToBuffer("0x")
    },
    metadata: {
      funding_info: [],
      created_at: numberToUint64(Math.floor((Date.now() - 1209600000) / 1000)), // 2 weeks ago
      starting_time: numberToUint64(Math.floor((Date.now() - 1209600000) / 1000)),
      ending_time: numberToUint64(Math.floor((Date.now() + 1296000000) / 1000)), // 15 days from now
      verification_requirements: numberToUint32(2),
      last_updated: numberToUint64(Math.floor(Date.now() / 1000)),
      categories: [],
      difficulty: numberToUint8(1),
      image_cid: stringToBuffer(''),
      rules: []
    },
    status: 4, // Active
    quests: [],
    title: stringToBuffer('Smart Contract Development'),
    short_description: stringToBuffer('Build on CKB and earn rewards'),
    long_description: stringToBuffer('Learn to develop smart contracts on CKB blockchain'),
    sponsor_info: {
      name: stringToBuffer('Nervos Network'),
      description: stringToBuffer('The blockchain built for the future'),
      website: stringToBuffer('https://nervos.org'),
      social_links: [],
      verified: numberToUint8(1)
    },
    participants_count: numberToUint32(0),
    total_completions: numberToUint32(0)
  }
]

// Convert Uint128 number to buffer
function numberToUint128(num: bigint): ArrayBuffer {
  const buffer = new ArrayBuffer(16) // 128 bits
  const view = new DataView(buffer)
  // Store as little-endian
  view.setBigUint64(0, num & 0xFFFFFFFFFFFFFFFFn, true) // Low 64 bits
  view.setBigUint64(8, num >> 64n, true) // High 64 bits
  return buffer
}

// Main mock protocol data - using SDK format
export function getMockProtocolData(): ProtocolDataType {
  return {
    campaigns_approved: MOCK_APPROVED_CAMPAIGNS,
    tipping_proposals: MOCK_TIPPING_PROPOSALS,
    endorsers_whitelist: MOCK_ENDORSERS,
    last_updated: numberToUint64(Math.floor(Date.now() / 1000)),
    protocol_config: {
      admin_lock_hash_vec: [
        hexToBuffer("0x02c93173368ec56f72ec023f63148461b80e7698eddd62cbd9dbe31a13f2b330"), // Hub Admin
        hexToBuffer("0x4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b") // Secondary admin
      ],
      script_code_hashes: {
        ckb_boost_protocol_type_code_hash: hexToBuffer("0x0000000000000000000000000000000000000000000000000000000000000001"),
        ckb_boost_protocol_lock_code_hash: hexToBuffer("0x0000000000000000000000000000000000000000000000000000000000000002"),
        ckb_boost_campaign_type_code_hash: hexToBuffer("0x0000000000000000000000000000000000000000000000000000000000000003"),
        ckb_boost_campaign_lock_code_hash: hexToBuffer("0x0000000000000000000000000000000000000000000000000000000000000004"),
        ckb_boost_user_type_code_hash: hexToBuffer("0x0000000000000000000000000000000000000000000000000000000000000005"),
        accepted_udt_type_code_hashes: [],
        accepted_dob_type_code_hashes: []
      }
    },
    tipping_config: {
      approval_requirement_thresholds: [
        numberToUint128(10000000000n), 
        numberToUint128(50000000000n), 
        numberToUint128(100000000000n)
      ], // CKB amounts in shannon
      expiration_duration: numberToUint64(604800) // 7 days in seconds
    }
  }
}

export function getMockEndorsers() {
  return MOCK_ENDORSERS
}

export function getMockTippingProposals() {
  return MOCK_TIPPING_PROPOSALS
}

export function getMockApprovedCampaigns() {
  return MOCK_APPROVED_CAMPAIGNS
}
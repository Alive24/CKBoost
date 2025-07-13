// MOCK DATA - Replace this with real CKB blockchain data fetching

import { ProtocolData, EndorserInfo, TippingProposalData, CampaignData } from '../types/protocol'

// Mock endorsers data - using real computed lock hash
const MOCK_ENDORSERS: EndorserInfo[] = [
  {
    endorserLockHash: "0x608e6846ba5e83c969aa93349551db03fd450b92dfd6e1ed55970fa5f4635b6a", // Computed from ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqq9zuyhnp0wmjejcpznmn7srdduvxa5r4xgr7wmxq
    endorserName: "Primary CKB Endorser",
    endorserDescription: "Official endorser using the specified CKB address for protocol validation"
  },
  {
    endorserLockHash: "0xb8d6e5f4c3b2a190f8e7d6c5b4a39281f0e7d6c5b4a39281f0e7d6c5b4a39281",
    endorserName: "CKB Community Lead",
    endorserDescription: "Active community leader with extensive experience in blockchain governance"
  },
  {
    endorserLockHash: "0xc7e5f4d3b2a09f8e7d6c5b4a39281e0d9c8b7a6c5b4a39281e0d9c8b7a6c5b4",
    endorserName: "DeFi Protocol Expert",
    endorserDescription: "Senior developer with deep expertise in DeFi protocols and smart contract security"
  }
]

// Mock tipping proposals
const MOCK_TIPPING_PROPOSALS: TippingProposalData[] = [
  {
    targetAddress: "ckb1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq2qf8keemy2p5uu0g0gn8cd",
    proposerLockHash: "0x36c329ed630d6ce750712a477543672adab57f4c36c329ed630d6ce750712a47",
    metadata: {
      contributionTitle: "Outstanding Documentation Contribution",
      contributionTypeTags: ["documentation", "tutorial", "community"],
      description: "Created comprehensive guides for new developers joining the CKB ecosystem",
      proposalCreationTimestamp: Date.now() - (7 * 24 * 60 * 60 * 1000) // 7 days ago
    },
    amount: 150000, // 1.5 CKB
    tippingTransactionHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    approvalTransactionHash: [
      "0x1111111111111111111111111111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333333333333333333333333333"
    ]
  },
  {
    targetAddress: "ckb1qyqr79tnk3pp34xkx2c9w7qzfn8n26k48ugqvswasg2snt",
    proposerLockHash: "0x2cd8b9d68d4ef82f2e7dbb73f8a8e8b9c9f123452cd8b9d68d4ef82f2e7dbb73",
    metadata: {
      contributionTitle: "Smart Contract Security Audit",
      contributionTypeTags: ["security", "audit", "development"],
      description: "Performed thorough security review and identified critical vulnerabilities",
      proposalCreationTimestamp: Date.now() - (3 * 24 * 60 * 60 * 1000) // 3 days ago
    },
    amount: 250000, // 2.5 CKB
    approvalTransactionHash: [
      "0x4444444444444444444444444444444444444444444444444444444444444444",
      "0x5555555555555555555555555555555555555555555555555555555555555555"
    ]
  },
  {
    targetAddress: "ckb1qyq5lv479ewscx3ms620sv34pgeuz6zagaaqklhtgg2snt",
    proposerLockHash: "0x8f3e9b7a2c5d1e9f8a6b4c3d2e1f0a9b8c7d6e5f8f3e9b7a2c5d1e9f8a6b4c3d",
    metadata: {
      contributionTitle: "Community Support and Mentoring",
      contributionTypeTags: ["community", "mentoring", "support"],
      description: "Provided excellent technical support and mentored new developers in the community",
      proposalCreationTimestamp: Date.now() - (1 * 24 * 60 * 60 * 1000) // 1 day ago
    },
    amount: 100000, // 1.0 CKB
    approvalTransactionHash: []
  }
]

// Mock approved campaigns
const MOCK_APPROVED_CAMPAIGNS: CampaignData[] = [
  {
    id: "0xabc123def456789012345678901234567890123456789012345678901234abcd",
    creator: {
      codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
      hashType: "type",
      args: "0x36c329ed630d6ce750712a477543672adab57f4c"
    },
    metadata: {
      fundingInfo: [],
      createdAt: Date.now() - (30 * 24 * 60 * 60 * 1000), // 30 days ago
      startingTime: Date.now() - (20 * 24 * 60 * 60 * 1000), // 20 days ago
      endingTime: Date.now() + (40 * 24 * 60 * 60 * 1000), // 40 days from now
      verificationRequirements: 1, // telegram
      lastUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000) // 1 day ago
    },
    status: 4, // active
    quests: []
  },
  {
    id: "0xdef789abc123456789012345678901234567890123456789012345678901def7",
    creator: {
      codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
      hashType: "type",
      args: "0x2cd8b9d68d4ef82f2e7dbb73f8a8e8b9c9f12345"
    },
    metadata: {
      fundingInfo: [],
      createdAt: Date.now() - (45 * 24 * 60 * 60 * 1000), // 45 days ago
      startingTime: Date.now() - (35 * 24 * 60 * 60 * 1000), // 35 days ago
      endingTime: Date.now() + (25 * 24 * 60 * 60 * 1000), // 25 days from now
      verificationRequirements: 2, // identity
      lastUpdated: Date.now() - (2 * 24 * 60 * 60 * 1000) // 2 days ago
    },
    status: 4, // active
    quests: []
  },
  {
    id: "0x789def123abc456789012345678901234567890123456789012345678901789d",
    creator: {
      codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
      hashType: "type", 
      args: "0x8f3e9b7a2c5d1e9f8a6b4c3d2e1f0a9b8c7d6e5f"
    },
    metadata: {
      fundingInfo: [],
      createdAt: Date.now() - (60 * 24 * 60 * 60 * 1000), // 60 days ago
      startingTime: Date.now() - (50 * 24 * 60 * 60 * 1000), // 50 days ago
      endingTime: Date.now() - (5 * 24 * 60 * 60 * 1000), // 5 days ago (completed)
      verificationRequirements: 1, // telegram
      lastUpdated: Date.now() - (5 * 24 * 60 * 60 * 1000) // 5 days ago
    },
    status: 5, // completed
    quests: []
  }
]

/**
 * Get mock protocol data
 * @returns Mock ProtocolData
 */
export function getMockProtocolData(): ProtocolData {
  return {
    campaignsApproved: MOCK_APPROVED_CAMPAIGNS,
    tippingProposals: MOCK_TIPPING_PROPOSALS,
    tippingConfig: {
      approvalRequirementThresholds: ["10000", "50000", "100000"],
      expirationDuration: 7 * 24 * 60 * 60 // 7 days in seconds
    },
    endorsersWhitelist: MOCK_ENDORSERS,
    lastUpdated: Date.now(),
    protocolConfig: {
      adminLockHashVec: [
        "0x36c329ed630d6ce750712a477543672adab57f4c36c329ed630d6ce750712a47",
        "0x2cd8b9d68d4ef82f2e7dbb73f8a8e8b9c9f123452cd8b9d68d4ef82f2e7dbb73"
      ],
      scriptCodeHashes: {
        ckbBoostProtocolTypeCodeHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        ckbBoostProtocolLockCodeHash: "0x2345678901bcdef12345678901bcdef12345678901bcdef12345678901bcdef1",
        ckbBoostCampaignTypeCodeHash: "0x3456789012cdef123456789012cdef123456789012cdef123456789012cdef12",
        ckbBoostCampaignLockCodeHash: "0x456789013def1234567890123def1234567890123def1234567890123def123",
        ckbBoostUserTypeCodeHash: "0x56789014ef123456789014ef123456789014ef123456789014ef123456789014"
      }
    }
  }
}

/**
 * Get mock endorsers list
 * @returns Array of mock endorsers
 */
export function getMockEndorsers(): EndorserInfo[] {
  return [...MOCK_ENDORSERS]
}

/**
 * Get mock tipping proposals
 * @returns Array of mock tipping proposals
 */
export function getMockTippingProposals(): TippingProposalData[] {
  return [...MOCK_TIPPING_PROPOSALS]
}

/**
 * Get mock approved campaigns
 * @returns Array of mock approved campaigns
 */
export function getMockApprovedCampaigns(): CampaignData[] {
  return [...MOCK_APPROVED_CAMPAIGNS]
}
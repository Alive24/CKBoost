// MOCK DATA - Replace this with real CKB blockchain data fetching

import { ProtocolData, EndorserInfo, TippingProposalData, CampaignData } from '../types'

// Mock endorsers data - using real computed lock hash
const MOCK_ENDORSERS: EndorserInfo[] = [
  {
    endorserLockHash: "608e6846ba5e83c969aa93349551db03fd450b92dfd6e1ed55970fa5f4635b6a",
    endorserName: "Primary CKB Endorser",
    endorserDescription: "Official endorser using the specified CKB address for protocol validation",
    endorserAddress: "ckb1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq2qf8keemy2p5uu0g0gn8cd"
  },
  {
    endorserLockHash: "b8d6e5f4c3b2a190f8e7d6c5b4a39281f0e7d6c5b4a39281f0e7d6c5b4a39281",
    endorserName: "CKB Community Lead",
    endorserDescription: "Active community leader with extensive experience in blockchain governance",
    endorserAddress: "ckb1qyqvsv5240xeh85wvnau2eky8pwrhh4jr8ts8vyj37"
  },
  {
    endorserLockHash: "c7e5f4d3b2a09f8e7d6c5b4a39281e0d9c8b7a6c5b4a39281e0d9c8b7a6c5b4",
    endorserName: "DeFi Protocol Expert",
    endorserDescription: "Senior developer with deep expertise in DeFi protocols and smart contract security",
    endorserAddress: "ckb1qyqrdscej43ry6dqm8j9dzc44czwqmqq0q0q6qyqg3"
  }
]

// Mock tipping proposals
const MOCK_TIPPING_PROPOSALS: TippingProposalData[] = [
  {
    targetAddress: "ckb1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq2qf8keemy2p5uu0g0gn8cd",
    proposerLockHash: "36c329ed630d6ce750712a477543672adab57f4c36c329ed630d6ce750712a47",
    metadata: {
      contributionTitle: "Outstanding Documentation Contribution",
      contributionTypeTags: ["documentation", "tutorial", "community"],
      description: "Created comprehensive guides for new developers joining the CKB ecosystem",
      proposalCreationTimestamp: Date.now()
    },
    amount: 50000000000, // 500 CKB in shannon
    approvalTransactionHash: [],
    tippingTransactionHash: undefined
  },
  {
    targetAddress: "ckb1qyqvsv5240xeh85wvnau2eky8pwrhh4jr8ts8vyj37",
    proposerLockHash: "4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b",
    metadata: {
      contributionTitle: "Smart Contract Security Audit",
      contributionTypeTags: ["security", "audit", "development"],
      description: "Comprehensive security review of core protocol contracts with detailed vulnerability assessment",
      proposalCreationTimestamp: Date.now() - 86400000 // 1 day ago
    },
    amount: 100000000000, // 1000 CKB in shannon
    approvalTransactionHash: ["0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"],
    tippingTransactionHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
  },
  {
    targetAddress: "ckb1qyqrdscej43ry6dqm8j9dzc44czwqmqq0q0q6qyqg3",
    proposerLockHash: "5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6",
    metadata: {
      contributionTitle: "Community Event Organization",
      contributionTypeTags: ["community", "events", "outreach"],
      description: "Successfully organized and executed CKB developer meetup with 100+ participants",
      proposalCreationTimestamp: Date.now() - 172800000 // 2 days ago
    },
    amount: 25000000000, // 250 CKB in shannon
    approvalTransactionHash: [],
    tippingTransactionHash: undefined
  }
]

// Mock approved campaigns
const MOCK_APPROVED_CAMPAIGNS: CampaignData[] = [
  {
    id: "0x1111111111111111111111111111111111111111111111111111111111111111",
    creator: {
      codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
      hashType: "type",
      args: "0x"
    },
    metadata: {
      fundingInfo: [],
      createdAt: Date.now() - 604800000, // 1 week ago
      startingTime: Date.now() - 604800000,
      endingTime: Date.now() + 2592000000, // 30 days from now
      verificationRequirements: 1,
      lastUpdated: Date.now()
    },
    status: 4, // Active
    quests: []
  },
  {
    id: "0x2222222222222222222222222222222222222222222222222222222222222222",
    creator: {
      codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
      hashType: "type",
      args: "0x"
    },
    metadata: {
      fundingInfo: [],
      createdAt: Date.now() - 1209600000, // 2 weeks ago
      startingTime: Date.now() - 1209600000,
      endingTime: Date.now() + 1296000000, // 15 days from now
      verificationRequirements: 2,
      lastUpdated: Date.now()
    },
    status: 4, // Active
    quests: []
  }
]

// Main mock protocol data
export function getMockProtocolData(): ProtocolData {
  return {
    campaignsApproved: MOCK_APPROVED_CAMPAIGNS,
    tippingProposals: MOCK_TIPPING_PROPOSALS,
    tippingConfig: {
      approvalRequirementThresholds: ["10000000000", "50000000000", "100000000000"], // CKB amounts in shannon
      expirationDuration: 604800 // 7 days in seconds
    },
    endorsersWhitelist: MOCK_ENDORSERS,
    lastUpdated: Date.now(),
    protocolConfig: {
      adminLockHashVec: [
        "0x36c329ed630d6ce750712a477543672adab57f4c36c329ed630d6ce750712a47",
        "0x4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b"
      ],
      scriptCodeHashes: {
        ckbBoostProtocolTypeCodeHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
        ckbBoostProtocolLockCodeHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
        ckbBoostCampaignTypeCodeHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
        ckbBoostCampaignLockCodeHash: "0x4444444444444444444444444444444444444444444444444444444444444444",
        ckbBoostUserTypeCodeHash: "0x5555555555555555555555555555555555555555555555555555555555555555"
      }
    }
  }
}

export function getMockEndorsers(): EndorserInfo[] {
  return MOCK_ENDORSERS
}

export function getMockTippingProposals(): TippingProposalData[] {
  return MOCK_TIPPING_PROPOSALS
}

export function getMockApprovedCampaigns(): CampaignData[] {
  return MOCK_APPROVED_CAMPAIGNS
}
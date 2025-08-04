// MOCK DATA - Replace this entire file with real CKB blockchain data fetching

// For mock data, we'll create simple UI representations that will be converted to blockchain types
// In production, this entire file would be replaced with blockchain data fetching

import type { CampaignDataLike, QuestDataLike, AssetListLike } from 'ssri-ckboost/types'
import { ccc } from "@ckb-ccc/core"


// Mock endorser names - In production, this would come from the protocol endorsers whitelist
const MOCK_ENDORSER_NAMES = {
  nervos: "Nervos Foundation",
  defiAlliance: "DeFi Alliance", 
  communityDao: "Community DAO",
  nftStudios: "NFT Studios",
  securityAlliance: "Security Alliance",
  marketingDao: "Marketing DAO",
  devFoundation: "Dev Foundation",
  educationDao: "Education DAO",
}

// Create mock campaign data that matches the schema structure
const createMockQuest = (
  title: string,
  description: string,
  points: number,
  difficulty: number,
  timeEstimate: number,
  rewardsList: AssetListLike[]
): QuestDataLike => ({
  rewards_on_completion: rewardsList,
  completion_deadline: BigInt(Date.now() + 30 * 24 * 60 * 60 * 1000),
  status: 1,
  sub_tasks: [],
  points: BigInt(points),
  completion_count: 0,
  quest_id: '',
  metadata: {
    title: ccc.hexFrom(ccc.bytesFrom(title, "utf8")),
    short_description: ccc.hexFrom(ccc.bytesFrom(description, "utf8")),
    long_description: ccc.hexFrom(ccc.bytesFrom(description, "utf8")),
    requirements: ccc.hexFrom(ccc.bytesFrom("Complete all subtasks", "utf8")),
    difficulty: ccc.numFrom(difficulty),
    time_estimate: ccc.numFrom(timeEstimate)
  },
  accepted_submission_lock_hashes: [],
})

const createMockCampaign = (
  id: number,
  data: {
    title: string
    shortDescription: string
    longDescription: string
    endorserName: string
    startDate: string
    endDate: string
    difficulty: number
    categories: string[]
    image: string
    verificationRequirements: number
    rules: string[]
    quests: QuestDataLike[]
  }
): CampaignDataLike => ({
  metadata: {
    last_updated: BigInt(Date.now()),
    categories: data.categories.map(cat => ccc.hexFrom(ccc.bytesFrom(cat, "utf8"))),
    difficulty: data.difficulty,
    title: '',
    short_description: '',
    long_description: '',
    total_rewards: {
      points_amount: ccc.numFrom(0),
      ckb_amount: 0n,
      nft_assets: [],
      udt_assets: []
    },
    verification_requirements: [],
    image_url: '',
    endorser_info: {
      endorser_lock_hash: '',
      endorser_name: '',
      endorser_description: '',
      website: '',
      social_links: [],
      verified: 1
    }
  },
  status: 1,
  quests: data.quests,
  participants_count: 0,
  total_completions: 0,
  endorser: {
    endorser_lock_hash: '',
    endorser_name: '',
    endorser_description: '',
    website: '',
    social_links: [],
    verified: 1
  },
  created_at: '',
  starting_time: '',
  ending_time: '',
  rules: []
})

// Mock campaign data - In production, this would be fetched from CKB blockchain
// Keep the existing simple format for easy editing
export const MOCK_CAMPAIGNS: any[] = [
  {
    id: 1,
    title: "CKB Ecosystem Growth Initiative",
    shortDescription: "Help grow the CKB ecosystem through content creation, development, and community engagement",
    longDescription: "Help expand the CKB ecosystem through social engagement, development, and community building. This comprehensive campaign includes multiple quest types designed to onboard new users, increase developer adoption, and strengthen community bonds. Participate in various activities ranging from social media engagement to smart contract development, all while earning rewards and contributing to the growth of the Nervos Network.",
    endorserName: MOCK_ENDORSER_NAMES.nervos,
    totalRewards: {
      points: ccc.numFrom(5000),
      tokens: [
        { symbol: "CKB", amount: ccc.numFrom(2000) },
        { symbol: "SPORE", amount: ccc.numFrom(1000) },
      ],
    },
    participants: 156,
    questsCount: 8,
    questsCompleted: 3,
    startDate: "2025-01-15",
    endDate: "2025-08-15",
    status: "active",
    difficulty: "Medium",
    categories: ["Development", "Content", "Community"],
    image: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=200&fit=crop&crop=center",
    verificationRequirements: {
      telegram: true,
      kyc: false,
      did: false,
      manualReview: false,
    },
    rules: [
      "Complete quests in any order",
      "Each quest can only be completed once per participant",
      "Rewards are distributed weekly",
      "Campaign ends on August 15, 2025",
    ],
    completedQuests: 89,
    quests: [
      {
        id: 1,
        title: "Raid the CKB Announcement",
        description: "Like, retweet, and comment on the latest CKB announcement on X to help spread awareness",
        points: ccc.numFrom(50),
        difficulty: "Easy",
        timeEstimate: "2 mins",
        icon: "📢",
        completions: 45,
        rewards: {
          points: ccc.numFrom(50),
          tokens: [{ symbol: "CKB", amount: ccc.numFrom(10) }],
        },
        subtasks: [
          {
            id: 1,
            title: "Follow @NervosNetwork on X",
            type: "social",
            completed: false,
            description: "Follow the official Nervos Network account",
            proofRequired: "Screenshot of follow confirmation",
          },
          {
            id: 2,
            title: "Like the announcement post",
            type: "social",
            completed: false,
            description: "Like the latest CKB announcement post",
            proofRequired: "Link to the liked post",
          },
          {
            id: 3,
            title: "Retweet with comment",
            type: "social",
            completed: false,
            description: "Retweet with your own meaningful comment about CKB",
            proofRequired: "Link to your retweet",
          },
          {
            id: 4,
            title: "Tag 2 friends",
            type: "social",
            completed: false,
            description: "Tag 2 friends who might be interested in blockchain",
            proofRequired: "Screenshot showing tagged friends",
          },
        ],
      },
      {
        id: 2,
        title: "Deploy Smart Contract",
        description: "Deploy your first smart contract on the CKB testnet and verify its functionality",
        points: ccc.numFrom(300),
        difficulty: "Hard",
        timeEstimate: "45 mins",
        icon: "🚀",
        completions: 12,
        rewards: {
          points: ccc.numFrom(300),
          tokens: [
            { symbol: "CKB", amount: ccc.numFrom(100) },
            { symbol: "SPORE", amount: ccc.numFrom(50) },
          ],
        },
        subtasks: [
          {
            id: 1,
            title: "Set up development environment",
            type: "technical",
            completed: false,
            description: "Install and configure CKB development tools",
            proofRequired: "Screenshot of successful setup",
          },
          {
            id: 2,
            title: "Write smart contract code",
            type: "technical",
            completed: false,
            description: "Create a simple smart contract using CKB Script",
            proofRequired: "Code repository link",
          },
          {
            id: 3,
            title: "Deploy to testnet",
            type: "onchain",
            completed: false,
            description: "Deploy your contract to CKB testnet",
            proofRequired: "Transaction hash of deployment",
          },
          {
            id: 4,
            title: "Verify deployment",
            type: "onchain",
            completed: false,
            description: "Confirm contract is working correctly",
            proofRequired: "Screenshot of successful verification",
          },
        ],
      },
    ],
  },
  {
    id: 2,
    title: "DeFi Education Campaign",
    shortDescription: "Learn and teach others about DeFi protocols, yield farming, and decentralized finance concepts",
    longDescription: "Learn and teach about DeFi concepts on CKB through tutorials and content creation. This campaign is designed to educate the community about decentralized finance, covering topics from basic concepts to advanced yield farming strategies. Create educational content, write tutorials, and help others understand the power of DeFi on the Nervos Network. Due to the high-value rewards and regulatory compliance requirements, this campaign requires KYC verification.",
    endorserName: MOCK_ENDORSER_NAMES.defiAlliance,
    totalRewards: {
      points: ccc.numFrom(3500),
      tokens: [
        { symbol: "CKB", amount: ccc.numFrom(1500) },
        { symbol: "DEFI", amount: ccc.numFrom(500) },
      ],
    },
    participants: 89,
    questsCount: 6,
    questsCompleted: 2,
    startDate: "2025-02-01",
    endDate: "2025-09-10",
    status: "active",
    difficulty: "Beginner",
    categories: ["Education", "DeFi", "Finance"],
    image: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=400&h=200&fit=crop&crop=center",
    verificationRequirements: {
      telegram: false,
      kyc: true,
      did: false,
      manualReview: false,
      excludeManualReview: true,
    },
    rules: [
      "Must complete KYC verification before participating",
      "Educational content must be original and high-quality",
      "Plagiarism will result in disqualification",
      "Rewards distributed monthly",
    ],
    completedQuests: 45,
    quests: [
      {
        id: 3,
        title: "Create DeFi Tutorial",
        description: "Create a comprehensive tutorial about DeFi concepts on CKB",
        points: ccc.numFrom(200),
        difficulty: "Medium",
        timeEstimate: "3 hours",
        icon: "📚",
        completions: 15,
        rewards: {
          points: ccc.numFrom(200),
          tokens: [{ symbol: "CKB", amount: ccc.numFrom(100) }],
        },
        subtasks: [
          {
            id: 1,
            title: "Research DeFi protocols",
            type: "research",
            completed: false,
            description: "Research existing DeFi protocols on CKB",
            proofRequired: "List of protocols with descriptions",
          },
          {
            id: 2,
            title: "Create tutorial content",
            type: "content",
            completed: false,
            description: "Write comprehensive tutorial",
            proofRequired: "Tutorial document or video",
          },
        ],
      },
    ],
  },
  {
    id: 3,
    title: "Community Builder Program",
    shortDescription: "Build and engage communities around blockchain projects through events and social activities",
    longDescription: "Build and strengthen the CKB community through engagement and outreach. This program is designed for community leaders and enthusiasts who want to help grow the Nervos ecosystem. Organize events, create community content, moderate discussions, and help onboard new members. Your efforts will directly contribute to building a stronger, more vibrant CKB community. This campaign requires multiple verification methods to ensure genuine community participation.",
    endorserName: MOCK_ENDORSER_NAMES.communityDao,
    totalRewards: {
      points: ccc.numFrom(4200),
      tokens: [
        { symbol: "CKB", amount: ccc.numFrom(1800) },
        { symbol: "COMM", amount: ccc.numFrom(800) },
      ],
    },
    participants: 234,
    questsCount: 10,
    questsCompleted: 5,
    startDate: "2025-01-01",
    endDate: "2025-10-15",
    status: "active",
    difficulty: "Easy",
    categories: ["Community", "Social", "Events"],
    image: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=400&h=200&fit=crop&crop=center",
    verificationRequirements: {
      telegram: true,
      kyc: false,
      did: true,
      manualReview: true,
      excludeManualReview: false,
    },
    rules: [
      "Must complete Telegram and DID verification",
      "Community engagement must be genuine and helpful",
      "Spam or bot-like behavior will result in disqualification",
      "Manual review required for high-value rewards",
    ],
    completedQuests: 120,
    quests: [
      {
        id: 4,
        title: "Community Engagement Challenge",
        description: "Engage with community members and help newcomers",
        points: ccc.numFrom(150),
        difficulty: "Easy",
        timeEstimate: "2 hours",
        icon: "💬",
        completions: 50,
        rewards: {
          points: ccc.numFrom(150),
          tokens: [{ symbol: "COMM", amount: ccc.numFrom(50) }],
        },
        subtasks: [
          {
            id: 1,
            title: "Help newcomers",
            type: "community",
            completed: false,
            description: "Provide helpful answers to newcomer questions",
            proofRequired: "Screenshots of helpful interactions",
          },
          {
            id: 2,
            title: "Organize community event",
            type: "event",
            completed: false,
            description: "Host or organize a community meetup or online event",
            proofRequired: "Event documentation and attendance proof",
          },
        ],
      },
    ],
  },
  {
    id: 4,
    title: "NFT Creator Bootcamp",
    shortDescription: "Create, mint, and promote NFT collections while learning about digital art and blockchain",
    longDescription: "Dive into the world of NFTs on the CKB blockchain. This comprehensive bootcamp will take you from NFT basics to advanced creation techniques. Learn how to design, mint, and market your NFT collections while understanding the underlying blockchain technology. You'll work with professional tools, learn about metadata standards, smart contract interactions, and build your own NFT portfolio. Perfect for artists, creators, and anyone interested in the intersection of art and blockchain technology.",
    endorserName: MOCK_ENDORSER_NAMES.nftStudios,
    totalRewards: {
      points: ccc.numFrom(6000),
      tokens: [
        { symbol: "CKB", amount: ccc.numFrom(2500) },
        { symbol: "SPORE", amount: ccc.numFrom(1500) },
      ],
    },
    participants: 67,
    questsCount: 12,
    questsCompleted: 0,
    startDate: "2025-02-01",
    endDate: "2025-11-20",
    status: "active",
    difficulty: "Advanced",
    categories: ["NFT", "Art", "Creative"],
    image: "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=400&h=200&fit=crop&crop=center",
    verificationRequirements: {
      telegram: true,
      kyc: false,
      did: true,
      manualReview: false,
      twitter: true,
      discord: true,
    },
    rules: [
      "Complete identity verification and social media connections",
      "NFT creations must be original work",
      "Respect intellectual property rights",
      "Rewards based on quality and engagement",
    ],
    completedQuests: 23,
    quests: [
      {
        id: 5,
        title: "Create Your First NFT",
        description: "Design and mint your first NFT on the CKB blockchain",
        points: ccc.numFrom(250),
        difficulty: "Medium",
        timeEstimate: "90 mins",
        icon: "🎨",
        completions: 23,
        rewards: {
          points: ccc.numFrom(250),
          tokens: [
            { symbol: "CKB", amount: ccc.numFrom(75) },
            { symbol: "SPORE", amount: ccc.numFrom(25) },
          ],
        },
        subtasks: [
          {
            id: 1,
            title: "Design NFT artwork",
            type: "creative",
            completed: false,
            description: "Create original digital artwork for your NFT",
            proofRequired: "Artwork files and design process documentation",
          },
          {
            id: 2,
            title: "Mint NFT on CKB",
            type: "onchain",
            completed: false,
            description: "Use CKB tools to mint your NFT",
            proofRequired: "Transaction hash of minting",
          },
        ],
      },
    ],
  },
  {
    id: 5,
    title: "Bug Bounty Hunter",
    shortDescription: "Find and report bugs in CKB ecosystem projects. Earn rewards for discovering vulnerabilities",
    longDescription: "Join the elite ranks of security researchers protecting the CKB ecosystem. This bug bounty program rewards skilled developers and security experts who can identify vulnerabilities in CKB projects. You'll learn advanced security testing techniques, responsible disclosure practices, and contribute to making the ecosystem safer for everyone. Rewards are based on severity and impact of discovered vulnerabilities. This campaign requires both technical skills and ethical responsibility.",
    endorserName: MOCK_ENDORSER_NAMES.securityAlliance,
    totalRewards: {
      points: ccc.numFrom(2800),
      tokens: [
        { symbol: "CKB", amount: ccc.numFrom(1200) },
        { symbol: "SEC", amount: ccc.numFrom(400) },
      ],
    },
    participants: 45,
    questsCount: 5,
    questsCompleted: 2,
    startDate: "2025-01-10",
    endDate: "2025-08-05",
    status: "active",
    difficulty: "Advanced",
    categories: ["Security", "Development"],
    image: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=400&h=200&fit=crop&crop=center",
    verificationRequirements: {
      telegram: true,
      kyc: true,
      did: false,
      manualReview: false,
    },
    rules: [
      "Technical expertise required for participation",
      "Follow responsible disclosure practices",
      "Verified vulnerabilities only - no false positives",
      "Rewards based on severity and impact",
    ],
    completedQuests: 34,
    quests: [
      {
        id: 6,
        title: "Security Assessment",
        description: "Perform security assessment on CKB smart contracts",
        points: ccc.numFrom(400),
        difficulty: "Advanced",
        timeEstimate: "4 hours",
        icon: "🔍",
        completions: 8,
        rewards: {
          points: ccc.numFrom(400),
          tokens: [
            { symbol: "CKB", amount: ccc.numFrom(200) },
            { symbol: "SEC", amount: ccc.numFrom(100) },
          ],
        },
        subtasks: [
          {
            id: 1,
            title: "Code review",
            type: "technical",
            completed: false,
            description: "Review smart contract code for vulnerabilities",
            proofRequired: "Detailed security report",
          },
          {
            id: 2,
            title: "Submit findings",
            type: "reporting",
            completed: false,
            description: "Submit verified security findings",
            proofRequired: "Vulnerability report with proof of concept",
          },
        ],
      },
    ],
  },
  {
    id: 6,
    title: "Social Media Ambassador",
    shortDescription: "Promote CKB ecosystem on social media platforms. Create engaging content and grow the community",
    longDescription: "Become a voice for the CKB ecosystem across social media platforms. As a Social Media Ambassador, you'll create engaging content, share updates, educate followers about CKB technology, and help grow the community presence online. This campaign is perfect for content creators, influencers, and social media enthusiasts who want to combine their skills with blockchain advocacy. Learn best practices for crypto communication while building your personal brand in the Web3 space.",
    endorserName: MOCK_ENDORSER_NAMES.marketingDao,
    totalRewards: {
      points: ccc.numFrom(1800),
      tokens: [
        { symbol: "CKB", amount: ccc.numFrom(800) },
      ],
    },
    participants: 312,
    questsCount: 8,
    questsCompleted: 4,
    startDate: "2025-01-05",
    endDate: "2025-07-25",
    status: "active",
    difficulty: "Easy",
    categories: ["Social", "Marketing"],
    image: "https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=400&h=200&fit=crop&crop=center",
    verificationRequirements: {
      telegram: true,
      kyc: false,
      did: false,
      manualReview: false,
      twitter: true,
    },
    rules: [
      "Content must be appropriate and professional",
      "Follow social media platform guidelines",
      "Authentic engagement only - no bot activity",
      "Consistent posting schedule required",
    ],
    completedQuests: 156,
    quests: [
      {
        id: 7,
        title: "Content Creator Challenge",
        description: "Create engaging social media content about CKB",
        points: ccc.numFrom(100),
        difficulty: "Easy",
        timeEstimate: "30 mins",
        icon: "📱",
        completions: 78,
        rewards: {
          points: ccc.numFrom(100),
          tokens: [{ symbol: "CKB", amount: ccc.numFrom(25) }],
        },
        subtasks: [
          {
            id: 1,
            title: "Create post",
            type: "social",
            completed: false,
            description: "Create educational or promotional content",
            proofRequired: "Link to social media post",
          },
          {
            id: 2,
            title: "Engage audience",
            type: "social",
            completed: false,
            description: "Respond to comments and questions",
            proofRequired: "Screenshot of engagement metrics",
          },
        ],
      },
    ],
  },
  {
    id: 7,
    title: "Developer Documentation Sprint",
    shortDescription: "Improve developer documentation for CKB tools and libraries. Make onboarding easier for new developers",
    longDescription: "Help make CKB development more accessible by improving documentation. This sprint focuses on creating clear, comprehensive documentation for CKB tools, libraries, and development workflows. You'll review existing docs, identify gaps, write tutorials, create code examples, and ensure new developers can easily get started with CKB development. Your contributions will directly impact developer adoption and the growth of the CKB developer community. Technical writing skills and development experience are valuable for this campaign.",
    endorserName: MOCK_ENDORSER_NAMES.devFoundation,
    totalRewards: {
      points: ccc.numFrom(2200),
      tokens: [
        { symbol: "CKB", amount: ccc.numFrom(1000) },
        { symbol: "DOC", amount: ccc.numFrom(300) },
      ],
    },
    participants: 28,
    questsCount: 6,
    questsCompleted: 1,
    startDate: "2025-01-08",
    endDate: "2025-07-30",
    status: "active",
    difficulty: "Medium",
    categories: ["Documentation", "Development"],
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=200&fit=crop&crop=center",
    verificationRequirements: {
      telegram: true,
      kyc: false,
      did: true,
      manualReview: false,
    },
    rules: [
      "Documentation must be clear and accurate",
      "Follow technical writing best practices",
      "Include working code examples",
      "Test all instructions before submission",
    ],
    completedQuests: 12,
    quests: [
      {
        id: 8,
        title: "Write Developer Guide",
        description: "Create comprehensive developer documentation",
        points: ccc.numFrom(300),
        difficulty: "Medium",
        timeEstimate: "4 hours",
        icon: "📝",
        completions: 6,
        rewards: {
          points: ccc.numFrom(300),
          tokens: [
            { symbol: "CKB", amount: ccc.numFrom(150) },
            { symbol: "DOC", amount: ccc.numFrom(50) },
          ],
        },
        subtasks: [
          {
            id: 1,
            title: "Research topic",
            type: "research",
            completed: false,
            description: "Research the development topic thoroughly",
            proofRequired: "Research notes and references",
          },
          {
            id: 2,
            title: "Write documentation",
            type: "content",
            completed: false,
            description: "Write clear, comprehensive documentation",
            proofRequired: "Documentation draft with examples",
          },
        ],
      },
    ],
  },
  {
    id: 8,
    title: "Learn Blockchain Basics",
    shortDescription: "Complete educational modules about blockchain fundamentals. Perfect for beginners to get started",
    longDescription: "Start your blockchain journey with this comprehensive educational campaign. Designed for complete beginners, you'll learn blockchain fundamentals, understand how CKB works, explore cryptocurrency basics, and gain hands-on experience with wallets and transactions. The campaign includes interactive tutorials, quizzes, and practical exercises to ensure you build a solid foundation. No prior technical knowledge required - just bring your curiosity and willingness to learn about the future of decentralized technology.",
    endorserName: MOCK_ENDORSER_NAMES.educationDao,
    totalRewards: {
      points: ccc.numFrom(1500),
      tokens: [
        { symbol: "CKB", amount: ccc.numFrom(600) },
        { symbol: "EDU", amount: ccc.numFrom(200) },
      ],
    },
    participants: 523,
    questsCount: 5,
    questsCompleted: 0,
    startDate: "2025-01-01",
    endDate: "2025-12-31",
    status: "active",
    difficulty: "Beginner",
    categories: ["Education", "Beginner"],
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400&h=200&fit=crop&crop=center",
    verificationRequirements: {
      telegram: false,
      kyc: false,
      did: false,
      manualReview: false,
    },
    rules: [
      "Complete modules in sequential order",
      "Pass all quizzes with 80% or higher",
      "No time limit - learn at your own pace",
      "Certificates awarded upon completion",
    ],
    completedQuests: 267,
    quests: [
      {
        id: 9,
        title: "Blockchain Basics Quiz",
        description: "Complete the fundamental blockchain knowledge assessment",
        points: ccc.numFrom(100),
        difficulty: "Beginner",
        timeEstimate: "45 mins",
        icon: "🎓",
        completions: 134,
        rewards: {
          points: ccc.numFrom(100),
          tokens: [
            { symbol: "CKB", amount: ccc.numFrom(30) },
            { symbol: "EDU", amount: ccc.numFrom(10) },
          ],
        },
        subtasks: [
          {
            id: 1,
            title: "Study materials",
            type: "educational",
            completed: false,
            description: "Review blockchain fundamentals course materials",
            proofRequired: "Course completion certificate",
          },
          {
            id: 2,
            title: "Take quiz",
            type: "assessment",
            completed: false,
            description: "Complete the knowledge assessment quiz",
            proofRequired: "Quiz results showing 80% or higher score",
          },
        ],
      },
    ],
  },
]

// Helper function to encode verification requirements as bitmask
function encodeVerificationRequirements(requirements: any): number {
  let bitmask = 0
  if (requirements.telegram) bitmask |= 1 << 0
  if (requirements.kyc) bitmask |= 1 << 1
  if (requirements.did) bitmask |= 1 << 2
  if (requirements.manualReview) bitmask |= 1 << 3
  if (requirements.twitter) bitmask |= 1 << 4
  if (requirements.discord) bitmask |= 1 << 5
  if (requirements.reddit) bitmask |= 1 << 6
  return bitmask
}

// Convert mock campaign to schema format
function mockCampaignToSchema(mockCampaign: any): CampaignDataLike {
  // Convert quests first
  const quests: QuestDataLike[] = mockCampaign.quests?.map((quest: any, index: number) => {
    // Create AssetListLike array for rewards
    const rewardsList: AssetListLike[] = quest.rewards?.tokens?.map((token: any) => ({
      ckb_amount: BigInt(0), // No CKB amount in token rewards
      nft_assets: [],
      udt_assets: [{
        amount: BigInt(token.amount.toString()),
        // In real implementation, this would be the UDT type script
        udt_type: {
          codeHash: "0x" + "00".repeat(32) as ccc.Hex,
          hashType: "type" as const,
          args: "0x" + "00".repeat(20) as ccc.Hex
        }
      }]
    })) || []
    
    return createMockQuest(
      quest.title,
      quest.description,
      Number(quest.points?.toString() || quest.rewards?.points?.toString() || 0),
      quest.difficulty === 'Easy' ? 1 : quest.difficulty === 'Medium' ? 2 : 3,
      parseInt(quest.timeEstimate) || 60,
      rewardsList
    )
  }) || []

  return createMockCampaign(
    mockCampaign.id,
    {
      title: mockCampaign.title,
      shortDescription: mockCampaign.shortDescription,
      longDescription: mockCampaign.longDescription,
      endorserName: mockCampaign.endorserName,
      startDate: mockCampaign.startDate,
      endDate: mockCampaign.endDate,
      difficulty: mockCampaign.difficulty === 'Easy' || mockCampaign.difficulty === 'Beginner' ? 1 : 
                 mockCampaign.difficulty === 'Medium' ? 2 : 3,
      categories: mockCampaign.categories,
      image: mockCampaign.image,
      verificationRequirements: encodeVerificationRequirements(mockCampaign.verificationRequirements || {}),
      rules: mockCampaign.rules || [],
      quests
    }
  )
}

// Helper function to generate a mock type hash for a campaign
function generateMockTypeHash(id: number): string {
  // In production, this would be the actual type script hash
  // For mock data, we'll generate a deterministic hash-like string
  return `0x${id.toString(16).padStart(64, '0')}`
}

// Type for mock campaigns with additional UI fields
export interface MockCampaignData extends CampaignDataLike {
  typeHash: string
  // Additional UI fields
  participants: number
  questsCompleted: number
  completedQuests: number
}

// Create a Record of campaigns indexed by typeHash
const MOCK_CAMPAIGNS_RECORD: Record<string, MockCampaignData> = MOCK_CAMPAIGNS.reduce((acc, campaign) => {
  const typeHash = generateMockTypeHash(campaign.id)
  const schemaCampaign = mockCampaignToSchema(campaign)
  
  acc[typeHash] = {
    ...schemaCampaign,
    typeHash,
    participants: campaign.participants || 0,
    questsCompleted: campaign.questsCompleted || 0,
    completedQuests: campaign.completedQuests || 0
  }
  
  return acc
}, {} as Record<string, MockCampaignData>)

// Helper functions for mock data
export function getAllMockCampaigns(): MockCampaignData[] {
  return Object.values(MOCK_CAMPAIGNS_RECORD)
}

export function getMockCampaignByTypeHash(typeHash: string): MockCampaignData | undefined {
  return MOCK_CAMPAIGNS_RECORD[typeHash]
}

export function getFeaturedMockCampaigns(): MockCampaignData[] {
  return getAllMockCampaigns().slice(0, 4)
}
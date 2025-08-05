// MOCK DATA - Replace this entire file with real CKB blockchain data fetching

import type { 
  CampaignDataLike, 
  EndorserInfoLike, 
  QuestDataLike, 
  AssetListLike, 
  QuestMetadataLike, 
  CampaignMetadataLike,
  QuestSubTaskDataLike,
  UDTAssetLike
} from 'ssri-ckboost/types'
import { ccc } from "@ckb-ccc/core"

// Helper function to convert date string to timestamp (seconds)
function dateToTimestamp(dateStr: string): ccc.Num {
  return ccc.numFrom(Math.floor(new Date(dateStr).getTime() / 1000));
}

// Mock endorser info - In production, this would come from the protocol endorsers whitelist
const MOCK_ENDORSERS: Record<string, EndorserInfoLike> = {
  nervos: {
    endorser_lock_hash: "0x" + "0".repeat(64),
    endorser_name: "Nervos Foundation",
    endorser_description: "The official Nervos Foundation supporting ecosystem growth",
    website: "https://nervos.org",
    social_links: ["https://twitter.com/nervosnetwork", "https://github.com/nervosnetwork"],
    verified: 1
  },
  defiAlliance: {
    endorser_lock_hash: "0x" + "1".repeat(64),
    endorser_name: "DeFi Alliance",
    endorser_description: "Leading DeFi protocols and educators on CKB",
    website: "https://defi-alliance.ckb",
    social_links: ["https://twitter.com/defialliance"],
    verified: 1
  },
  communityDao: {
    endorser_lock_hash: "0x" + "2".repeat(64),
    endorser_name: "Community DAO",
    endorser_description: "Decentralized community organization for CKB ecosystem",
    website: "https://community.ckb",
    social_links: ["https://discord.gg/ckbcommunity"],
    verified: 1
  },
  nftStudios: {
    endorser_lock_hash: "0x" + "3".repeat(64),
    endorser_name: "NFT Studios",
    endorser_description: "Premier NFT creation and marketplace on CKB",
    website: "https://nftstudios.ckb",
    social_links: ["https://twitter.com/nftstudios"],
    verified: 1
  },
  securityAlliance: {
    endorser_lock_hash: "0x" + "4".repeat(64),
    endorser_name: "Security Alliance",
    endorser_description: "Security researchers protecting the CKB ecosystem",
    website: "https://security.ckb",
    social_links: ["https://github.com/ckb-security"],
    verified: 1
  },
  marketingDao: {
    endorser_lock_hash: "0x" + "5".repeat(64),
    endorser_name: "Marketing DAO",
    endorser_description: "Community-driven marketing initiatives for CKB",
    website: "https://marketing.ckb",
    social_links: ["https://twitter.com/ckbmarketing"],
    verified: 1
  },
  devFoundation: {
    endorser_lock_hash: "0x" + "6".repeat(64),
    endorser_name: "Dev Foundation",
    endorser_description: "Supporting developer education and tooling",
    website: "https://developers.ckb",
    social_links: ["https://github.com/ckb-dev"],
    verified: 1
  },
  educationDao: {
    endorser_lock_hash: "0x" + "7".repeat(64),
    endorser_name: "Education DAO",
    endorser_description: "Blockchain education and onboarding programs",
    website: "https://education.ckb",
    social_links: ["https://youtube.com/ckbeducation"],
    verified: 1
  }
}

// Helper to create mock UDT assets
function createUDTAsset(symbol: string, amount: ccc.NumLike, scriptHash?: string): UDTAssetLike {
  return {
    udt_script: {
      codeHash: scriptHash || ("0x" + symbol.charCodeAt(0).toString(16).padStart(64, '0')),
      hashType: "type",
      args: "0x" + "0".repeat(64)
    },
    amount
  };
}

// Helper to create mock quest subtasks
function createSubTask(id: number, title: string, type: string, description: string, proofRequired: string): QuestSubTaskDataLike {
  return {
    id,
    title,
    type,
    description,
    proof_required: proofRequired
  };
}

// Helper to create quest metadata
function createQuestMetadata(
  title: string,
  shortDesc: string,
  longDesc: string,
  requirements: string,
  difficulty: number,
  timeEstimate: number
): QuestMetadataLike {
  return {
    title,
    short_description: shortDesc,
    long_description: longDesc,
    requirements,
    difficulty,
    time_estimate: timeEstimate
  };
}

// Helper to create a quest
function createQuest(
  questId: number,
  metadata: QuestMetadataLike,
  rewards: AssetListLike[],
  points: number,
  completionCount: number = 0,
  subTasks: QuestSubTaskDataLike[] = []
): QuestDataLike {
  return {
    quest_id: questId,
    metadata,
    rewards_on_completion: rewards,
    accepted_submission_lock_hashes: [],
    completion_deadline: dateToTimestamp("2025-12-31"),
    status: 1, // Active
    sub_tasks: subTasks,
    points,
    completion_count: completionCount
  };
}

// Create campaign metadata helper
function createCampaignMetadata(
  title: string,
  endorserInfo: EndorserInfoLike,
  shortDesc: string,
  longDesc: string,
  totalRewards: AssetListLike,
  verificationReqs: number[],
  categories: string[],
  difficulty: number,
  imageUrl: string
): CampaignMetadataLike {
  return {
    title,
    endorser_info: endorserInfo,
    short_description: shortDesc,
    long_description: longDesc,
    total_rewards: totalRewards,
    verification_requirements: verificationReqs,
    last_updated: dateToTimestamp(new Date().toISOString()),
    categories,
    difficulty,
    image_url: imageUrl
  };
}

// Define campaign 1 quests
const campaign1Quests: QuestDataLike[] = [
  createQuest(
    1,
    createQuestMetadata(
      "Raid the CKB Announcement",
      "Like, retweet, and comment on the latest CKB announcement on X to help spread awareness",
      "Engage with the latest CKB announcement on X (formerly Twitter) by liking, retweeting, and adding a thoughtful comment. Help spread awareness about CKB's latest developments and join the conversation with the community.",
      "Active X account, follow @NervosNetwork",
      1, // Easy
      120 // 2 minutes
    ),
    [{
      points_amount: 50,
      ckb_amount: 0,
      nft_assets: [],
      udt_assets: []
    }],
    50,
    45,
    [
      createSubTask(1, "Like the announcement", "social", "Like the pinned CKB announcement", "Screenshot of liked post"),
      createSubTask(2, "Retweet with comment", "social", "Retweet adding your thoughts", "Link to your retweet"),
      createSubTask(3, "Follow @NervosNetwork", "social", "Follow the official Nervos account", "Screenshot of following")
    ]
  ),
  createQuest(
    2,
    createQuestMetadata(
      "Deploy Your First Smart Contract",
      "Write and deploy a simple smart contract to CKB testnet using the SDK",
      "Learn the basics of CKB smart contract development by writing and deploying your first contract. Follow our step-by-step guide to create a simple lock script, test it locally, and deploy it to the testnet. This quest introduces you to CKB's unique cell model and RISC-V based smart contracts.",
      "Basic programming knowledge, CKB SDK installed",
      3, // Hard
      3600 // 60 minutes
    ),
    [{
      points_amount: 200,
      ckb_amount: 100,
      nft_assets: [],
      udt_assets: [createUDTAsset("SPORE", 50)]
    }],
    200,
    12
  ),
  createQuest(
    3,
    createQuestMetadata(
      "Create Educational Content",
      "Write a blog post or create a video explaining a CKB concept",
      "Share your knowledge by creating educational content about CKB. Write a detailed blog post (minimum 500 words) or create a video (minimum 3 minutes) explaining a CKB concept like the cell model, xUDT, or Layer 2 solutions. Quality content that helps others understand CKB better will be rewarded.",
      "Content creation skills, understanding of CKB concepts",
      2, // Medium
      5400 // 90 minutes
    ),
    [{
      points_amount: 150,
      ckb_amount: 75,
      nft_assets: [],
      udt_assets: []
    }],
    150,
    23
  )
];

// Create the first mock campaign
const campaign1: CampaignDataLike = {
  endorser: MOCK_ENDORSERS.nervos,
  created_at: dateToTimestamp("2025-01-01"),
  starting_time: dateToTimestamp("2025-01-15"),
  ending_time: dateToTimestamp("2025-08-15"),
  rules: [
    "Complete quests in any order",
    "Each quest can only be completed once per participant",
    "Rewards are distributed weekly",
    "Campaign ends on August 15, 2025"
  ],
  metadata: createCampaignMetadata(
    "CKB Ecosystem Growth Initiative",
    MOCK_ENDORSERS.nervos,
    "Help grow the CKB ecosystem through content creation, development, and community engagement",
    "Help expand the CKB ecosystem through social engagement, development, and community building. This comprehensive campaign includes multiple quest types designed to onboard new users, increase developer adoption, and strengthen community bonds. Participate in various activities ranging from social media engagement to smart contract development, all while earning rewards and contributing to the growth of the Nervos Network.",
    {
      points_amount: 5000,
      ckb_amount: 2000,
      nft_assets: [],
      udt_assets: [createUDTAsset("SPORE", 1000)]
    },
    [1, 0, 0, 0], // Telegram required
    ["Development", "Content", "Community"],
    2, // Medium difficulty
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=200&fit=crop&crop=center"
  ),
  status: 1, // Active
  quests: campaign1Quests,
  participants_count: 156,
  total_completions: 89
};

// Create campaign 2 quests
const campaign2Quests: QuestDataLike[] = [
  createQuest(
    1,
    createQuestMetadata(
      "DeFi Basics Tutorial",
      "Complete the interactive DeFi fundamentals course",
      "Learn the fundamentals of decentralized finance through our interactive course. Cover topics including liquidity pools, yield farming, impermanent loss, and automated market makers. Complete quizzes and practical exercises to demonstrate your understanding.",
      "Basic understanding of blockchain",
      1, // Easy
      1800 // 30 minutes
    ),
    [{
      points_amount: 100,
      ckb_amount: 50,
      nft_assets: [],
      udt_assets: []
    }],
    100,
    67
  ),
  createQuest(
    2,
    createQuestMetadata(
      "Create DeFi Tutorial Content",
      "Produce educational content about DeFi on CKB",
      "Create high-quality educational content about DeFi concepts on CKB. This could be a written guide, video tutorial, or infographic explaining topics like xUDT, liquidity provision, or yield strategies. Content should be beginner-friendly and accurate.",
      "DeFi knowledge, content creation skills",
      2, // Medium
      7200 // 120 minutes
    ),
    [{
      points_amount: 250,
      ckb_amount: 150,
      nft_assets: [],
      udt_assets: [createUDTAsset("DEFI", 100)]
    }],
    250,
    22
  )
];

const campaign2: CampaignDataLike = {
  endorser: MOCK_ENDORSERS.defiAlliance,
  created_at: dateToTimestamp("2025-01-05"),
  starting_time: dateToTimestamp("2025-01-20"),
  ending_time: dateToTimestamp("2025-07-20"),
  rules: [
    "KYC verification required for participation",
    "Complete educational modules before creating content",
    "High-quality content receives bonus rewards",
    "Weekly review of submissions"
  ],
  metadata: createCampaignMetadata(
    "DeFi Education Campaign",
    MOCK_ENDORSERS.defiAlliance,
    "Learn and teach others about DeFi protocols, yield farming, and decentralized finance concepts",
    "Learn and teach about DeFi concepts on CKB through tutorials and content creation. This campaign is designed to educate the community about decentralized finance, covering topics from basic concepts to advanced yield farming strategies. Create educational content, write tutorials, and help others understand the power of DeFi on the Nervos Network. Due to the high-value rewards and regulatory compliance requirements, this campaign requires KYC verification.",
    {
      points_amount: 3500,
      ckb_amount: 1500,
      nft_assets: [],
      udt_assets: [createUDTAsset("DEFI", 500)]
    },
    [0, 1, 0, 0], // KYC required
    ["Education", "DeFi", "Content"],
    2, // Medium difficulty
    "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400&h=200&fit=crop&crop=center"
  ),
  status: 1, // Active
  quests: campaign2Quests,
  participants_count: 89,
  total_completions: 45
};

// Export all campaigns
export const MOCK_CAMPAIGNS: CampaignDataLike[] = [campaign1, campaign2];

// Export mock endorsers for use in other components
export const MOCK_ENDORSER_INFO = MOCK_ENDORSERS;

// Helper function to get campaign by type hash (mock implementation)
export function getMockCampaignByTypeHash(typeHash: string): CampaignDataLike | undefined {
  // In production, this would query the blockchain
  // For now, return a campaign based on a simple hash mapping
  const index = parseInt(typeHash.slice(2, 4), 16) % MOCK_CAMPAIGNS.length;
  return MOCK_CAMPAIGNS[index];
}

// Helper function to get total rewards across all campaigns
export function getTotalMockRewards(): AssetListLike {
  return MOCK_CAMPAIGNS.reduce((total, campaign) => {
    const rewards = campaign.metadata.total_rewards;
    return {
      points_amount: ccc.numFrom(Number(total.points_amount) + Number(rewards.points_amount)),
      ckb_amount: ccc.numFrom(Number(total.ckb_amount) + Number(rewards.ckb_amount)),
      nft_assets: [...total.nft_assets, ...rewards.nft_assets],
      udt_assets: [...total.udt_assets, ...rewards.udt_assets]
    };
  }, {
    points_amount: 0,
    ckb_amount: 0,
    nft_assets: [],
    udt_assets: []
  } as AssetListLike);
}
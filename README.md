# CKBoost Transaction Recipes

Comprehensive transaction skeleton definitions for the CKBoost gamified community engagement platform on Nervos CKB. These recipes define standardized SSRI (Script-Source Rich Information) methods for all platform operations with unified multi-asset support.

## Overview

CKBoost is a gamified community engagement platform that combines campaigns, quests, user verification, and governance into a cohesive ecosystem. All recipes support **mixed asset types** (CKB + NFT + UDT) as optional parameters in unified transactions, eliminating the need for separate asset-specific recipes.

### Key Design Principles

1. **Unified Multi-Asset Support**: Every transaction recipe supports CKB, NFT (CKB Spore), and UDT tokens as optional parameters
2. **Optional Campaign Funding**: Campaigns can be created with or without initial funding 
3. **No History Tracking**: Transactions are inherently trackable; no additional history structures maintained
4. **Funding-First Rewards**: UDT/NFT rewards come from campaign funding unless specifically minted for celebration
5. **SSRI Method Alignment**: All recipes correspond to standardized SSRI interface methods

## Architecture

### Core Contracts
- **ckboost-campaign-type**: Campaign and quest management with multi-asset reward handling
- **ckboost-protocol-type**: Treasury, governance, and user verification 
- **ckboost-campaign-lock**: Secure fund and asset escrow management

### External Protocol Integration
- **CKB Spore**: NFT protocol for digital asset rewards
- **xUDT**: Fungible token standard for token rewards  
- **Standard CKB**: Native capacity for basic rewards and platform fees

## Recipe Organization

Recipes are organized by functional domain with SSRI method names:

```
recipes/
├── campaigns/           # Campaign lifecycle management
│   ├── create_campaign.yaml    # SSRI: create_campaign()
│   └── fund_campaign.yaml      # SSRI: fund_campaign()
├── quests/             # Quest operations
│   ├── create_quest.yaml       # SSRI: create_quest() 
│   └── complete_quest.yaml     # SSRI: complete_quest()
├── rewards/            # Reward distribution
│   └── distribute_rewards.yaml # SSRI: distribute_rewards()
├── governance/         # Platform governance
│   ├── create_treasury_proposal.yaml # SSRI: create_treasury_proposal()
│   └── vote_on_proposal.yaml  # SSRI: vote_on_proposal()
└── users/              # User management
    └── verify_user.yaml        # SSRI: verify_user()
```

## Multi-Asset Transaction Design

### Unified Asset Handling

All transaction recipes support mixed asset types through optional parameters:

- **CKB Capacity**: Always available, sourced from campaign funding or fresh capacity
- **NFT Assets (Spore)**: Optional, typically from campaign funding (`from_funding=1`) or celebration minting (`from_funding=0`)
- **UDT Tokens**: Optional, typically from campaign funding (`from_funding=1`) or celebration minting (`from_funding=0`)

### Asset Source Tracking

The `from_funding` flag in AssetReward structures indicates reward source:
- `from_funding=1`: Asset comes from campaign funding (typical case)
- `from_funding=0`: Asset is freshly minted for celebration/special rewards

### Flexible Funding Model

#### Campaign Creation with Optional Funding
```yaml
# Minimal campaign (no initial funding)
create_campaign(metadata, funding_config)

# Campaign with initial CKB funding  
create_campaign(metadata, funding_config, initial_ckb_amount)

# Campaign with mixed initial assets
create_campaign(metadata, funding_config, initial_ckb_amount, nft_assets, udt_assets)
```

#### Progressive Campaign Funding
```yaml
# Add CKB funding
fund_campaign(campaign_id, ckb_amount)

# Add mixed assets 
fund_campaign(campaign_id, ckb_amount, nft_assets, udt_assets)

# Add only non-CKB assets
fund_campaign(campaign_id, null, nft_assets, udt_assets)
```

## Campaign Lifecycle

### Status Flow
1. **Created (0)**: Initial state, may have some funding
2. **Funding (1)**: Accepting additional funding to reach targets
3. **Active (2)**: Fully funded, quest participation enabled  
4. **Completed (3)**: All quests finished and rewards distributed
5. **Cancelled (4)**: Terminated with fund returns

### Funding Requirements
- Users can only complete quests when campaigns are **Active** (fully funded)
- Campaign creators can add funding at any time during **Created** or **Funding** states
- Community members can contribute funding to support campaigns

## Quest Operations

### Unified Quest Creation
```yaml
# CKB-only rewards
create_quest(campaign_id, requirements, ckb_rewards)

# NFT-only rewards  
create_quest(campaign_id, requirements, null, nft_rewards)

# Mixed rewards (most common)
create_quest(campaign_id, requirements, ckb_rewards, nft_rewards, udt_rewards)
```

### Quest Completion
- **complete_quest()**: Handles mixed reward distribution in single transaction
- Direct completion with proof submission and evidence validation
- All reward types (CKB/NFT/UDT) processed simultaneously when quest completed
- Users can submit completion evidence via local storage or Neon storage for persistence

## Reward Distribution Strategies

### Individual Quest Rewards
- Distributed immediately upon quest completion
- Mixed asset types supported in single transaction
- Automatic escrow release from campaign-controlled assets

### Batch Reward Distribution  
- **distribute_rewards()**: Batch distribution to multiple recipients
- Supports mixing CKB capacity, NFT assets, and UDT tokens
- Efficient for campaign-wide reward events and celebrations

### Asset Escrow Management
- Quest creation locks reward assets in campaign-controlled escrow
- Quest completion triggers automatic escrow release to user
- Unused rewards remain in campaign control for reallocation

## Governance System

### Treasury Proposal Process
1. **create_treasury_proposal()**: Community members propose funding requests
2. **vote_on_proposal()**: Reputation-weighted community voting  
3. Automatic execution when proposal passes quorum requirements

### Voting Mechanics
- Reputation-based vote weighting system
- Transparent vote recording for governance auditability
- Time-bounded voting periods with clear deadlines

## User Verification System

### Verification Levels
- **Basic**: Self-attested identity with minimal requirements
- **Enhanced**: Community-verified identity with reputation requirements  
- **Authority**: Platform or external authority verified identity

### Reputation Integration
- Quest completion increases reputation scores
- Governance participation affects reputation
- Higher reputation enables greater platform privileges

## Technical Implementation

### Molecule Schema Structures

#### CampaignData
```rust
table CampaignData {
    id: Uint64,
    creator: Byte20,
    metadata: Bytes,
    funding_info: CampaignFunding,
    quest_count: Uint32,
    status: Uint8,          // 0=created, 1=funding, 2=active, 3=completed, 4=cancelled
    created_at: Uint64,
    activated_at: Uint64,
}

table CampaignFunding {
    target_amount: Uint64,
    current_amount: Uint64, 
    funding_deadline: Uint64,
    min_threshold: Uint64,
}
```

#### QuestData  
```rust
table QuestData {
    id: Uint64,
    campaign_id: Uint64,
    creator: Byte20,
    requirements: Bytes,
    asset_rewards: AssetRewardVec,  // Mixed CKB/NFT/UDT rewards
    participants: Byte20Vec,
    status: Uint8,                  // 0=created, 1=active, 2=completed, 3=cancelled
    funding_required: Uint8,        // 1=requires funded campaign, 0=standalone
    created_at: Uint64,
    completion_deadline: Uint64,
}

table AssetReward {
    asset_type: Uint8,              // 0=CKB, 1=NFT, 2=UDT
    amount: Uint128,                // CKB capacity or UDT amount
    asset_info: Bytes,              // NFT type args or UDT type args
    from_funding: Uint8,            // 1=from campaign funding, 0=fresh mint
}
```

### Transaction Validation Rules

#### Campaign Operations
- Campaign creation requires protocol cell state update
- Funding validation ensures target amounts and deadlines are respected
- Status transitions follow strict state machine rules

#### Quest Operations  
- Quest creation requires active or funding campaign with available assets
- Participation validation checks campaign funding status and user eligibility
- Quest completion validates proof requirements and asset availability

#### Reward Distribution
- Escrow validation ensures assets are available for distribution
- Multi-asset distribution maintains atomic transaction properties
- Remaining asset handling for partial distributions

## Integration Guidelines

### Frontend Integration
```typescript
// Campaign creation with optional funding
await ckboost.createCampaign({
  metadata: campaignData,
  fundingConfig: fundingRules,
  initialCkb?: ckbAmount,
  nftAssets?: nftList,
  udtAssets?: udtList
});

// Unified quest creation
await ckboost.createQuest({
  campaignId: id,
  requirements: questRules,
  ckbRewards?: ckbAmount,
  nftRewards?: nftList, 
  udtRewards?: udtList
});
```

### Contract Integration
- All recipes include comprehensive CellDeps for multi-contract interactions
- Witness structures provide extensible metadata and proof handling
- HeaderDeps ensure proper transaction validity windows

## Security Considerations

### Asset Safety
- Campaign lock script protects all escrowed assets
- Multi-signature support for high-value campaign management
- Time-based locks for campaign duration enforcement

### Governance Security
- Reputation-weighted voting prevents Sybil attacks
- Proposal execution requires community consensus
- Treasury access controlled by governance mechanisms

### User Protection  
- Quest participation validation prevents unfunded quest engagement
- Reward distribution guarantees atomic asset transfers
- Verification system prevents identity fraud

## Development Status

### Completed Components
- ✅ Unified multi-asset transaction recipes
- ✅ Campaign lifecycle with optional funding
- ✅ Quest operations with mixed reward support
- ✅ Governance and treasury management
- ✅ User verification and reputation system
- ✅ SSRI method alignment and standardization

### Integration Requirements
- Smart contract implementation following recipe specifications
- Frontend integration with unified SSRI methods
- Testing with multi-asset transaction scenarios
- Deployment with proper CellDep management

## Usage Examples

### Creating a Mixed-Asset Campaign
```bash
# Create campaign with CKB + NFT funding
create_campaign(
  metadata: "Community Dev Bootcamp",
  funding_config: {target: 10000, deadline: 30_days},
  initial_ckb: 5000,
  nft_assets: [bootcamp_certificates],
  udt_assets: [merit_tokens]
)
```

### Multi-Reward Quest
```bash  
# Create quest with mixed rewards
create_quest(
  campaign_id: 1,
  requirements: "Complete tutorial series",
  ckb_rewards: 100,
  nft_rewards: [completion_badge],
  udt_rewards: [learning_tokens: 50]
)
```

### Batch Reward Distribution
```bash
# Distribute mixed rewards to multiple winners
distribute_rewards(
  campaign_id: 1, 
  recipients: [user1, user2, user3],
  ckb_amounts: [200, 150, 100],
  nft_rewards: [gold_badge, silver_badge, bronze_badge],
  udt_amounts: [100, 75, 50]
)
```

This unified approach eliminates complexity while maintaining full flexibility for all CKBoost platform operations with comprehensive multi-asset support. 
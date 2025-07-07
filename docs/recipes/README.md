# CKBoost Transaction Skeleton Recipes

This directory contains comprehensive transaction skeleton designs for all CKBoost platform operations. These YAML specifications define the input/output structure, validation rules, and dependencies for each type of transaction on the platform.

## Overview

CKBoost is a gamified community engagement platform built on CKB smart contracts. The platform enables:

- **Campaign Management**: Create and fund community campaigns
- **Quest System**: Add quests to campaigns with reward mechanisms  
- **Multi-Asset Rewards**: Support for CKB, NFTs (CKB Spore), and UDT tokens
- **User Verification**: Verify users and track reputation scores
- **Governance**: Treasury proposals and community voting
- **Reward Distribution**: Automated reward distribution to quest completers

## Multi-Asset Reward System

CKBoost supports three types of rewards:

- **CKB Rewards**: Native CKB tokens for basic quest completion
- **NFT Rewards**: CKB Spore NFTs for special achievements, collectibles, and unique quest completions
- **UDT Rewards**: User Defined Tokens for community tokens, project tokens, or custom reward mechanisms

## Transaction Flow Architecture

```
User Registration/Verification
         ↓
Campaign Creation → Campaign Funding → Quest Creation (CKB/NFT/UDT) → Quest Completion → Reward Distribution
         ↓              ↓                   ↓                                   ↓                    ↑
         └──────────────┴───────────────────┴───────────────────────────────────┴────────────────────┘
                                             ↓                                                        ↑
Treasury Proposal Creation ←────────── Treasury Proposal Voting ─────────────────────────────────────┘
```

## Available Transaction Skeletons

### Core Platform Operations (CKB Rewards)

1. **[campaign-creation.yaml](./campaign-creation.yaml)**
   - Creates new campaigns with initial CKB funding and funding targets
   - Establishes campaign governance and fund management
   - **Dependencies**: Protocol cell for campaign counter management
   - **Key Contracts**: `ckboost-campaign-type`, `ckboost-campaign-lock`

2. **[campaign-funding.yaml](./campaign-funding.yaml)**
   - Adds additional funding to existing campaigns
   - Allows community members to contribute to campaign funding
   - **Dependencies**: Campaign cell in funding status
   - **Key Contracts**: `ckboost-campaign-type`, `ckboost-campaign-lock`

3. **[quest-creation.yaml](./quest-creation.yaml)**  
   - Adds quests to existing campaigns with CKB rewards
   - Allocates CKB reward pools for quest completion
   - **Dependencies**: Campaign cell (funding status dependent)
   - **Key Contracts**: `ckboost-campaign-type`

4. **[quest-completion.yaml](./quest-completion.yaml)**
   - Handles quest completion and immediate CKB reward claiming
   - Updates user verification and reputation scores
   - **Dependencies**: Active quest cell, user verification cell, fully funded campaign
   - **Key Contracts**: `ckboost-campaign-type`, `ckboost-protocol-type`

5. **[reward-distribution.yaml](./reward-distribution.yaml)**
   - Batch distribution of CKB rewards to multiple users
   - Efficient handling of campaign reward payouts
   - **Dependencies**: Campaign treasury cell with available funds
   - **Key Contracts**: `ckboost-campaign-lock`, `ckboost-campaign-type`

### Governance Operations

6. **[treasury-proposal-creation.yaml](./treasury-proposal-creation.yaml)**
   - Creates governance proposals for treasury fund allocation
   - Establishes voting parameters and deadlines
   - **Dependencies**: Protocol treasury cell
   - **Key Contracts**: `ckboost-protocol-type`

7. **[treasury-proposal-voting.yaml](./treasury-proposal-voting.yaml)**
   - Enables community voting on treasury proposals
   - Calculates voting weight based on user reputation
   - **Dependencies**: Active proposal cell, user verification cell
   - **Key Contracts**: `ckboost-protocol-type`

### User Management

8. **[user-verification.yaml](./user-verification.yaml)**
   - Verifies user identity and establishes reputation
   - Creates user verification records on-chain
   - **Dependencies**: Protocol verification registry
   - **Key Contracts**: `ckboost-protocol-type`

## Campaign Lifecycle and Funding States

CKBoost campaigns follow a structured lifecycle with distinct funding phases:

### Campaign States
- **Created (0)**: Campaign just created, awaiting initial funding
- **Funding (1)**: Campaign accepting additional funding from creators/community  
- **Active (2)**: Campaign fully funded, quests accept completion submissions
- **Completed (3)**: Campaign finished, all quests completed
- **Cancelled (4)**: Campaign terminated, funds returned

### Funding Requirements
- **Initial Funding**: Campaign creators provide initial funding at creation
- **Funding Target**: Campaigns specify target funding amount and deadline
- **Community Funding**: Anyone can contribute additional funding via `campaign-funding.yaml`
- **Activation Threshold**: Campaigns must reach minimum funding to become active
- **Quest Completion**: Users can only complete quests from fully funded campaigns

### Funding Validation Flow
1. Campaign created with initial funding and target
2. Campaign creator or community adds additional funding
3. Once target reached, campaign status changes to "active"
4. Users can then submit quest completions for active campaigns
5. Quest completion and rewards only available for active campaigns

## Contract Architecture

### Smart Contracts

- **`ckboost-campaign-type`**: Manages campaign and quest lifecycle, validation logic for all reward types
- **`ckboost-protocol-type`**: Handles governance, user verification, treasury management  
- **`ckboost-campaign-lock`**: Secures campaign funds and controls reward distribution for all asset types

### External Contract Integration

- **`spore`**: CKB Spore protocol for NFT rewards and digital collectibles
- **`xudt`**: Extended UDT protocol for fungible token rewards

### Cell Types

- **Campaign Cells**: Store campaign metadata and CKB funding pools
- **Quest Cells**: Store quest requirements and reward allocations (CKB/NFT/UDT references)
- **NFT Escrow Cells**: Store Spore NFTs awaiting distribution
- **UDT Escrow Cells**: Store UDT tokens awaiting distribution
- **Protocol Cells**: Store platform state and governance data
- **User Verification Cells**: Store user reputation and verification data
- **Proposal Cells**: Store governance proposals and voting state

## Multi-Asset Reward Design Principles

### Asset Type Handling
- **CKB Rewards**: Handled through capacity in standard cells
- **NFT Rewards**: Handled through Spore type script and metadata
- **UDT Rewards**: Handled through xUDT type script and uint128 amounts
- **Mixed Rewards**: Multiple output cells of different types per recipient

### Escrow Mechanism
- All non-CKB rewards are held in escrow by campaign lock script
- Escrow ensures rewards are available when quests are completed
- Escrow cells can be batched for efficient distribution
- Unused escrow assets can be returned to quest creators

### Transaction Optimization
- Batch distribution to minimize transaction costs
- Support for partial distributions when hitting transaction size limits
- Efficient capacity calculations for mixed asset types
- Proper change cell handling for all asset types

## Design Principles

### Transaction Structure
All transactions follow the standard YAML template:
- **Inputs**: Cells consumed by the transaction
- **Outputs**: Cells created by the transaction  
- **HeaderDeps**: Required block headers for validation
- **CellDeps**: Required contract code and reference data
- **Witnesses**: Signatures and proof data

### Security Considerations
- **Funding-Gated Completion**: Users must wait for campaigns to be fully funded before completing quests
- Multi-signature requirements for high-value operations
- Time-based locks for campaign duration management
- Reputation-weighted voting for governance decisions
- Proof validation for quest completion
- Anti-double-spending protections
- Asset type validation to prevent incorrect reward distribution
- Campaign funding validation and threshold enforcement

### Gas Optimization
- Batch operations where possible (mixed reward distribution)
- Minimal cell data structures using Molecule schemas
- Efficient witness data organization
- Optimized capacity calculations for different asset types
- Strategic use of CellDeps to minimize transaction size

## Usage Guidelines

### For Contract Developers
1. Use these skeletons as specifications for contract validation logic
2. Implement the cell data structures using the referenced Molecule schemas
3. Ensure all validation rules are enforced for each asset type
4. Add comprehensive error handling for edge cases
5. Implement proper asset type validation in lock/type scripts

### For Frontend Developers  
1. Use these skeletons to build transaction construction utilities
2. Implement proper capacity calculation for each transaction type and asset combination
3. Handle signing workflows and witness data preparation
4. Create user-friendly interfaces for multi-asset reward selection
5. Implement asset type detection and proper UI display

### For Integration
1. Follow the dependency chains when implementing operations
2. Ensure proper cell state management across transactions
3. Implement rollback mechanisms for failed operations
4. Add monitoring for transaction success/failure rates across asset types
5. Handle asset type compatibility and conversion where needed

## Asset Type Implementation Guide

### NFT (Spore) Integration
- Use CKB Spore protocol for NFT creation and management
- Implement proper metadata handling and content addressing
- Support for NFT collections and rarity systems
- Integration with NFT marketplaces and display systems

### UDT Token Integration  
- Use xUDT (Extended UDT) protocol for maximum compatibility
- Support for custom token economics and distribution rules
- Integration with DeFi protocols and token exchanges
- Proper decimal handling and amount calculations

### Mixed Asset Scenarios
- Quest rewards with multiple asset types
- Progressive reward unlocking (CKB → UDT → NFT)
- Seasonal or event-based reward mechanisms
- Community-driven reward pool contributions

## Next Steps

After implementing these transaction skeletons:

1. **Contract Implementation**: Use skeletons to guide contract validation logic for all asset types
2. **SDK Development**: Build TypeScript/JavaScript SDK based on these patterns with multi-asset support
3. **Testing**: Create comprehensive test suites covering all transaction types and asset combinations
4. **Documentation**: Generate API documentation from these specifications
5. **Optimization**: Profile and optimize transaction costs and execution time for mixed asset operations
6. **Asset Integration**: Implement proper integration with Spore and xUDT protocols

## Related Documentation

- [Molecule Schemas](../schemas/): Data structure definitions including asset type schemas
- [Contract Specifications](../contracts/): Detailed contract behavior for multi-asset support
- [Integration Guide](../integration/): How to integrate with CKBoost platform and external protocols
- [Security Audit](../security/): Security considerations and audit results for multi-asset operations
- [Asset Type Guide](../assets/): Detailed guide for different reward asset types and their properties 
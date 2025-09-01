# Milestone 1 Report for CKBoost

## Overview

CKBoost Milestone 1 delivers the bare bone framework for CKBoost, the gamified engagement platform on CKB testnet, implementing core smart contracts, dApp infrastructure, and essential user workflows. Additionally, the ckb_deterministic framework was developed to provide standardized smart contract validation patterns.

Notes: In milestone 1, we focus on delivering the bare bone framework of the project which involves a high level of interdependency between core modules of both smart contracts and dApp. As we progress to the next milestones, we will switch to issue based development and continuous delivery.

## ✅ Delivered Components

### Core Features

- ✅ Protocol deployment with multi-admin management
- ✅ Campaign creation with quest quota system
- ✅ UDT funding through secure lock contracts
- ✅ Campaign approval with on-chain registry.
- ✅ Quest submission interface with markdown support and Nostr intermediate storage
- ✅ User registration data storage
- ✅ Submission review/approval, Points UDT reward minting, and UDT distribution for rewards
- ✅ Unified molecule schema and type generation

### Smart Contract Layer

- ✅ 5 core contracts deployed: `ckboost-protocol-type`, `ckboost-campaign-type`, `ckboost-campaign-lock`, `ckboost-user-type`, `ckboost-points-udt`
- ✅ ConnectedTypeID pattern for O(1) cell lookups and binding using type_id
- ✅ Quest submission/approval/reward workflow with on-chain registry.
- ✅ Rule-based validation for all contracts
- ✅ SSRI Compliance for all contracts

### CKB Deterministic Framework

- ✅ Comprehensive framework for deterministic smart contract development
- ✅ Unified TransactionRecipe style routing in combination with SSRI.
- ✅ Transaction context with recipe parsing and dependency validation
- ✅ Universal and customizable cell classification and retrieval
- ✅ ValidationPredicate functions with full TransactionContext access
- ✅ Jest-like assertion
- ✅ Type ID implementation and utilities
- ✅ Wrapped debug macros (debug_trace, debug_info) for contract debugging

### CKBoost Shared Library

- ✅ Shared Rust library for common contract functionality
- ✅ Molecule type definitions generated from unified schema during build
- ✅ Common error types and error handling across all contracts
- ✅ Universal TransactionContext for all contracts
- ✅ Shared validation rules and helper functions
- ✅ ConnectedTypeID implementation for type_id pattern

### dApp Infrastructure

- ✅ React/Next.js deployment: [CKBoost](https://ckboost.netlify.app/)
- ✅ SSRI integration for transaction building/validation separation
- ✅ Three role-based dashboards implemented: Platform Admin, Campaign Admin, and User
- ✅ Wallet connectivity via @ckb-ccc/connector-react
- ✅ Nostr integration for intermediate decentralized submission storage

### SSRI-CKBoost Library

- ✅ TypeScript SDK for complete dApp-contract interaction
- ✅ SSRI trait implementations for Protocol, Campaign, and User contracts
- ✅ Transaction building helpers for all contract methods
- ✅ @ckb-ccc integration for wallet operations

### Dev Utilities

- ✅ Automated contract deployment script with upgrade support
- ✅ New TypeScript generation script with ccc integration for molecule schema during build with both exact and Like types for flexibility
- ✅ Contract upgrade management with tag versioning
- ✅ Wrapper for transaction debugger
  - ✅ Debug from transaction hash
  - ✅ Debug from raw transaction input (directly copy from wallet like UTXOGlobal)

## 📊 Testing & Documentation Status

- ⏰ Test coverage designed and drafted but not strictly implemented yet
- ⏰ Milestone 1 Testing Guideline pending
- ✅ PRD-driven development methodology established
- ✅ CKB Deterministic framework examples

## ⚠️ Deferred Issues & New Todo Items

The following issues are deferred as they are not critical features at the moment but they will be registered as trackable issues.

### 1. Approve Completion - Status Check Commented Out

**File**: `/contracts/contracts/ckboost-campaign-type/src/recipes.rs`
**Content**:

```rust
// TODO: Not handling this for now
// // Verify campaign status is active (4)
// if input_campaign_data.status() != 4u8.into() {
//     debug!("Campaign is not active, status: {}", input_campaign_data.status());
//     return Err(DeterministicError::BusinessRuleViolation);
// }
```

**Issue**: Campaign status validation is disabled, allowing approval at any status.
**Status**: Deferred as only necessary for marginal cases.

### 2. Protocol Type - Timestamp

**File**: `/contracts/contracts/ckboost-protocol-type/src/recipes.rs`
**Content**:

```rust
// TODO: Implement proper timestamp retrieval from header deps
// TODO: Check expiration when we have proper timestamp access
```

**Issue**: Protocol timestamp is accurate and validated
**Status**: Deferred as only needed in tipping proposal and it is not a critical feature at the moment.

### 3. SSRI Server Error Reporting

**File**: Multiple service files in `/dapp/lib/services/`
**Issue**: When SSRI server is not ready, errors are generic.
**Status**: Deferred as implementations of executor is not confirmed yet and it shouldn't be sensible to generic users.

### 4. Re-funding after approval of campaign

**Issue**: After approval of campaign, the re-funding interface is not available yet.
**Status**: Deferred as it is not a critical feature at the moment.

### 5. Store Campaign cover with Nostr

**Issue**: Campaign cover should be stored on Nostr
**Status**: Deferred as it is not a critical feature at the moment.

### 6. Rewards stats for campaign detail page

**Issue**: It's getting the available rewards but not the distributed rewards.
**Status**: Deferred as it is not a critical feature at the moment.

### 7. Endorser info for campaigns

**Issue**: Endorser info is not showing up for campaigns.
**Status**: Deferred as it is not a critical feature at the moment.
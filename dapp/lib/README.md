# CKBoost Library Structure

This directory contains all the core logic for campaign and quest management in the CKBoost application.

## Directory Structure

```
lib/
├── types/           # TypeScript type definitions
│   └── campaign.ts  # Campaign, Quest, and CKB-specific types
├── mock/            # Mock data (temporary - remove after CKB integration)
│   └── mock-campaigns.ts  # Static campaign data for development
├── ckb/             # CKB blockchain integration
│   └── campaign-cells.ts  # Cell operations for campaigns and user progress
├── services/        # Business logic services
│   └── campaign-service.ts  # Abstraction layer between mock and real data
├── providers/       # React context providers
│   └── campaign-provider.tsx  # Campaign data provider with CCC integration
├── utils/           # Utility functions
│   └── campaign-utils.ts  # Helper functions for campaigns
├── utils.ts         # General utilities (from Next.js template)
├── index.ts         # Main exports
└── README.md        # This file
```

## How to Integrate Real CKB Data

### Step 1: Configure CKB Scripts

Edit `lib/ckb/campaign-cells.ts` and update the script configurations:

```typescript
const CAMPAIGN_TYPE_SCRIPT = {
  codeHash: "0x...", // Your deployed campaign type script code hash
  hashType: "type" as const,
  args: "0x" // Campaign registry args
}

const USER_PROGRESS_TYPE_SCRIPT = {
  codeHash: "0x...", // Your deployed user progress type script code hash  
  hashType: "type" as const,
  args: "0x" // User progress args
}
```

### Step 2: Implement Cell Parsing

Replace the TODO comments in `lib/ckb/campaign-cells.ts` with actual implementations:

1. **Campaign Cell Parsing**: Implement `parseCampaignCell()` using your molecule schema
2. **User Progress Parsing**: Implement `parseUserProgressCell()` for user data
3. **Cell Fetching**: Implement `fetchCampaignCells()` to query the blockchain
4. **Transaction Building**: Implement quest completion and campaign creation

### Step 3: Enable Real Data

In `lib/services/campaign-service.ts`, change the configuration:

```typescript
// Change this to true when ready
const USE_REAL_CKB_DATA = true
```

### Step 4: Test Integration

The service layer will automatically handle fallbacks:
- If CKB data fails, it falls back to mock data
- Gradual migration is supported
- Error handling is built-in

## Data Flow

```
Components (UI)
     ↓
Provider (campaign-provider.tsx)
     ↓  
Service (campaign-service.ts)
     ↓
Mock Data ← → CKB Blockchain
(mock-campaigns.ts)   (campaign-cells.ts)
```

## Development vs Production

### Development Mode
- Uses `mock/mock-campaigns.ts` for static data
- No CKB connection required
- Fast development and testing

### Production Mode  
- Fetches data from CKB blockchain via `ckb/campaign-cells.ts`
- Real-time updates from blockchain
- User wallet integration required

## Key Files to Modify

1. **`lib/ckb/campaign-cells.ts`** - Implement all TODO functions
2. **`lib/services/campaign-service.ts`** - Set `USE_REAL_CKB_DATA = true`
3. **`lib/mock/mock-campaigns.ts`** - Remove after CKB integration

## TypeScript Types

All types are defined in `lib/types/campaign.ts`:
- `Campaign` - Main campaign structure
- `Quest` & `Subtask` - Quest management
- `CKBCampaignCell` - Blockchain cell structure
- `UserProgress` - User progress tracking

## React Integration

Import from the main lib entry point:

```typescript
import { useCampaigns, useCampaign, Campaign } from '@/lib'
```

The provider handles all data management automatically.
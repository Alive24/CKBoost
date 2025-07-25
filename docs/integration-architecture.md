# CKBoost On-Chain Data Integration Architecture

## Overview

This document outlines the architecture for integrating on-chain CKB data with the CKBoost dApp, enabling real-time display and interaction with protocol cells, campaigns, and user data.

## Architecture Layers

### 1. Smart Contract Layer (On-Chain)
- **Protocol Type/Lock Scripts**: Manage protocol state and permissions
- **Campaign Type/Lock Scripts**: Handle campaign lifecycle and funding
- **User Type Scripts**: Manage user verification and reputation
- **Cell Data**: Stored using Molecule schema serialization

### 2. Data Access Layer (CKB-CCC)
- **Cell Collectors**: Query cells by type/lock scripts
- **Transaction Builders**: Construct and send transactions
- **Data Deserializers**: Convert Molecule-encoded data to TypeScript objects

### 3. Service Layer (dApp)
- **Protocol Service**: Manages protocol data fetching and caching
- **Campaign Service**: Handles campaign CRUD operations
- **User Service**: Manages user profiles and verification

### 4. UI Layer (React Components)
- **Provider Components**: React Context for global state
- **Hook Components**: Custom hooks for data fetching
- **Display Components**: UI components showing on-chain data

## Implementation Flow

### Phase 1: Contract Deployment & Protocol Setup

1. **Deploy Contracts** (using deployment script)
   ```bash
   cd /path/to/CKBoost
   ./scripts/deployment/deploy-contracts.sh
   ```
   This generates `.env.contracts` with all code hashes.

2. **Configure dApp Environment**
   - Copy contract addresses from `.env.contracts` to `dapp/.env.local`
   - Example env variables:
   ```
   NEXT_PUBLIC_CKB_PROTOCOL_TYPE_CODE_HASH=0x...
   NEXT_PUBLIC_CKB_PROTOCOL_LOCK_CODE_HASH=0x...
   NEXT_PUBLIC_CKB_CAMPAIGN_TYPE_CODE_HASH=0x...
   ```

3. **Deploy Protocol Cell** (via dApp UI)
   - Navigate to `/platform-admin`
   - Click "Deploy Protocol Cell"
   - Fill in script code hashes from deployment
   - Submit transaction

### Phase 2: Cell Query Implementation

#### Protocol Cell Query Pattern
```typescript
// lib/ckb/protocol-cells.ts
export async function findProtocolCell(client: ccc.Client): Promise<Cell | null> {
  const typeScript = {
    codeHash: process.env.NEXT_PUBLIC_CKB_PROTOCOL_TYPE_CODE_HASH!,
    hashType: "type" as const,
    args: process.env.NEXT_PUBLIC_CKB_PROTOCOL_TYPE_ARGS || "0x"
  }
  
  const collector = client.findCellsByType(typeScript, "asc")
  
  for await (const cell of collector) {
    // Protocol cell is singleton, return first match
    return cell
  }
  
  return null
}
```

#### Campaign Cells Query Pattern
```typescript
// lib/ckb/campaign-cells.ts
export async function findCampaignCells(client: ccc.Client): Promise<Cell[]> {
  const typeScript = {
    codeHash: process.env.NEXT_PUBLIC_CKB_CAMPAIGN_TYPE_CODE_HASH!,
    hashType: "data1" as const,
    args: "0x" // Empty args for all campaigns
  }
  
  const campaigns: Cell[] = []
  const collector = client.findCellsByType(typeScript, "asc", 100)
  
  for await (const cell of collector) {
    campaigns.push(cell)
  }
  
  return campaigns
}
```

### Phase 3: Data Deserialization

#### Using Generated Molecule Code
```typescript
// lib/utils/molecule-parser.ts
import { UnpackProtocolData, UnpackCampaignData } from "ssri-ckboost"

export function parseProtocolCell(cell: Cell): ProtocolData {
  const rawData = cell.outputData
  const unpacked = UnpackProtocolData(hexToArrayBuffer(rawData))
  
  return {
    campaigns: unpacked.campaigns_approved.map(c => bufferToNumber(c)),
    tippingProposals: unpacked.tipping_proposals.map(parseTippingProposal),
    lastUpdated: bufferToNumber(unpacked.last_updated),
    // ... map other fields
  }
}
```

### Phase 4: React Integration

#### Protocol Provider Pattern
```typescript
// lib/providers/protocol-provider.tsx
export function ProtocolProvider({ children }: { children: React.ReactNode }) {
  const { client } = useCKB()
  const [protocolData, setProtocolData] = useState<ProtocolData | null>(null)
  
  useEffect(() => {
    async function loadProtocol() {
      const cell = await findProtocolCell(client)
      if (cell) {
        const data = parseProtocolCell(cell)
        setProtocolData(data)
      }
    }
    
    loadProtocol()
    // Set up polling or WebSocket for real-time updates
    const interval = setInterval(loadProtocol, 30000) // Poll every 30s
    
    return () => clearInterval(interval)
  }, [client])
  
  return (
    <ProtocolContext.Provider value={{ protocolData }}>
      {children}
    </ProtocolContext.Provider>
  )
}
```

#### Campaign Display Component
```typescript
// components/campaign-list.tsx
export function CampaignList() {
  const { campaigns, isLoading } = useCampaigns()
  
  if (isLoading) return <Skeleton />
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {campaigns.map(campaign => (
        <CampaignCard key={campaign.id} campaign={campaign} />
      ))}
    </div>
  )
}
```

## Data Flow Example: Creating a Campaign

1. **User Action**: Fills campaign creation form
2. **Transaction Building**:
   - Get protocol cell (increment campaign counter)
   - Create campaign cell with initial funding
   - Add necessary cell deps
3. **Sign & Send**: Via wallet connector
4. **Update UI**: 
   - Show pending state
   - Poll for transaction confirmation
   - Refresh campaign list

## Performance Optimization

### 1. Caching Strategy
```typescript
// Use React Query or SWR for intelligent caching
const { data: campaigns } = useSWR(
  'campaigns',
  () => fetchCampaigns(client),
  {
    refreshInterval: 30000, // Refresh every 30s
    revalidateOnFocus: true,
    dedupingInterval: 5000
  }
)
```

### 2. Batch Cell Queries
```typescript
// Query multiple cell types in parallel
const [protocolCell, campaignCells, userCells] = await Promise.all([
  findProtocolCell(client),
  findCampaignCells(client),
  findUserCells(client)
])
```

### 3. Pagination for Large Datasets
```typescript
export async function findCampaignsPaginated(
  client: ccc.Client,
  page: number = 1,
  pageSize: number = 20
): Promise<{ campaigns: Campaign[], hasMore: boolean }> {
  const collector = client.findCellsByType(campaignTypeScript, "desc", pageSize + 1)
  
  // Skip to page
  let skipped = 0
  for await (const cell of collector) {
    if (skipped < (page - 1) * pageSize) {
      skipped++
      continue
    }
    // Process cells...
  }
}
```

## Security Considerations

1. **Data Validation**: Always validate deserialized data
2. **Script Verification**: Verify cell scripts match expected values
3. **Transaction Limits**: Implement rate limiting for write operations
4. **Error Handling**: Graceful degradation when cells not found

## Testing Strategy

### 1. Mock Cell Data
```typescript
// __tests__/mocks/cell-data.ts
export const mockProtocolCell = {
  cellOutput: {
    capacity: "0x...",
    lock: { ... },
    type: { ... }
  },
  data: "0x..." // Molecule-encoded test data
}
```

### 2. Integration Tests
```typescript
// __tests__/integration/protocol-loading.test.ts
it('should load and parse protocol cell', async () => {
  const client = createMockClient([mockProtocolCell])
  const data = await loadProtocolData(client)
  
  expect(data.campaigns).toHaveLength(0)
  expect(data.lastUpdated).toBeGreaterThan(0)
})
```

## Next Steps

1. **Immediate Actions**:
   - Deploy contracts to testnet
   - Configure environment variables
   - Deploy protocol cell via UI

2. **Development Tasks**:
   - Implement cell query functions
   - Add data parsing utilities
   - Create React providers and hooks
   - Build UI components

3. **Future Enhancements**:
   - WebSocket subscriptions for real-time updates
   - Offline-first architecture with IndexedDB
   - Advanced caching with service workers
   - GraphQL API layer (optional)

## Resources

- [CKB-CCC Documentation](https://github.com/ckb-js/ccc)
- [Molecule Schema](../schemas/ckboost.mol)
- [Transaction Skeletons](./recipes/)
- [SSRI Integration](../contracts/libs/ckboost-shared/)
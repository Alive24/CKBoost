# Campaign Fetching Optimization

## Overview

This document describes the optimization implemented for fetching approved campaigns from the CKB blockchain, improving from O(n) to O(1) lookup time.

## Problem Statement

Previously, campaigns were stored in the protocol data using their `type_hash`. To fetch a campaign by its type_hash, we had to:
1. Query all campaign cells with the campaign code hash
2. Iterate through each cell
3. Compute the type hash for each cell
4. Compare with the target type hash

This resulted in O(n) complexity where n is the total number of campaigns on the blockchain.

## Solution: Store Type ID Instead of Type Hash

### Key Insight

Campaign cells use `ConnectedTypeID` as their type script args, which contains:
- `type_id`: A unique identifier for the campaign (32 bytes)
- `connected_type_hash`: The type hash of the connected protocol (32 bytes)

By storing the `type_id` instead of `type_hash` in the protocol's `campaigns_approved` list, we can construct the exact type script args and perform a direct lookup.

### Implementation Details

#### 1. New Fetch Function

```typescript
export async function fetchCampaignByTypeId(
  typeId: ccc.Hex,
  campaignCodeHash: ccc.Hex,
  signer: ccc.Signer
): Promise<ccc.Cell | undefined>
```

This function:
1. Takes the type_id as input
2. Constructs the ConnectedTypeID args with the type_id and protocol type hash
3. Creates an exact search key with the constructed args
4. Performs a single query with exact match - O(1) operation

#### 2. Backward Compatibility

The system maintains backward compatibility:
- When fetching campaigns, it first tries the optimized `fetchCampaignByTypeId`
- If that fails (for old data), it falls back to `fetchCampaignByTypeHash`
- This ensures existing approved campaigns continue to work

#### 3. Migration Path

When approving new campaigns:
1. Extract the type_id from the campaign cell's ConnectedTypeID args
2. Store the type_id in `campaigns_approved` instead of type_hash
3. Old approvals with type_hash continue to work via fallback

### Helper Functions

#### Extract Type ID from Campaign Cell
```typescript
export function extractTypeIdFromCampaignCell(cell: ccc.Cell): ccc.Hex | undefined
```
Extracts the type_id from a campaign cell's ConnectedTypeID args.

#### Convert Type Hash to Type ID
```typescript
export async function convertTypeHashToTypeId(
  typeHash: ccc.Hex,
  signer: ccc.Signer
): Promise<ccc.Hex>
```
Helper function to migrate existing type_hashes to type_ids.

## Performance Benefits

### Before Optimization
- **Complexity**: O(n) where n = total campaigns
- **Operations**: n cell fetches + n hash computations
- **Time**: Grows linearly with number of campaigns

### After Optimization
- **Complexity**: O(1)
- **Operations**: 1 exact cell query
- **Time**: Constant regardless of total campaigns

### Example Performance Impact

With 100 campaigns on the blockchain:
- **Before**: 100 queries + 100 hash computations
- **After**: 1 exact query

With 1000 campaigns:
- **Before**: 1000 queries + 1000 hash computations  
- **After**: 1 exact query

## Usage

### Fetching Approved Campaigns

```typescript
// In campaign provider
for (const identifier of protocolData.campaigns_approved || []) {
  // Try optimized fetch by type_id first
  let campaignCell = await fetchCampaignByTypeId(
    identifier,
    campaignCodeHash,
    signer
  );
  
  // Fall back to type_hash method if needed
  if (!campaignCell) {
    campaignCell = await fetchCampaignByTypeHash(identifier, signer);
  }
}
```

### Approving New Campaigns

```typescript
// Extract type_id for optimized storage
const typeId = extractTypeIdFromCampaignCell(campaignCell);
if (typeId) {
  // Store type_id instead of type_hash
  updatedCampaignsApproved.push(typeId);
} else {
  // Fall back to type_hash if extraction fails
  updatedCampaignsApproved.push(typeHash);
}
```

## Migration Strategy

1. **Phase 1**: Deploy code with backward compatibility (current implementation)
2. **Phase 2**: New approvals automatically use type_id
3. **Phase 3**: Optional migration script to convert existing type_hashes to type_ids
4. **Phase 4**: After all data migrated, remove fallback code (optional)

## Technical Notes

### Type ID vs Type Hash

- **Type Hash**: Hash of the entire type script (code_hash + hash_type + args)
- **Type ID**: First 32 bytes of the ConnectedTypeID args, unique identifier
- **Storage**: Both are 32 bytes (64 hex characters)

### CKB Query Optimization

The CKB indexer is optimized for exact script matching. By constructing the exact args, we leverage the indexer's built-in optimization rather than fetching and filtering results client-side.

## Future Improvements

1. **Batch Fetching**: Fetch multiple campaigns in parallel when type_ids are known
2. **Caching Layer**: Cache campaign cells by type_id in memory/local storage
3. **Migration Tool**: Automated tool to migrate all existing type_hashes to type_ids
4. **Protocol Update**: Consider storing additional indexing data for other optimizations
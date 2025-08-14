# User Cell Management

## Overview

The CKBoost dApp implements a user cell management system that ensures each user has a unique cell on the blockchain. This document describes the current implementation and future improvements.

## Current Implementation

### Multiple Cell Handling

Due to the initial implementation, some users may have multiple user cells on the blockchain. The system now handles this by:

1. **Cell Discovery**: When searching for a user's cell, the system searches all cells with the user type code hash without filtering by args
2. **Latest Cell Selection**: When multiple cells are found, the system selects the one created in the latest block (highest block number)
3. **Cell Consumption**: All updates to user data consume the existing cell, preventing creation of duplicates

### Key Functions

- `getAllUserCellsByLock()`: Fetches all user cells for a given lock script
- `getLatestUserCellByLock()`: Returns the user cell with the highest block number
- `fetchUserByLockHash()`: Updated to use latest cell selection logic

### Implementation Details

```typescript
// The system now:
// 1. Searches without args filtering to find all potential user cells
// 2. Compares block numbers to select the latest cell
// 3. Always consumes the existing cell in updates
```

## Future Improvements

### Protocol Cell Verification

In future iterations, user cells will be registered and verified in the protocol cell. This will provide:

- **Unique Cell Guarantee**: Protocol ensures only one verified user cell per address
- **O(1) Lookups**: Direct type_id based lookups for verified cells
- **Trust Layer**: Protocol-level verification of user authenticity

### User Cell Consolidation

Once protocol cell verification is implemented, we plan to add a consolidation feature:

1. **Detection Phase**: Identify users with multiple cells
2. **Consolidation Transaction**: 
   - Consume all existing user cells
   - Merge user data (combine submissions, sum points)
   - Create single consolidated cell
   - Register with protocol cell
3. **Migration Path**: Provide UI for users to trigger consolidation

### Technical Approach for Consolidation

```typescript
// Future consolidation logic (pseudocode)
async function consolidateUserCells(userAddress: string) {
  // 1. Find all user cells for this address
  const allCells = await getAllUserCellsByLock(lockScript, userTypeCodeHash, signer);
  
  // 2. Merge data from all cells
  const mergedData = mergeUserData(allCells);
  
  // 3. Create transaction consuming all cells
  const tx = new Transaction();
  allCells.forEach(cell => tx.addInput(cell));
  
  // 4. Create single output with merged data
  tx.addOutput(createUserCell(mergedData));
  
  // 5. Register with protocol cell
  await registerUserInProtocol(tx, mergedData.typeId);
  
  return tx;
}
```

## Best Practices

### For New Users
- System creates single user cell on first submission
- Cell is properly consumed and updated on subsequent submissions

### For Existing Users with Multiple Cells
- System automatically selects the latest cell
- Updates consume the selected cell, preventing further duplication
- Future consolidation will merge all cells into one

## Migration Timeline

1. **Current Phase**: Multiple cell handling with latest selection
2. **Next Phase**: Protocol cell integration for new users
3. **Final Phase**: Consolidation tool for existing users with multiple cells

## Technical Notes

### Block Height Selection
The system uses transaction information to determine block numbers. If block information is unavailable (e.g., for pending transactions), it falls back to using the first cell found.

### Performance Considerations
- Multiple cell detection adds overhead to user lookups
- Future protocol integration will eliminate this overhead
- Consolidation will be a one-time operation per affected user

## References

- User cell implementation: `/lib/ckb/user-cells.ts`
- User service: `/lib/services/user-service.ts`
- User provider: `/lib/providers/user-provider.tsx`
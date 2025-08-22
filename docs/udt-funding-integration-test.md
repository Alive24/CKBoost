# UDT Funding Integration Test Guide

## Overview
This guide helps verify that UDT funding is properly integrated into campaign creation/update transactions.

## Test Scenarios

### 1. Campaign Creation with Initial Funding

**Setup:**
1. Navigate to `/campaign-admin/new`
2. Fill in campaign details
3. Add at least one quest with UDT rewards

**Steps:**
1. In the "Initial Funding" section, select a UDT token (e.g., USDC)
2. Enter the exact amount required for the quest rewards
3. Click "Save Campaign"

**Expected Results:**
- Console should show: "ADDING UDT FUNDING TO EXISTING TRANSACTION"
- Transaction before/after logs should show increased inputs/outputs
- UDT outputs should be logged with type script hashes
- Transaction should include both campaign creation AND UDT cells
- Success message should show funded amounts

**Debug Points:**
- Check browser console for detailed logs
- Look for "Transaction after adding UDT funding" message
- Verify cellDeps includes xUDT type script deployment

### 2. Overfunding Prevention

**Steps:**
1. Create a quest with 100 USDC reward
2. Try to fund with 150 USDC
3. Amount should automatically cap at 100 USDC

**Expected Result:**
- Input field should auto-correct to maximum allowed amount
- Only required amount should be included in transaction

### 3. Multiple UDT Funding

**Steps:**
1. Create multiple quests with different UDT rewards (e.g., USDC and USDT)
2. Fund both tokens in initial funding
3. Submit transaction

**Expected Results:**
- Both UDT types should be included in the transaction
- Each should have separate inputs/outputs
- Console should show processing for each UDT

### 4. Standalone Funding (Post-Creation)

**Steps:**
1. Navigate to existing campaign's Funding tab
2. Add funding for any UDT
3. Submit transaction

**Expected Result:**
- This should create a separate funding transaction (not integrated)
- Uses `fundCampaignWithUDT` method

## Debugging Checklist

### Console Logs to Check:
- [ ] "ADDING UDT FUNDING TO EXISTING TRANSACTION" appears
- [ ] "Campaign owner lock:" shows correct address
- [ ] "Transaction before UDT funding:" shows initial state
- [ ] "Processing UDT funding:" for each token
- [ ] "Found X UDT cells for funding" 
- [ ] "Adding UDT input cell:" for each input
- [ ] "Created UDT output:" with correct amount
- [ ] "Transaction after adding UDT funding:" shows final state
- [ ] "UDT outputs added to transaction:" lists all UDT outputs

### Transaction Structure:
- [ ] Inputs include user's UDT cells
- [ ] Outputs include UDT cell with campaign owner's lock
- [ ] CellDeps includes xUDT type script deployment
- [ ] Change output created if input > required

### Common Issues:

1. **"Insufficient UDT balance"**
   - User doesn't have enough tokens
   - Check wallet balance

2. **"Token not found for script hash"**
   - UDT not registered in udtRegistry
   - Add token to registry

3. **Transaction fails to sign**
   - Missing cell dependencies
   - Check xUDT deployment is included

4. **UDT not showing in transaction**
   - Check udtFunding parameter is passed
   - Verify initialFunding Map has entries

## Integration Points

### Files Modified:
1. `/lib/services/funding-service.ts`
   - `addUDTFundingToTransaction()` - Modifies existing transaction
   - `fundCampaignWithUDT()` - Creates standalone transaction

2. `/lib/services/campaign-admin-service.ts`
   - `updateCampaign()` - Accepts optional udtFunding parameter
   - Calls FundingService to add UDT to transaction

3. `/app/campaign-admin/[campaignTypeId]/page.tsx`
   - Passes initialFunding to updateCampaign
   - Shows success message with funded amounts

4. `/components/campaign-admin/funding/initial-funding.tsx`
   - UI for selecting and entering UDT amounts
   - Implements overfunding prevention

## Testing Matrix

| Scenario | Campaign Creation | Campaign Update | Standalone Funding |
|----------|------------------|-----------------|-------------------|
| Single UDT | ✓ Integrated | ✓ Integrated | ✓ Separate TX |
| Multiple UDTs | ✓ Integrated | ✓ Integrated | ✓ Multiple TXs |
| Overfunding Prevention | ✓ | ✓ | N/A |
| Change Output | ✓ | ✓ | ✓ |
| xUDT CellDep | ✓ | ✓ | ✓ |

## Key Implementation Details

### Transaction Composition Flow:
1. SSRI creates base campaign transaction
2. FundingService.addUDTFundingToTransaction() called
3. UDT inputs found and added
4. UDT outputs created with campaign owner's lock
5. Change outputs added if needed
6. xUDT cell deps added
7. Transaction completed with capacity and fees
8. Single transaction sent for signing

### UDTAssetLike Format:
```typescript
{
  udt_script: {
    codeHash: string,
    hashType: "type" | "data",
    args: string
  },
  amount: bigint
}
```

### Integration Architecture:
- **Same Transaction**: Campaign creation/update + UDT funding
- **Separate Transaction**: Post-creation funding via Funding tab
- **No Circular Dependencies**: Dynamic imports used
- **Proper Lock Usage**: Campaign owner's lock for UDT outputs
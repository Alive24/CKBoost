# Milestone 1 Follow Ups

## UX Improvements

1. [x] Don't skip loading campaign or protocol even if wallet is not connected. Just use a generic client without signer.
   - [x] Camapaign Detail page
2. [x] Non Admin should be properly guided away from admin page, and admin links (including Parse Nostr Submission) should not be on the wallet connector
3. [x] In Platform Admin Dashboard - Campaign Reviews, approved campaigns should not show up. The tag showing "1 Connected Campaigns" should be removed too.
4. [x] fetchAllUserCells is available for Pending Submissions
   >
   > ```typescript
   > <Badge className="bg-yellow-100 text-yellow-800">
   >   <Clock className="w-3 h-3 mr-1" />
   >   {/* TODO: Get actual pending count */}
   >   Pending Submissions
   > </Badge>
   > ```
   >

5. [x] Show Points UDT balance for regular users in the navigation bar (on the left of the wallet connector).
6. [x] In campaign detail page, buttons should show up for campaign-admin and platform-admin to manage (jump to /campaign-admin)
7. [x] Quests with UDT rewards should show it in the tags too in the Quests tab in the campaign detail page, campaign cards on campaign list (it's now mock data, replace them), and also in the Submission tab for campaign-admin detail page.
8. [x] In the Rewards tab for campaign, should show info about Total Points Rewarded and the available UDT rewards left (also provide the available completion quota calculated with the average amount of UDT rewards per quest dividing the left over)
9. [x] Quest progress on campaign card
10. [ ] JoyID compatibility issue
11. [x] Nostr submission for editing
12. [x] Indicate approved submission (not editable as such)
13. [x] Simplified Quest Submission UI

## Contract Improvements

1. [ ] Validate approve_completion UDT amount in campaign-lock.

## DevOps

1. [x] Full walkthrough on Netlify;

## ⚠️ Deferred Issues & New Todo Items

The following issues are deferred as they are not critical features at the moment but they will be registered as trackable issues.

### 1. Approve Completion - Status Check Commented Out

- **File**: `/contracts/contracts/ckboost-campaign-type/src/recipes.rs`
- **Content**:

```rust
// TODO: Not handling this for now
// // Verify campaign status is active (4)
// if input_campaign_data.status() != 4u8.into() {
//     debug!("Campaign is not active, status: {}", input_campaign_data.status());
//     return Err(DeterministicError::BusinessRuleViolation);
// }
```

- **Issue**: Campaign status validation is disabled, allowing approval at any status.
- **Status**: Deferred as only necessary for marginal cases.

### 2. Protocol Type - Timestamp

- **File**: `/contracts/contracts/ckboost-protocol-type/src/recipes.rs`
- **Content**:

```rust
// TODO: Implement proper timestamp retrieval from header deps
// TODO: Check expiration when we have proper timestamp access
```

- **Issue**: Protocol timestamp is accurate and validated
- **Status**: Deferred as only needed in tipping proposal and it is not a critical feature at the moment.

### 3. SSRI Server Error Reporting

- **File**: Multiple service files in `/dapp/lib/services/`
- **Issue**: When SSRI server is not ready, errors are generic.
- **Status**: Deferred as implementations of executor is not confirmed yet and it shouldn't be sensible to generic users.

### 4. Re-funding after approval of campaign

- **Issue**: After approval of campaign, the re-funding interface is not available yet.
- **Status**: Deferred as it is not a critical feature at the moment.

### 5. Store Campaign cover with Nostr

- **Issue**: Campaign cover should be stored on Nostr
- **Status**: Deferred as it is not a critical feature at the moment.

### 6. Rewards stats for campaign detail page

- **Issue**: It's getting the available rewards but not the distributed rewards.
- **Status**: Deferred as it is not a critical feature at the moment.

### 7. Endorser info for campaigns

- **Issue**: Endorser info is not showing up for campaigns.
- **Status**: Deferred as it is not a critical feature at the moment.

### 8. Campaign Rules are descriptive

- **Issue**: Campaign Rules are only descriptive. Should work together with automatic submission approval.
- **Status**: Deferred as it is not a critical feature at the moment.
# CKBoost Milestone 1 Testing Guideline

## Overview

This document provides comprehensive testing guidelines for CKBoost Milestone 1 release. The testing covers three main user roles: Platform Admin, Campaign Admin, and Regular User. All bugs and feedback should be reported as GitHub issues in the [CKBoost repository](https://github.com/Alive24/CKBoost/issues).

## Testing Environment

### Prerequisites

1. **CKB Testnet Wallet**: Install a CKB-CCC compatible in-browser wallet (JoyID, UTXOGlobal, MetaMask with CKB support, or similar)
2. **Test CKB**: Obtain testnet CKB from the faucet
3. **Browser**: Chrome, Firefox, or Edge (latest versions)
4. **Test UDT Tokens**: Will be provided for funding campaigns

### Access URLs
- **Main Application**: https://ckboost.netlify.app/
- **Platform Admin**: `/platform-admin`
- **Campaign Admin**: `/campaign-admin`
- **User Dashboard**: `/campaigns`

### Test Accounts
Test accounts with appropriate permissions will be provided separately. Contact the development team if you need access.

## Known Issues (From Milestone 1)

Before testing, be aware of these known issues that are scheduled for future fixes:

## Testing Scenarios by Role

### 1. Platform Admin Testing

Platform admins manage the entire protocol, including deployment, configuration, and campaign approvals.

#### 1.1 Protocol Deployment & Configuration

**Test Scenario**: Initial Protocol Setup
1. Navigate to `/platform-admin`
2. Connect your wallet
3. Verify you see the Protocol Management section
4. **Test Protocol Deployment**:
   - Click "Deploy Protocol" button
   - Enter required parameters (admin addresses, UDT settings)
   - Confirm transaction
   - **Expected**: Protocol cell successfully deployed on-chain
   - **Report**: Any deployment failures, unclear error messages, or UI issues

**Test Scenario**: Admin Management
1. In Protocol Management, find "Admin Management" section
2. **Add Admin**:
   - Try adding admin by address
   - Try adding admin by script hash
   - Submit with wallet signature
   - **Expected**: New admin appears in list
   - **Report**: Invalid address handling, transaction failures
3. **Remove Admin**:
   - Select an admin to remove
   - Confirm removal
   - **Expected**: Admin removed from list after transaction
   - **Report**: Permission issues, UI not updating

#### 1.2 Script Code Hash Management

**Test Scenario**: Update Contract References
1. Navigate to "Script Code Hashes" section
2. **Update Code Hashes**:
   - Modify campaign type code hash
   - Modify user type code hash
   - Save changes
   - **Expected**: Updated hashes persist after refresh
   - **Report**: Validation errors, saving failures

#### 1.3 Campaign Review & Approval

**Test Scenario**: Campaign Approval Workflow
1. View pending campaigns in dashboard
2. **Review Campaign**:
   - Click on a pending campaign
   - Review all details (title, description, quests, funding)
   - Check quest rewards configuration
   - **Expected**: All information clearly displayed
   - **Report**: Missing data, unclear UI elements
3. **Approve Campaign**:
   - Click "Approve Campaign"
   - Sign transaction
   - **Expected**: Campaign status changes to "Approved"
   - **Report**: Approval failures, status not updating

#### 1.4 Tipping Configuration

**Test Scenario**: Configure Tipping System
1. Navigate to "Tipping Configuration"
2. **Set Thresholds**:
   - Set approval requirement thresholds
   - Set expiration duration
   - Save configuration
   - **Expected**: Settings saved and applied
   - **Report**: Invalid values accepted, settings not persisting

### 2. Campaign Admin Testing

Campaign admins create and manage individual campaigns with quests and rewards.

#### 2.1 Campaign Creation

**Test Scenario**: Create New Campaign
1. Navigate to `/campaign-admin/new`
2. **Fill Campaign Details**:
   - Enter title (test with various lengths)
   - Add short description
   - Add long description
   - Select categories
   - Set start/end dates
   - Choose difficulty level
   - **Expected**: Form validates input correctly
   - **Report**: Validation issues, character limits not enforced

#### 2.2 Quest Management

**Test Scenario**: Add Quests to Campaign
1. In campaign creation/edit, click "Add Quest"
2. **Configure Quest**:
   - Enter quest title and description
   - Add subtasks (if any)
   - Set quest difficulty
   - Configure rewards:
     - Points amount
     - UDT distribution (if applicable)
   - Set initial quota
   - **Expected**: Quest added to campaign
   - **Report**: Quest not saving, reward calculation errors

**Test Scenario**: Edit Existing Quest
1. Click edit icon on existing quest
2. Modify quest details
3. Save changes
4. **Expected**: Changes persist
5. **Report**: Edit not working, data loss

#### 2.3 Campaign Funding

**Test Scenario**: Initial Campaign Funding with UDT
1. In campaign funding tab, click "Add Initial Funding"
2. **Add UDT Funding**:
   - Select UDT token from registry
   - Enter amount (test with decimal values)
   - **KNOWN ISSUE**: Non-numeric values will crash
   - Confirm funding transaction
   - **Expected**: Funding reflected in campaign
   - **Report**: Token selection issues, amount calculation errors

**Test Scenario**: Campaign Lock Management
1. View campaign lock status
2. **Test Unlock Scenarios**:
   - Admin unlock attempt
   - Time-based unlock (if applicable)
   - **Expected**: Proper access control enforced
   - **Report**: Unauthorized unlocks, lock status display issues

#### 2.4 Submission Review

**Test Scenario**: Review Quest Submissions
1. Navigate to Submissions tab
2. **Review Submissions**:
   - View submission content (stored on Nostr)
   - Check user verification status
   - Approve/reject submissions
   - **Expected**: Smooth review workflow
   - **Report**: Content loading issues, approval failures

### 3. Regular User Testing

Regular users participate in campaigns, complete quests, and earn rewards.

#### 3.1 User Registration & Verification

**Test Scenario**: First-Time User Setup
1. Connect wallet at `/campaigns`
2. **Create User Profile**:
   - System should detect no existing user cell
   - Fill verification data:
     - Name
     - Email
     - Twitter handle
     - Discord username
   - Submit profile creation
   - **Expected**: User cell created on-chain
   - **Report**: Cell creation failures, data not saving

#### 3.2 Campaign Browsing

**Test Scenario**: Browse Available Campaigns
1. Navigate to campaigns list
2. **Filter & Search**:
   - Filter by category
   - Filter by status (active, upcoming, ended)
   - Search by keyword
   - **Expected**: Accurate filtering results
   - **Report**: Filter not working, incorrect results

**Test Scenario**: View Campaign Details
1. Click on a campaign card
2. **Review Information**:
   - Campaign description
   - Quest list with rewards
   - Participation requirements
   - Current progress/stats
   - **Expected**: All information displayed correctly
   - **Report**: Missing data, layout issues

#### 3.3 Quest Participation

**Test Scenario**: Submit Quest Completion
1. Select a quest in campaign
2. Click "Submit Quest"
3. **Complete Submission Form**:
   - For each subtask, provide evidence/response
   - Use markdown editor for formatting
   - **Storage Options**:
     - Test Nostr storage (recommended)
     - Test alternative storage
   - Submit quest completion
   - **Expected**: Submission stored and pending review
   - **Report**: Submission failures, storage issues

**Test Scenario**: Edit Previous Submission
1. View a previously submitted quest
2. Click "Edit Submission"
3. Modify responses
4. Resubmit
5. **Expected**: Updated submission saved
6. **Report**: Edit not available, changes not saving

#### 3.4 User Dashboard

**Test Scenario**: Track Progress
1. View user dashboard
2. **Check Statistics**:
   - Total points earned
   - Quests completed
   - Pending submissions
   - Available rewards
   - **Expected**: Accurate statistics
   - **Report**: Incorrect calculations, missing data

**Test Scenario**: View Submission History
1. Navigate to submission history
2. **Review Past Submissions**:
   - Approved submissions
   - Rejected submissions
   - Pending reviews
   - **Expected**: Complete history displayed
   - **Report**: Missing submissions, status errors

## Cross-Role Testing Scenarios

### Campaign Lifecycle Test
1. **Platform Admin**: Deploy protocol and configure
2. **Campaign Admin**: Create and fund campaign
3. **Platform Admin**: Approve campaign
4. **Regular User**: Submit quest completion
5. **Campaign Admin**: Review and approve submission
6. **Regular User**: Verify rewards received

### Multi-User Interaction Test
1. Multiple users submit to same quest
2. Test quota limits enforcement
3. Test concurrent submission handling
4. Verify fair distribution of rewards

## Performance Testing

### Load Testing Scenarios
1. **Concurrent Users**: Test with 10+ users accessing simultaneously
2. **Large Campaigns**: Create campaign with 20+ quests
3. **Bulk Submissions**: Submit 50+ quest completions
4. **Report**: Performance degradation, timeouts, failures

### Network Conditions
1. Test on slow connections (3G simulation)
2. Test with network interruptions
3. Test wallet disconnection scenarios
4. **Report**: Poor error recovery, data loss

## Security Testing

### Input Validation
1. Test XSS attempts in text fields
2. Test SQL injection patterns (though using blockchain)
3. Test buffer overflow with extremely long inputs
4. **Report**: Any successful exploits

### Authorization Checks
1. Attempt admin actions without admin role
2. Try to approve own campaign
3. Attempt to modify other users' submissions
4. **Report**: Any unauthorized access

## Bug Reporting Guidelines

### Creating GitHub Issues

When reporting bugs, use this template:

```markdown
**Bug Title**: [Role] Brief description

**Environment**:
- Browser: 
- Wallet: 
- Network: Testnet/Mainnet
- User Role: Platform Admin/Campaign Admin/User

**Steps to Reproduce**:
1. 
2. 
3. 

**Expected Behavior**:

**Actual Behavior**:

**Screenshots/Videos**: (if applicable)

**Transaction Hash**: (if applicable)

**Error Messages**: (copy exact error text)

**Severity**: Critical/High/Medium/Low
```

### Severity Guidelines
- **Critical**: System crash, funds at risk, complete feature failure
- **High**: Major feature broken, significant UX impact
- **Medium**: Feature partially working, workarounds available
- **Low**: Minor UI issues, cosmetic problems

### Feature Requests
Use the "enhancement" label and provide:
- Use case description
- Expected benefit
- Priority suggestion

## Testing Checklist

### Platform Admin
- [ ] Protocol deployment successful
- [ ] Admin management working
- [ ] Campaign approval flow complete
- [ ] Tipping configuration saved
- [ ] Endorser management functional
- [ ] Script hash updates working

### Campaign Admin
- [ ] Campaign creation successful
- [ ] Quest addition working
- [ ] UDT funding operational
- [ ] Submission review functional
- [ ] Campaign editing working
- [ ] Stats display accurate

### Regular User
- [ ] User registration complete
- [ ] Campaign browsing working
- [ ] Quest submission successful
- [ ] Nostr storage operational
- [ ] Dashboard stats accurate
- [ ] Reward claiming working

## Contact & Support

### Reporting Channels
- **GitHub Issues**: https://github.com/Alive24/CKBoost/issues
- **Discord**: [CKB Community Discord] #ckboost-testing
- **Direct Contact**: [Development team contacts]

### Testing Coordination
- Daily testing sync: [Time] UTC
- Weekly summary reports: Fridays
- Critical bugs: Report immediately

## Testing Timeline

### Phase 1 (Days 1-3): Core Functionality
- Focus on basic user flows
- Protocol deployment and configuration
- Campaign creation and approval

### Phase 2 (Days 4-6): Advanced Features
- Quest submissions with Nostr
- UDT funding and distribution
- Multi-user scenarios

### Phase 3 (Days 7-10): Edge Cases & Performance
- Error handling
- Performance under load
- Security testing
- Final comprehensive testing

## Appendix

### Useful Commands (Browser Console)
```javascript
// Check current network
localStorage.getItem('selectedNetwork')

// Clear local cache
localStorage.clear()

// Check SSRI connection
console.log(window.ssri)
```

### Common Troubleshooting
1. **Wallet not connecting**: Refresh page, check network
2. **SSRI errors**: Wait 30 seconds and retry
3. **Transaction failing**: Check CKB balance, increase fee
4. **Nostr storage issues**: Check relay connection

---

**Thank you for participating in CKBoost testing! Your feedback is invaluable for improving the platform.**
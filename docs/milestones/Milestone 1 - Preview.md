# Milestone 1 Preview

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
9. [ ] Quest progress on campaign card

## Contract Improvements

1. Validate approve_completion UDT amount in campaign-lock.

## DevOps

1. Full walkthrough on Netlify;

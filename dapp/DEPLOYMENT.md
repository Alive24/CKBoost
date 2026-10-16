# CKBoost Identity Verification - Deployment Guide

## Overview

This guide covers deploying the CKBoost identity verification system to Netlify with Telegram bot integration.

## Prerequisites

1. **Netlify Account** - For hosting the dApp and serverless functions
2. **Telegram Bot** - Created via @BotFather
3. **CKB Network Access** - Testnet or mainnet RPC endpoints
4. **Domain Name** - For Telegram Login domain (can use Netlify subdomain)

## Step 1: Create Telegram Bot

1. Message @BotFather on Telegram
2. Use `/newbot` command
3. Follow prompts to set bot name and username
4. Save the bot token (keep it secure!)

```bash
# Example bot creation
/newbot
Bot Name: CKBoost Verification Bot
Bot Username: ckboost_verify_bot
```

## Step 2: Deploy to Netlify

### Option A: Connect GitHub Repository

1. Fork this repository to your GitHub account
2. Connect GitHub account to Netlify
3. Select this repository for deployment
4. Configure build settings:
   - **Build command**: `npm run build`
   - **Publish directory**: `.next`
   - **Functions directory**: `netlify/functions`

### Option B: Manual Deploy

1. Build the project locally:
```bash
cd dapp
npm install
npm run build
```

2. Deploy using Netlify CLI:
```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod
```

## Step 3: Configure Environment Variables

In Netlify dashboard, go to **Site Settings** → **Environment Variables** and add:

### Required Variables
```bash
# Blockchain Configuration
NEXT_PUBLIC_CKB_RPC_URL=https://testnet.ckb.dev
NEXT_PUBLIC_CKB_INDEXER_URL=https://testnet.ckb.dev/indexer
NEXT_PUBLIC_SSRI_EXECUTOR_URL=http://localhost:9090

# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGhIJKlmnoPQRstuVWXyz123456789
TELEGRAM_BOT_USERNAME=ckboost_verify_bot
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=ckboost_verify_bot
```

### Optional Variables (for future features)
```bash
# OAuth (for Twitter, Discord, Reddit)
TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret

# Security
JWT_SECRET=your-super-secret-jwt-key
OAUTH_STATE_ENCRYPTION_KEY=your-encryption-key
```

### Portable Quest Claim Cells

Portable quest claims are Testnet-only. The Netlify function reconstructs the
approval and final Points claim transactions from CKB, then issues one
`ckboost.quest.v1` Claim Cell for each verified completion.

Configure these variables in the Netlify dashboard:

```bash
NEXT_PUBLIC_CKB_NETWORK=testnet
NEXT_PUBLIC_CKB_RPC_URL=https://testnet.ckb.dev

# Server-side function variables. Never expose the private key through a
# NEXT_PUBLIC_ variable.
CKB_RPC_URL=https://testnet.ckb.dev
CKBOOST_ISSUER_EVM_PRIVATE_KEY=0x...
CKBOOST_REWARD_CONFIRMATIONS=6
```

`CKBOOST_ISSUER_EVM_PRIVATE_KEY` must control the current controller of
`did:ckb:tlitdhrdn7wdzmktk3kzhfua3ivpgiq2`. Its Testnet OmniLock cells fund
the Claim Cell occupied capacity and transaction fee. Keep enough spendable
CKB on that controller before enabling issuance. The function rejects a key
that does not match the live issuer DID.

Netlify Blobs stores coordination state in the site store
`ckboost-vellum-quest-claims`. The issuer key remains only in Netlify's
server-side environment and is never sent to the browser. Netlify supplies the
store credentials to deployed functions. Use `netlify dev` when testing locally
so the function also receives a Blobs context.

#### Failure Handling

- The participant's reward transaction is independent of Claim Cell issuance.
  Once submitted, the browser persists a local retry item and waits for the
  configured confirmation depth.
- The function stores the complete signed Claim Cell transaction before it
  broadcasts. A retry reuses those exact bytes and cannot prepare a second
  transaction for the same campaign, quest, and CKBoost user Type ID.
- HTTP `202` means confirmation or issuer coordination is still pending and is
  retried automatically. A validation or DID-binding response is terminal for
  that local queue item.
- A rejected Claim Cell transaction is not automatically replaced. This is a
  fail-closed condition because preparing another transaction without checking
  the first one could duplicate issuance or conflict with issuer inputs.

For operator recovery, locate the request by `rewardClaimTxHash` in the
`vellum-quest-claim` function logs. Completion records use
`completions/<sha256(campaign_type_id:quest_id:ckboost_user_type_id)>`; the
global signer record is `coordination/issuer`. Query the stored transaction
hash on Testnet first. If it committed, call the endpoint again with the
original reward hash and subject DID to reconcile the confirmed outpoint. Only
delete the completion and signer records after the transaction is definitively
rejected, no Claim Cell output exists, and the rejection cause has been fixed.
Never reset records for an unknown or pending transaction.

## Step 4: Configure Bot Domain (BotFather)

Set your development/staging domain in BotFather so the Telegram Login widget accepts it:

1. Open @BotFather
2. Send `/setdomain`
3. Choose your bot
4. Send your site host (no protocol), e.g. `your-site.netlify.app`

## Step 5: Deploy Smart Contracts

1. Deploy the enhanced ckboost-user-type contract:
```bash
cd contracts
make build
make deploy-testnet  # or make deploy-mainnet
```

2. Update `deployments.json` with new contract addresses
3. Commit and push changes to trigger re-deployment

## Step 6: Test Complete Flow

1. **Visit Verification Page**
   - Go to `https://your-site.netlify.app/verify`
   - Connect your CKB wallet

2. **Start Telegram Verification**
   - Click the Telegram Login button
   - Complete the login on Telegram
   - You will be redirected back to `/verify`

3. **Bind To Wallet**
   - A banner will ask to bind Telegram to your connected wallet
   - Click "Bind Telegram To Wallet"
   - The app calls `/api/telegram/authenticate` to validate payload, then writes the verification on-chain

4. **Verify On-Chain Update**
   - Page should show "Telegram Verified" status
   - Check transaction on CKB explorer
   - Verify UserData cell was updated

## Troubleshooting

### Common Issues

**Telegram auth invalid or expired**
- Ensure your domain matches the one set in BotFather `/setdomain`
- Check `/api/telegram/authenticate` function logs
- Verify TELEGRAM_BOT_TOKEN is set
- Ensure the auth attempt is within TTL (default 10 minutes)

**"User must exist before updating verification"**
- Create user first by submitting a quest
- Or enhance flow to auto-create users

**SSRI executor connection failed**
- Ensure SSRI executor is running
- Update executor URL in environment variables
- Check network connectivity

**Local dev domain issues**
- Use Netlify Live (`netlify dev --live`) or a local HTTPS reverse proxy with a hosts entry
- Keep the LoginButton `authCallbackUrl` relative or to `/verify?source=telegram`

### Debug Commands

 

Test bot manually:
```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" \
     -d "chat_id=<CHAT_ID>&text=Test message"
```

Check Netlify function logs:
```bash
netlify functions:logs
```

## Security Considerations

### Production Checklist

- [ ] Bot token stored securely (environment variables only)
- [ ] Webhook URL uses HTTPS
- [ ] Rate limiting implemented for API endpoints
- [ ] User input validation in place
- [ ] Error messages don't expose sensitive info
- [ ] Wallet private keys never transmitted
- [ ] CORS properly configured

### Bot Security

- [ ] Bot only responds to valid verification codes
- [ ] Wallet address validation before processing
- [ ] Verification timeout implemented
- [ ] No sensitive data logged
- [ ] Proper error handling for edge cases

## Monitoring & Analytics

### Key Metrics to Track

- Verification completion rate
- Bot response time
- Failed verification attempts
- Transaction success rate
- User drop-off points in flow

### Recommended Tools

- **Netlify Analytics** - Traffic and function usage
- **CKB Explorer API** - Transaction monitoring
- **Custom logging** - Verification flow tracking
- **Error tracking** - Sentry or similar service

## Scaling Considerations

### Performance Optimizations

- Implement caching for user verification status
- Use CDN for static assets
- Optimize bundle size with tree shaking
- Add database caching for frequent lookups

### Load Handling

- Telegram bots handle ~30 messages/second
- Netlify functions have generous limits
- Consider Redis for session management at scale
- Implement proper rate limiting

## Backup & Recovery

### Data Backup
- All critical data stored on CKB blockchain (immutable)
- Bot configuration backed up in environment variables
- User verification mappings recoverable from on-chain data

### Disaster Recovery
- Deploy to multiple regions via Netlify
- Keep bot token and keys in secure backup
- Document recovery procedures
- Test recovery process regularly

## Support & Maintenance

### Regular Tasks
- Monitor bot uptime and response times
- Update dependencies and security patches
- Review verification completion rates
- Clean up expired verification sessions

### User Support
- Clear error messages and troubleshooting tips
- Documentation for common issues
- Support contact information
- FAQ section for users

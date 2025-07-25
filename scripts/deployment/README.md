# CKBoost Deployment Guide

This directory contains deployment scripts for the CKBoost smart contracts.

## Prerequisites

1. **Install ccc-deploy** (if not already installed):
   ```bash
   npm install -g ccc-deploy
   ```

2. **Create `.env` file** in project root with your private key:
   ```bash
   WALLET_PRIVATE_KEY=0x... # Your CKB testnet private key
   CKB_RPC_URL=https://testnet.ckb.dev/rpc # Optional, defaults to testnet
   ```

3. **Build contracts** (if not already built):
   ```bash
   cd contracts
   make build
   cd ..
   ```

## Deployment Process

### Step 1: Deploy Smart Contracts

Run the deployment script:

```bash
./scripts/deployment/deploy-contracts.sh
```

Or for mainnet:

```bash
./scripts/deployment/deploy-contracts.sh mainnet
```

This will:
- Deploy all 5 CKBoost contracts (protocol type/lock, campaign type/lock, user type)
- Generate `.env.contracts` with all contract addresses
- Create individual deployment JSON files for each contract
- Generate a `deployment-summary.json` with all deployment info

### Step 2: Configure dApp

Copy the generated environment variables to your dApp:

```bash
# Copy contract addresses to dApp
cat .env.contracts >> dapp/.env.local
```

### Step 3: Deploy Protocol Cell (via dApp UI)

1. Start the dApp:
   ```bash
   cd dapp
   npm run dev
   ```

2. Navigate to http://localhost:3000/platform-admin

3. Connect your wallet

4. Click "Deploy Protocol Cell"

5. The form will be pre-filled with contract code hashes from your `.env.local`

6. Modify admin lock hashes and other configurations as needed

7. Submit the transaction

### Step 4: Create First Campaign

After protocol deployment, you can create campaigns via:
- The dApp UI at `/create-campaign`
- Or programmatically using the campaign service

## File Outputs

After running the deployment script, you'll have:

- `.env.contracts` - Environment variables for the dApp
- `deployment-summary.json` - Complete deployment information
- `deployment-*.json` - Individual contract deployment details

## Environment Variables Reference

The deployment generates these variables:

```bash
# Protocol Type Contract
NEXT_PUBLIC_CKB_PROTOCOL_TYPE_TX_HASH="0x..."
NEXT_PUBLIC_CKB_PROTOCOL_TYPE_CODE_HASH="0x..."
NEXT_PUBLIC_CKB_PROTOCOL_TYPE_TYPE_CODE_HASH="0x..." # For Type ID
NEXT_PUBLIC_CKB_PROTOCOL_TYPE_TYPE_ARGS="0x..."

# Protocol Lock Contract
NEXT_PUBLIC_CKB_PROTOCOL_LOCK_TX_HASH="0x..."
NEXT_PUBLIC_CKB_PROTOCOL_LOCK_CODE_HASH="0x..."

# Campaign Type Contract
NEXT_PUBLIC_CKB_CAMPAIGN_TYPE_TX_HASH="0x..."
NEXT_PUBLIC_CKB_CAMPAIGN_TYPE_CODE_HASH="0x..."

# Campaign Lock Contract
NEXT_PUBLIC_CKB_CAMPAIGN_LOCK_TX_HASH="0x..."
NEXT_PUBLIC_CKB_CAMPAIGN_LOCK_CODE_HASH="0x..."

# User Type Contract
NEXT_PUBLIC_CKB_USER_TYPE_TX_HASH="0x..."
NEXT_PUBLIC_CKB_USER_TYPE_CODE_HASH="0x..."
```

## Troubleshooting

### "Private key not found"
- Make sure `.env` file exists in project root
- Verify `WALLET_PRIVATE_KEY` is set correctly

### "Insufficient capacity"
- Ensure your wallet has enough CKB for deployment
- Each contract deployment requires ~100 CKB minimum

### "Contract binary not found"
- Run `make build` in the contracts directory
- Verify build outputs exist in `contracts/build/release/`

### "ccc-deploy not found"
- Install globally: `npm install -g ccc-deploy`
- Or use npx: `npx ccc-deploy deploy ...`

## Next Steps

After deployment:

1. **Test the contracts** using the dApp interface
2. **Monitor transactions** on the CKB Explorer
3. **Set up indexing** for efficient data queries (optional)
4. **Configure production deployment** for mainnet

## Security Notes

- Never commit `.env` files with private keys
- Use different wallets for testnet and mainnet
- Verify all contract addresses before mainnet deployment
- Keep deployment JSON files for audit trail
# CKBoost Protocol Deployment Guide

## Overview

The CKBoost protocol uses a two-step deployment process:
1. **Deploy Protocol Type Contract**: The smart contract code that validates protocol operations
2. **Deploy Protocol Cell**: A cell instance that stores protocol configuration data

## Understanding the Architecture

### Protocol Type Contract
- This is the actual smart contract code deployed on the blockchain
- It contains the validation logic for protocol operations
- Deployed using `ccc-deploy` with Type ID for upgradeability
- Generates a unique code hash that identifies the contract

### Protocol Cell
- This is a specific cell that uses the protocol type contract
- Stores all protocol configuration data (admin list, contract addresses, etc.)
- Has Type ID args that uniquely identify this specific protocol instance
- Can be updated by admins to change configuration

## Deployment Process

### Step 1: Deploy Protocol Type Contract

```bash
# From the project root
cd /Volumes/Bohemialive/GitHub/CKBoost
source .env

# Deploy the protocol type contract
ccc-deploy deploy generic_contract ./contracts/build/release/ckboost-protocol-type \
  --typeId \
  --network=testnet \
  --privateKey=$WALLET_PRIVATE_KEY \
  --outputFile=./deployment-protocol-type.json
```

This will output:
- **Transaction Hash**: The deployment transaction
- **Type ID Code Hash**: `0x00000000000000000000000000000000000000000000000000545950455f4944` (system script)
- **Script Hash**: The actual code hash of your protocol contract (e.g., `0x8bed7ce362f1817292c0173ce9854ec359f3bca621882618d28392643f58c6c6`)

### Step 2: Configure dApp with Protocol Contract

Add the protocol contract info to `/dapp/.env.local`:

```env
# Protocol type contract configuration
NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH=0x8bed7ce362f1817292c0173ce9854ec359f3bca621882618d28392643f58c6c6
NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE=type
# Leave args empty for now - will be filled after protocol cell deployment
NEXT_PUBLIC_PROTOCOL_TYPE_ARGS=

# Protocol deployment information (optional but recommended)
# This helps the dApp find the protocol type code cell for transactions
NEXT_PUBLIC_PROTOCOL_DEPLOYMENT_TX_HASH=0x515c496d5c7192b6bf1ba80e687cc213c15bbba069643b844d2e21d55d9a43c0
NEXT_PUBLIC_PROTOCOL_DEPLOYMENT_INDEX=0
```

**Important**: Use the `scriptHash` from the deployment output, NOT the Type ID code hash.

### Step 3: Restart dApp

```bash
cd dapp
npm run dev
```

The dApp needs to restart to pick up the new environment variables.

### Step 4: Deploy Protocol Cell via UI

1. Navigate to http://localhost:3000/platform-admin
2. The UI will detect that the protocol contract is deployed but no protocol cell exists
3. Click "Deploy Protocol Cell"
4. Fill in the deployment form:
   - **Admin Lock Hashes**: Your wallet's lock hash (auto-filled)
   - **Script Code Hashes**: 
     - Protocol Type: Will be auto-filled from environment
     - Other contracts: Use zero hashes for now or actual hashes if deployed
   - **Tipping Config**: Default values are provided
5. Submit the transaction

The deployment will create a protocol cell with:
- A unique Type ID args (e.g., `0xabc123...`)
- Your protocol configuration data

### Step 5: Configure dApp with Protocol Cell Args

After the protocol cell is deployed:

1. Copy the protocol cell's args from the deployment result in the UI
2. Update `/dapp/.env.local`:
   ```env
   NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH=0x8bed7ce362f1817292c0173ce9854ec359f3bca621882618d28392643f58c6c6
   NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE=type
   NEXT_PUBLIC_PROTOCOL_TYPE_ARGS=0xabc123...  # The args from protocol cell deployment
   ```
3. Restart the dApp again

## Configuration Status

The platform admin page shows different messages based on configuration:

### Status 1: No Protocol Contract
- **Shows**: Red alert - "Protocol Contract Not Deployed"
- **Action**: Deploy protocol contract using ccc-deploy

### Status 2: Protocol Contract Deployed, No Cell
- **Shows**: Yellow alert - "Protocol Cell Not Deployed" 
- **Action**: Use UI to deploy protocol cell

### Status 3: Fully Configured
- **Shows**: Protocol management interface
- **Action**: Manage protocol configuration

## Troubleshooting

### "Protocol Not Deployed" still showing after configuration
- Make sure you restarted the dApp after updating `.env.local`
- Verify the environment variables are correctly set
- Check that you're using the script hash, not the Type ID code hash

### Cannot deploy protocol cell
- Ensure your wallet is connected
- Check that your wallet has sufficient CKB balance
- Verify the protocol type code hash is correctly configured

### Protocol cell not found after deployment
- Make sure you updated `NEXT_PUBLIC_PROTOCOL_TYPE_ARGS` with the cell's args
- Restart the dApp after updating the environment variable
- The args must match exactly what was shown in the deployment result

## Next Steps

Once both the protocol contract and protocol cell are deployed:
1. Deploy other contracts (campaign, user, etc.) if needed
2. Update the protocol cell with their code hashes
3. Create campaigns through the dApp interface
4. The dApp will automatically read all contract addresses from the protocol cell
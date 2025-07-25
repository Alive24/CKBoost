# CKBoost Deployment Summary

## Deployed Contracts

### Protocol Type Contract
- **Network**: Testnet
- **Deployed At**: 2025-07-24T08:21:02.765Z
- **Transaction Hash**: [0x515c496d5c7192b6bf1ba80e687cc213c15bbba069643b844d2e21d55d9a43c0](https://pudge.explorer.nervos.org/transaction/0x515c496d5c7192b6bf1ba80e687cc213c15bbba069643b844d2e21d55d9a43c0)
- **Data Hash**: 0x9405c9e5ad771f8d5db1992264281e38d2573b8ca2e1e5812f0200e2d3c4bca5
- **Type ID Code Hash**: 0x00000000000000000000000000000000000000000000000000545950455f4944
- **Type ID Args**: 0xb5dba040d1860ab77ca4aab156c981f8075c407a2b53bd5855a79b6b25ee41e2

## Next Steps

### 1. Deploy Other Contracts (Optional)
If you want to deploy the other contracts now:

```bash
# Campaign Type Contract
ccc-deploy deploy generic_contract ./contracts/build/release/ckboost-campaign-type --network=testnet --privateKey=$WALLET_PRIVATE_KEY --outputFile=./deployment-campaign-type.json

# Campaign Lock Contract  
ccc-deploy deploy generic_contract ./contracts/build/release/ckboost-campaign-lock --network=testnet --privateKey=$WALLET_PRIVATE_KEY --outputFile=./deployment-campaign-lock.json

# Protocol Lock Contract
ccc-deploy deploy generic_contract ./contracts/build/release/ckboost-protocol-lock --network=testnet --privateKey=$WALLET_PRIVATE_KEY --outputFile=./deployment-protocol-lock.json

# User Type Contract
ccc-deploy deploy generic_contract ./contracts/build/release/ckboost-user-type --network=testnet --privateKey=$WALLET_PRIVATE_KEY --outputFile=./deployment-user-type.json
```

### 2. Start the dApp
```bash
cd dapp
npm run dev
```

### 3. Deploy Protocol Cell via UI
1. Navigate to http://localhost:3000/platform-admin
2. The UI will detect that no protocol cell exists
3. Fill in the deployment form:
   - **Admin Lock Hash**: Your wallet's lock hash
   - **Script Code Hashes**: 
     - Use the data hashes from deployment files
     - For undeployed contracts, use: `0x0000000000000000000000000000000000000000000000000000000000000000`
4. Submit the transaction to deploy the protocol cell

### 4. Configure dApp with Protocol Cell Args
After the protocol cell is deployed:
1. Copy the protocol cell's args from the deployment result
2. Update `/dapp/.env.local`:
   ```
   NEXT_PUBLIC_PROTOCOL_TYPE_ARGS=<paste_the_args_here>
   ```
3. Restart the dApp

### 5. Create Your First Campaign
Once the protocol cell is deployed and configured:
1. Navigate to the campaigns section
2. Create a new campaign
3. The dApp will now read all contract addresses from the protocol cell

## Important Notes

- The protocol type contract uses Type ID for upgradeability
- All other contract addresses are stored in the protocol cell data
- The dApp only needs the protocol type script info in its environment
- Changes to contract addresses can be made by updating the protocol cell
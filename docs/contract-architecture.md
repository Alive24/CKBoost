# CKBoost Contract Architecture

## Overview

CKBoost uses a protocol-centric architecture where all contract addresses are stored on-chain in the protocol cell, rather than in environment variables. This provides several benefits:

1. **Single Source of Truth**: All contract addresses managed in one place on-chain
2. **Dynamic Updates**: Can update contract addresses without redeploying the dApp
3. **Network Flexibility**: Different networks can have different contracts automatically
4. **Reduced Configuration**: Only need one environment variable (protocol type script)

## Contract Registry Pattern

### Key Concepts
- **Protocol Type Contract**: The smart contract code deployed on-chain that validates protocol operations
- **Protocol Cell**: A specific cell instance that stores the protocol data (admin list, contract addresses, etc.)

### Environment Configuration
The dApp needs to know about the protocol type script to find the protocol cell:
```env
# Protocol type contract code hash (from deployment)
NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH=0x...
NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE=type

# Protocol cell args (from protocol cell deployment)
NEXT_PUBLIC_PROTOCOL_TYPE_ARGS=0x...
```

### Protocol Cell Data Structure
The protocol cell stores all other contract addresses:
```rust
table ScriptCodeHashes {
    ckb_boost_protocol_type_code_hash: Byte32,
    ckb_boost_protocol_lock_code_hash: Byte32,
    ckb_boost_campaign_type_code_hash: Byte32,
    ckb_boost_campaign_lock_code_hash: Byte32,
    ckb_boost_user_type_code_hash: Byte32,
    accepted_udt_type_code_hashes: Byte32Vec,
    accepted_dob_type_code_hashes: Byte32Vec,
}
```

## Deployment Flow

1. **Deploy All Contracts**
   ```bash
   ./scripts/deployment/deploy-contracts.sh
   ```
   This deploys all contracts and generates a `deployment-summary.json` with all addresses.

2. **Configure dApp with Protocol Type Contract**
   Add the protocol type contract info to `.env.local`:
   ```env
   NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH=0x... # From protocol-type deployment
   NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE=type
   NEXT_PUBLIC_PROTOCOL_TYPE_ARGS=           # Leave empty for now
   ```
   Note: At this stage, you only need the code hash. The args will be filled after deploying the protocol cell.

3. **Deploy Protocol Cell via UI**
   - Start the dApp and navigate to `/platform-admin`
   - The UI will detect no protocol cell exists and offer deployment
   - Fill in all contract code hashes from `deployment-summary.json`
   - For contracts not yet deployed, use zero hashes: `0x0000000000000000000000000000000000000000000000000000000000000000`
   - Submit transaction to create protocol cell
   - **Important**: The UI will display the deployed protocol cell's args (different from the Type ID args above)

4. **Update dApp Configuration with Protocol Cell Args**
   After deploying the protocol cell, you need to tell the dApp which specific cell to use:
   ```env
   NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH=0x... # Same as before (protocol type contract)
   NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE=type  # Same as before
   NEXT_PUBLIC_PROTOCOL_TYPE_ARGS=0x...      # UPDATE with the protocol CELL's args from step 3
   ```
   - Copy the protocol cell's args from the deployment result in the UI
   - Update `.env.local` with these args
   - Restart the dApp

5. **Use the Platform**
   The dApp now finds your specific protocol cell using the complete type script (code hash + args) and reads all contract addresses from it.

## Code Example: Reading Contract Addresses

```typescript
// Load protocol cell
const protocolCell = await findProtocolCell(client)
const protocolData = parseProtocolCell(protocolCell)

// Extract contract addresses
const campaignTypeCodeHash = protocolData.protocol_config.script_code_hashes.ckb_boost_campaign_type_code_hash
const campaignLockCodeHash = protocolData.protocol_config.script_code_hashes.ckb_boost_campaign_lock_code_hash

// Use them to query cells
const campaignCells = await client.findCellsByType({
  codeHash: campaignTypeCodeHash,
  hashType: "data1",
  args: "0x"
})
```

## Benefits

1. **Upgradability**: Update contract addresses by updating protocol cell
2. **Multi-Network Support**: Each network has its own protocol cell with network-specific contracts
3. **Reduced Configuration Errors**: No need to manually manage multiple contract addresses
4. **Better Security**: Contract addresses verified on-chain, not just in config files

## Migration Path

For projects currently using environment variables for all contracts:

1. Deploy a protocol cell with all contract addresses
2. Update code to read from protocol cell instead of env vars
3. Remove contract addresses from environment configuration
4. Keep only protocol type script in environment

This architecture ensures a cleaner, more maintainable system that scales better as the platform grows.
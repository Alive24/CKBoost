# CKB Transaction Debugger

A TypeScript-based debugger for CKB transactions using CCC (CKB Common Connector).

## Setup

```bash
npm install
```

## Workflow

1. **Copy raw transaction hex** to `tx_hex.txt`
2. **Run the debugger**:
   ```bash
   npm run debug
   ```

The script automatically:
- Cleans intermediate files before each run
- Parses the hex to `raw_tx.json` with proper snake_case formatting
- Generates `mock_tx.json` using ckb-cli
- Runs ckb-debugger with your specified options

## Usage Examples

### Debug all scripts (default)
```bash
npm run debug
```

### Debug specific script
```bash
npm run debug --script output.0.type
```

### Use custom binary
```bash
npm run debug --script output.0.type --bin ../../contracts/build/release/ckboost-campaign-type
```

### Debug with custom cycle limit
```bash
npm run debug --script input.0.lock --cycles 100000000
```

### Debug with raw transaction
```bash
pnpm run debug --raw-tx --script input.1.type
```

## Command Options

- `--script <location>` - Script to debug (e.g., 'output.0.type', 'input.0.lock')
- `--bin <path>` - Replace script with custom binary
- `--cycles <limit>` - Maximum cycles (default: 70000000)
- `--help` - Show help message

## Files

- `tx_hex.txt` - Input: Raw transaction hex (you paste here)
- `raw_tx.json` - Generated: Parsed transaction in snake_case format
- `mock_tx.json` - Generated: Mock transaction for debugging
- `debug-tx.ts` - The debugger script

## Prerequisites

- Node.js and npm
- `ckb-cli` - [Download from releases](https://github.com/nervosnetwork/ckb-cli/releases)
- `ckb-debugger` - Install with: `cargo install ckb-debugger`

## Debugging Tips

After running the debugger, you can:

1. **View transaction details**:
   ```bash
   jq '.tx' mock_tx.json
   jq '.tx.outputs' mock_tx.json
   ```

2. **Debug different scripts**:
   ```bash
   npm run debug -- --script input.0.lock
   npm run debug -- --script output.0.type
   npm run debug -- --script output.1.type
   ```

3. **Check specific cell data**:
   ```bash
   jq '.tx.outputs_data' mock_tx.json
   ```

## Environment Variables

- `CKB_RPC_URL` - Custom RPC URL (default: https://testnet.ckbapp.dev/rpc)
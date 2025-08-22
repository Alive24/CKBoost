# CKB Transaction Debugger

A TypeScript-based debugger for CKB transactions using CCC (CKB Common Connector).

## Setup

```bash
npm install
```

## Quick Start

### Debug from raw_tx_input.json

```bash
npm run raw output.0.type
```

### Debug from transaction hex

```bash
npm run hex "0x..." -- --script input.0.lock
```

## Usage

### Method 1: Using raw transaction JSON file (recommended)

The debugger reads from `raw_tx_input.json` by default:

```bash
# Debug specific script
npm run raw output.0.type
npm run raw input.0.lock

# With custom binary
npm run raw output.0.type -- --bin ../../contracts/build/release/ckboost-campaign-type

# With custom cycle limit
npm run raw input.0.lock -- --cycles 100000000
```

### Method 2: Using transaction hex

```bash
# Basic usage
npm run hex "0x..." -- --script output.0.type

# With custom binary
npm run hex "0x..." -- --script output.0.type --bin /path/to/binary
```

### Method 3: Generic debug command

For more flexibility, use the base debug command:

```bash
# Debug from custom file
npm run debug -- --raw-tx custom_tx.json --script output.0.type

# Debug with all options
npm run debug -- --raw-tx --script output.0.type --bin /path/to/binary --cycles 100000000
```

## Script Location Formats

- `input.0.lock` - Debug the lock script of input at index 0
- `output.0.type` - Debug the type script of output at index 1
- `input.2.lock` - Debug the lock script of input at index 2

## Command Options

- `--raw-tx [file]` - Use raw transaction JSON file (default: raw_tx_input.json)
- `--tx-hex <hex>` - Transaction hex string to debug
- `--script <location>` - Script to debug (e.g., 'output.0.type', 'input.0.lock')
- `--bin <path>` - Replace script with custom binary
- `--cycles <limit>` - Maximum cycles (default: 70000000)
- `--help` - Show help message

## Files

- `debug-tx.ts` - Main debugger implementation
- `raw_tx_input.json` - Default raw transaction input file for testing
- `mock_tx.json` - Generated mock transaction for debugging
- `output.json` - Debug output (generated when running the debugger)

## Prerequisites

- Node.js and npm
- `ckb-cli` - [Download from releases](https://github.com/nervosnetwork/ckb-cli/releases)
- `ckb-debugger` - Install with: `cargo install ckb-debugger`

## Debugging Tips

After running the debugger:

1. **View transaction details**:

   ```bash
   jq '.tx' mock_tx.json
   jq '.tx.outputs' mock_tx.json
   ```

2. **Debug different scripts**:

   ```bash
   npm run raw input.0.lock
   npm run raw output.0.type
   npm run raw output.1.type
   ```

3. **Check specific cell data**:

   ```bash
   jq '.tx.outputs_data' mock_tx.json
   ```

## Examples

### Example 1: Debug campaign type script

```bash
# Add your transaction to raw_tx_input.json
npm run raw output.0.type
```

### Example 2: Debug with custom binary

```bash
npm run raw output.0.type -- --bin ../../contracts/build/release/ckboost-campaign-type
```

### Example 3: Debug from hex with high cycle limit

```bash
npm run hex "0x..." -- --script input.0.lock --cycles 100000000
```

## Environment Variables

- `CKB_RPC_URL` - Custom RPC URL (default: https://testnet.ckbapp.dev/rpc)
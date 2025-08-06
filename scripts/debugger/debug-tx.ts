#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ccc } from '@ckb-ccc/shell';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const TX_HEX_FILE = path.join(SCRIPT_DIR, 'tx_hex.txt');
const RAW_TX_FILE = path.join(SCRIPT_DIR, 'raw_tx.json');
const TX_FILE = path.join(SCRIPT_DIR, 'tx.json');
const RPC_URL = process.env.CKB_RPC_URL || 'https://testnet.ckbapp.dev/rpc';

interface DebugOptions {
  script?: string;
  binary?: string;
  cycles?: number;
  clean?: boolean;
}

function cleanIntermediateFiles() {
  const files = [RAW_TX_FILE, TX_FILE];
  for (const file of files) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`✓ Deleted ${path.basename(file)}`);
    }
  }
}

function transactionToSnakeCase(tx: ccc.Transaction): any {
  // Convert CCC transaction to snake_case JSON format for ckb-cli
  // All numeric values need 0x prefix for ckb-cli
  const rawTx = {
    version: `0x${tx.version.toString(16)}`,
    cell_deps: tx.cellDeps.map(dep => ({
      out_point: {
        tx_hash: dep.outPoint.txHash.toString(),
        index: `0x${dep.outPoint.index.toString(16)}`
      },
      dep_type: dep.depType
    })),
    header_deps: tx.headerDeps.map(dep => dep.toString()),
    inputs: tx.inputs.map(input => ({
      since: `0x${input.since.toString(16)}`,
      previous_output: {
        tx_hash: input.previousOutput.txHash.toString(),
        index: `0x${input.previousOutput.index.toString(16)}`
      }
    })),
    outputs: tx.outputs.map(output => ({
      capacity: `0x${output.capacity.toString(16)}`,
      lock: {
        code_hash: output.lock.codeHash.toString(),
        hash_type: output.lock.hashType,
        args: output.lock.args.toString()
      },
      type: output.type ? {
        code_hash: output.type.codeHash.toString(),
        hash_type: output.type.hashType,
        args: output.type.args.toString()
      } : null
    })),
    outputs_data: tx.outputsData.map(data => data.toString()),
    witnesses: tx.witnesses.map(witness => witness.toString())
  };
  
  return rawTx;
}

async function parseHexToRawTx(): Promise<void> {
  console.log('\n📝 Step 1: Parsing transaction hex to raw_tx.json\n');
  
  if (!fs.existsSync(TX_HEX_FILE)) {
    throw new Error(`tx_hex.txt not found at ${TX_HEX_FILE}`);
  }
  
  const hexContent = fs.readFileSync(TX_HEX_FILE, 'utf-8');
  console.log(hexContent);
  console.log(`✓ Read hex from tx_hex.txt (${hexContent.length} chars)`);
  
  try {
    // Convert hex string to transaction using CCC
    const tx = ccc.Transaction.decode(hexContent);
    console.log('✓ Parsed hex to CCC Transaction');
    
    // Convert to snake_case format
    const rawTx = transactionToSnakeCase(tx);
    
    // Write to raw_tx.json
    fs.writeFileSync(RAW_TX_FILE, JSON.stringify(rawTx, null, 2));
    console.log(`✓ Written raw_tx.json with snake_case format`);
    
    // Display transaction summary
    console.log('\nTransaction Summary:');
    console.log(`  Version: ${rawTx.version}`);
    console.log(`  Inputs: ${rawTx.inputs.length}`);
    console.log(`  Outputs: ${rawTx.outputs.length}`);
    console.log(`  Cell Deps: ${rawTx.cell_deps.length}`);
    console.log(`  Witnesses: ${rawTx.witnesses.length}`);
    
  } catch (error) {
    console.error('❌ Failed to parse transaction hex:', error);
    throw error;
  }
}

function generateTx(): void {
  console.log('\n🔧 Step 2: Generating transaction\n');
  
  if (!fs.existsSync(RAW_TX_FILE)) {
    throw new Error('raw_tx.json not found. Run step 1 first.');
  }
  
  const command = `ckb-cli --url ${RPC_URL} mock-tx dump --tx-file ${RAW_TX_FILE} --output-file ${TX_FILE}`;
  console.log(`Running: ${command}\n`);
  
  try {
    execSync(command, { stdio: 'inherit' });
    console.log(`\n✓ Generated tx.json`);
  } catch (error) {
    console.error('❌ Failed to generate transaction');
    throw error;    
  }
}

function runDebugger(options: DebugOptions): void {
  console.log('\n🐛 Step 3: Running CKB Debugger\n');
  
  if (!fs.existsSync(TX_FILE)) {
    throw new Error('tx.json not found. Run step 2 first.');
  }
  
  let command = `ckb-debugger --tx-file ${TX_FILE}`;
  
  if (options.script) {
    // ckb-debugger uses --script with the full script specification
    command += ` --script ${options.script}`;
    console.log(`Script: ${options.script}`);
  }
  
  if (options.binary) {
    if (!fs.existsSync(options.binary)) {
      console.warn(`⚠️  Binary not found: ${options.binary}`);
    } else {
      command += ` --bin ${options.binary}`;
      console.log(`Binary: ${options.binary}`);
    }
  }
  
  if (options.cycles) {
    command += ` --max-cycles ${options.cycles}`;
  } else {
    command += ' --max-cycles 70000000';
  }
  
  console.log(`\nRunning: ${command}\n`);
  console.log('═'.repeat(60));
  
  try {
    execSync(command, { stdio: 'inherit' });
    console.log('\n' + '═'.repeat(60));
    console.log('\n✓ Debug session completed');
  } catch (error) {
    console.error('\n❌ Debugger failed');
    throw error;
  }
}

function printUsage(): void {
  console.log(`
CKB Transaction Debugger

Usage: tsx debug-tx.ts [options]

Options:
  --script <location>  Script to debug (e.g., 'output.0.type', 'input.0.lock')
  --bin <path>         Replace script with binary
  --cycles <limit>     Maximum cycles (default: 70000000)
  --clean              Clean intermediate files before starting
  --help               Show this help

Workflow:
  1. Paste raw transaction hex into tx_hex.txt
  2. Run this script to parse and debug
  3. Intermediate files are cleaned before each run

Examples:
  # Basic debug (all scripts)
  tsx debug-tx.ts

  # Debug specific script
  tsx debug-tx.ts --script output.0.type

  # Use custom binary
  tsx debug-tx.ts --script output.0.type --bin ../../contracts/build/release/ckboost-campaign-type
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    printUsage();
    process.exit(0);
  }
  
  const options: DebugOptions = {
    clean: true // Always clean by default
  };
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--script':
        options.script = args[++i];
        break;
      case '--bin':
        options.binary = args[++i];
        break;
      case '--cycles':
        options.cycles = parseInt(args[++i]);
        break;
      case '--no-clean':
        options.clean = false;
        break;
    }
  }
  
  console.log('🚀 CKB Transaction Debugger');
  console.log('═'.repeat(60));
  
  try {
    // Always clean intermediate files before starting
    if (options.clean) {
      console.log('\n🧹 Cleaning intermediate files\n');
      cleanIntermediateFiles();
    }
    
    // Step 1: Parse hex to raw_tx.json
    await parseHexToRawTx();
    
    // Step 2: Generate mock transaction
    generateTx();
    
    // Step 3: Run debugger
    runDebugger(options);
    
    // Print helpful commands
    console.log('\n📚 Quick Commands:');
    console.log('  # Debug other scripts:');
    console.log('  tsx debug-tx.ts --script input.0.lock');
    console.log('  tsx debug-tx.ts --script output.0.type');
    console.log('  tsx debug-tx.ts --script output.1.type');
    console.log('\n  # View transaction details:');
    console.log(`  jq '.tx' tx.json`);
    console.log(`  jq '.tx.outputs' tx.json`);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);
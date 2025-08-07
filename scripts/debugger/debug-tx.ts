#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ccc } from '@ckb-ccc/shell';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const TX_HEX_FILE = path.join(SCRIPT_DIR, 'tx_hex.txt');
const RAW_TX_FILE = path.join(SCRIPT_DIR, 'raw_tx.json');
const RAW_TX_INPUT_FILE = path.join(SCRIPT_DIR, 'raw_tx_input.json'); // User-provided raw tx
const TX_FILE = path.join(SCRIPT_DIR, 'tx.json');
const RPC_URL = process.env.CKB_RPC_URL || 'https://testnet.ckbapp.dev/rpc';

interface DebugOptions {
  script?: string;
  binary?: string;
  cycles?: number;
  clean?: boolean;
  useRawTx?: boolean;
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

// Convert camelCase keys to snake_case recursively
function toSnakeCase(str: string): string {
  // Special cases for CKB terms
  if (str === 'depGroup') return 'dep_group';
  if (str === 'depType') return 'dep_type';
  if (str === 'hashType') return 'hash_type';
  if (str === 'codeHash') return 'code_hash';
  if (str === 'txHash') return 'tx_hash';
  if (str === 'outPoint') return 'out_point';
  if (str === 'cellDeps') return 'cell_deps';
  if (str === 'headerDeps') return 'header_deps';
  if (str === 'outputsData') return 'outputs_data';
  if (str === 'previousOutput') return 'previous_output';
  if (str === 'cellOutput') return 'cell_output';
  if (str === 'outputData') return 'output_data';
  
  // General conversion
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function convertKeysToSnakeCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(item => convertKeysToSnakeCase(item));
  } else if (obj !== null && typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      const snakeKey = toSnakeCase(key);
      let value = obj[key];
      
      // Special handling for dep_type values
      if (snakeKey === 'dep_type' && value === 'depGroup') {
        value = 'dep_group';
      }
      
      result[snakeKey] = convertKeysToSnakeCase(value);
    }
    return result;
  }
  
  // Handle string values that need conversion
  if (typeof obj === 'string' && obj === 'depGroup') {
    return 'dep_group';
  }
  
  return obj;
}

// Clean up input objects - remove cell_output and output_data fields
function cleanInputs(inputs: any[]): any[] {
  return inputs.map(input => {
    const cleaned: any = {
      since: input.since || '0x0'
    };
    
    // Handle both camelCase and snake_case
    if (input.previous_output) {
      cleaned.previous_output = input.previous_output;
    } else if (input.previousOutput) {
      cleaned.previous_output = convertKeysToSnakeCase(input.previousOutput);
    }
    
    return cleaned;
  });
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
  
  const hexContent = fs.readFileSync(TX_HEX_FILE, 'utf-8').trim();
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

async function processRawTxJson(): Promise<void> {
  console.log('\n📝 Step 1: Processing raw transaction JSON\n');
  
  if (!fs.existsSync(RAW_TX_INPUT_FILE)) {
    throw new Error(`raw_tx_input.json not found at ${RAW_TX_INPUT_FILE}`);
  }
  
  const jsonContent = fs.readFileSync(RAW_TX_INPUT_FILE, 'utf-8');
  console.log(`✓ Read raw transaction from raw_tx_input.json`);
  
  try {
    let rawTx = JSON.parse(jsonContent);
    
    // Check if it needs snake_case conversion
    const hasCamelCase = Object.keys(rawTx).some(key => /[A-Z]/.test(key));
    
    if (hasCamelCase) {
      console.log('✓ Detected camelCase format, converting to snake_case...');
      rawTx = convertKeysToSnakeCase(rawTx);
    } else {
      console.log('✓ Transaction already in snake_case format');
    }
    
    // Clean up inputs - remove cell_output and output_data if present
    if (rawTx.inputs && Array.isArray(rawTx.inputs)) {
      const hasExtraFields = rawTx.inputs.some((input: any) => 
        input.cell_output || input.cellOutput || input.output_data || input.outputData
      );
      
      if (hasExtraFields) {
        console.log('✓ Cleaning up input fields (removing cell_output and output_data)...');
        rawTx.inputs = cleanInputs(rawTx.inputs);
      }
    }
    
    // Ensure all required fields have proper format
    // Add 0x prefix to numeric values if missing
    if (rawTx.version && !rawTx.version.startsWith('0x')) {
      rawTx.version = `0x${rawTx.version}`;
    }
    
    // Write to raw_tx.json
    fs.writeFileSync(RAW_TX_FILE, JSON.stringify(rawTx, null, 2));
    console.log(`✓ Written processed raw_tx.json`);
    
    // Display transaction summary
    console.log('\nTransaction Summary:');
    console.log(`  Version: ${rawTx.version}`);
    console.log(`  Inputs: ${rawTx.inputs?.length || 0}`);
    console.log(`  Outputs: ${rawTx.outputs?.length || 0}`);
    console.log(`  Cell Deps: ${rawTx.cell_deps?.length || 0}`);
    console.log(`  Witnesses: ${rawTx.witnesses?.length || 0}`);
    
  } catch (error) {
    console.error('❌ Failed to process raw transaction JSON:', error);
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
  --raw-tx             Use raw_tx_input.json instead of tx_hex.txt
  --clean              Clean intermediate files before starting
  --help               Show this help

Input Methods:
  1. Default: Paste raw transaction hex into tx_hex.txt
  2. Raw JSON: Place transaction JSON in raw_tx_input.json and use --raw-tx
     - Automatically converts camelCase to snake_case
     - Removes cell_output and output_data from inputs

Workflow:
  1. Provide input (tx_hex.txt or raw_tx_input.json)
  2. Run this script to parse and debug
  3. Intermediate files are cleaned before each run

Examples:
  # Basic debug with hex input (all scripts)
  tsx debug-tx.ts

  # Debug with raw JSON input
  tsx debug-tx.ts --raw-tx

  # Debug specific script with raw JSON
  tsx debug-tx.ts --raw-tx --script output.0.type

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
      case '--raw-tx':
        options.useRawTx = true;
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
    
    // Step 1: Parse transaction to raw_tx.json
    if (options.useRawTx) {
      await processRawTxJson();
    } else {
      await parseHexToRawTx();
    }
    
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
    
    // Clean up generated files after debugging
    console.log('\n🧹 Cleaning up generated files...');
    cleanIntermediateFiles();
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    
    // Clean up files even on error
    console.log('\n🧹 Cleaning up generated files...');
    cleanIntermediateFiles();
    
    process.exit(1);
  }
}

// Run the script
main().catch(console.error);
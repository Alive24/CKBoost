#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Load deployments.json
const deploymentsPath = path.join(__dirname, '../../../deployments.json');
const envTestPath = path.join(__dirname, '../.env.test');

if (!fs.existsSync(deploymentsPath)) {
  console.error('❌ deployments.json not found at:', deploymentsPath);
  process.exit(1);
}

const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));

// Get testnet protocol deployment
const testnetProtocol = deployments.current.testnet.protocolType;

if (!testnetProtocol) {
  console.error('❌ No testnet protocol deployment found');
  process.exit(1);
}

console.log('✅ Found testnet protocol deployment:');
console.log(`   Transaction: ${testnetProtocol.transactionHash}`);
console.log(`   Code Hash: ${testnetProtocol.codeHash}`);
console.log(`   Deployed: ${testnetProtocol.deployedAt}`);

// Read existing .env.test file
let envContent = '';
if (fs.existsSync(envTestPath)) {
  envContent = fs.readFileSync(envTestPath, 'utf8');
}

// Update or add deployment values
const updates = {
  'PROTOCOL_CODE_TX_HASH': testnetProtocol.transactionHash,
  'PROTOCOL_CODE_INDEX': testnetProtocol.index.toString(),
  'PROTOCOL_CODE_HASH': testnetProtocol.codeHash,
  'PROTOCOL_HASH_TYPE': testnetProtocol.hashType
};

for (const [key, value] of Object.entries(updates)) {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(envContent)) {
    // Update existing value
    envContent = envContent.replace(regex, `${key}=${value}`);
  } else {
    // Add new value
    envContent += `\n${key}=${value}`;
  }
}

// Write back to .env.test
fs.writeFileSync(envTestPath, envContent);

console.log('✅ Updated .env.test with deployment information');
console.log('');
console.log('Now you can run integration tests with real contract data:');
console.log('  pnpm test:integration');
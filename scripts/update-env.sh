#!/bin/bash

# Update environment files for CKBoost monorepo
# This script ensures both dapp and ssri-ckboost have the correct environment configurations

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== CKBoost Environment Update Script ===${NC}"
echo

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Function to update or add a key-value pair in .env file
update_env_var() {
    local file=$1
    local key=$2
    local value=$3
    
    if [ -f "$file" ]; then
        # Check if key exists
        if grep -q "^$key=" "$file"; then
            # Update existing key
            sed -i.bak "s|^$key=.*|$key=$value|" "$file"
            echo -e "${BLUE}Updated${NC} $key in $file"
        else
            # Add new key
            echo "$key=$value" >> "$file"
            echo -e "${GREEN}Added${NC} $key to $file"
        fi
        # Remove backup file
        rm -f "$file.bak"
    else
        # Create file with key
        echo "$key=$value" > "$file"
        echo -e "${GREEN}Created${NC} $file with $key"
    fi
}

# Function to copy env example if .env doesn't exist
ensure_env_file() {
    local dir=$1
    local env_file="$dir/.env"
    local example_file="$dir/.env.example"
    
    if [ ! -f "$env_file" ]; then
        if [ -f "$example_file" ]; then
            cp "$example_file" "$env_file"
            echo -e "${GREEN}Created${NC} $env_file from example"
        else
            touch "$env_file"
            echo -e "${GREEN}Created${NC} empty $env_file"
        fi
    fi
}

# Load deployments.json if it exists
DEPLOYMENTS_FILE="$ROOT_DIR/deployments.json"
if [ -f "$DEPLOYMENTS_FILE" ]; then
    echo -e "${BLUE}Loading deployments from deployments.json...${NC}"
    
    # Extract values from deployments.json - check the current structure
    # Try new structure first
    PROTOCOL_CODE_HASH=$(jq -r '.current.testnet.ckboostProtocolType.typeHash // empty' "$DEPLOYMENTS_FILE")
    PROTOCOL_TX_HASH=$(jq -r '.current.testnet.ckboostProtocolType.transactionHash // empty' "$DEPLOYMENTS_FILE")
    PROTOCOL_INDEX=$(jq -r '.current.testnet.ckboostProtocolType.index // empty' "$DEPLOYMENTS_FILE")
    
    # If empty, try older structure
    if [ -z "$PROTOCOL_CODE_HASH" ]; then
        PROTOCOL_CODE_HASH=$(jq -r '.current.testnet.protocolType.typeHash // empty' "$DEPLOYMENTS_FILE")
        PROTOCOL_TX_HASH=$(jq -r '.current.testnet.protocolType.transactionHash // empty' "$DEPLOYMENTS_FILE")
        PROTOCOL_INDEX=$(jq -r '.current.testnet.protocolType.index // empty' "$DEPLOYMENTS_FILE")
    fi
    
    # If still empty, try legacy structure
    if [ -z "$PROTOCOL_CODE_HASH" ]; then
        PROTOCOL_CODE_HASH=$(jq -r '.ckBoostProtocolType.codeHash // empty' "$DEPLOYMENTS_FILE")
        PROTOCOL_TX_HASH=$(jq -r '.ckBoostProtocolType.txHash // empty' "$DEPLOYMENTS_FILE")
        PROTOCOL_INDEX=$(jq -r '.ckBoostProtocolType.index // empty' "$DEPLOYMENTS_FILE")
    fi
    
    echo "Found protocol code hash: $PROTOCOL_CODE_HASH"
    echo "Found protocol tx hash: $PROTOCOL_TX_HASH"
else
    echo -e "${YELLOW}No deployments.json found. Using default values.${NC}"
fi

# Update root .env
echo
echo -e "${BLUE}Updating root .env...${NC}"
ensure_env_file "$ROOT_DIR"

# Update ssri-ckboost .env.test
echo
echo -e "${BLUE}Updating packages/ssri-ckboost/.env.test...${NC}"
SSRI_ENV="$ROOT_DIR/packages/ssri-ckboost/.env.test"

if [ ! -f "$SSRI_ENV" ]; then
    # Create default .env.test for ssri-ckboost
    cat > "$SSRI_ENV" << EOF
# SSRI Configuration
SSRI_URL=http://127.0.0.1:9090
SSRI_AUTH=test-auth

# Contract Details (from deployments.json)
# CKBoost Protocol Type on testnet
PROTOCOL_CODE_TX_HASH=${PROTOCOL_TX_HASH:-0x0000000000000000000000000000000000000000000000000000000000000000}
PROTOCOL_CODE_INDEX=${PROTOCOL_INDEX:-0}
PROTOCOL_CODE_HASH=${PROTOCOL_CODE_HASH:-0x0000000000000000000000000000000000000000000000000000000000000000}
PROTOCOL_TYPE_ARGS=0x

# Test Account (DO NOT USE IN PRODUCTION)
# Generate a test private key for testing
# This is a well-known test key, DO NOT use for real funds
TEST_PRIVATE_KEY=0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc

# Skip integration tests if SSRI is not available or no real contracts
# Set to false when you have real deployed contracts
SKIP_INTEGRATION_TESTS=${SKIP_INTEGRATION_TESTS:-true}
EOF
    echo -e "${GREEN}Created${NC} $SSRI_ENV"
else
    # Update existing .env.test
    if [ -n "$PROTOCOL_CODE_HASH" ]; then
        update_env_var "$SSRI_ENV" "PROTOCOL_CODE_HASH" "$PROTOCOL_CODE_HASH"
    fi
    if [ -n "$PROTOCOL_TX_HASH" ]; then
        update_env_var "$SSRI_ENV" "PROTOCOL_CODE_TX_HASH" "$PROTOCOL_TX_HASH"
    fi
    if [ -n "$PROTOCOL_INDEX" ]; then
        update_env_var "$SSRI_ENV" "PROTOCOL_CODE_INDEX" "$PROTOCOL_INDEX"
    fi
fi

# Update dapp .env.local
echo
echo -e "${BLUE}Updating dapp/.env.local...${NC}"
DAPP_ENV="$ROOT_DIR/dapp/.env.local"

# Ensure dapp has an env file
if [ ! -f "$DAPP_ENV" ]; then
    # First try to copy from example
    if [ -f "$ROOT_DIR/dapp/.env.example" ]; then
        cp "$ROOT_DIR/dapp/.env.example" "$DAPP_ENV"
        echo -e "${GREEN}Created${NC} $DAPP_ENV from example"
    else
        touch "$DAPP_ENV"
        echo -e "${GREEN}Created${NC} empty $DAPP_ENV"
    fi
fi

# Update dapp environment variables
if [ -n "$PROTOCOL_CODE_HASH" ]; then
    update_env_var "$DAPP_ENV" "NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH" "$PROTOCOL_CODE_HASH"
fi

# Ensure default values are set
update_env_var "$DAPP_ENV" "NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE" "type"
update_env_var "$DAPP_ENV" "NEXT_PUBLIC_PROTOCOL_TYPE_ARGS" "0x"
update_env_var "$DAPP_ENV" "NEXT_PUBLIC_CKB_NETWORK" "testnet"
update_env_var "$DAPP_ENV" "NEXT_PUBLIC_CKB_RPC_URL" "https://testnet.ckb.dev"

# Summary
echo
echo -e "${GREEN}=== Environment Update Complete ===${NC}"
echo
echo "Updated files:"
echo "  - $ROOT_DIR/.env"
echo "  - $SSRI_ENV"
echo "  - $DAPP_ENV"
echo
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Review the updated .env files"
echo "2. If you haven't deployed contracts yet, run: ./scripts/deployment/deploy-contracts.sh"
echo "3. For dapp development: cd dapp && pnpm dev"
echo "4. For ssri-ckboost tests: cd packages/ssri-ckboost && pnpm test"
echo

# Check if contracts are deployed
if [ -z "$PROTOCOL_CODE_HASH" ] || [ "$PROTOCOL_CODE_HASH" = "0x0000000000000000000000000000000000000000000000000000000000000000" ]; then
    echo -e "${YELLOW}Warning: No deployed contracts found.${NC}"
    echo "Run ./scripts/deployment/deploy-contracts.sh to deploy contracts first."
    # Set SKIP_INTEGRATION_TESTS to true if no contracts
    update_env_var "$SSRI_ENV" "SKIP_INTEGRATION_TESTS" "true"
else
    echo -e "${GREEN}Deployed contracts found! Integration tests can run.${NC}"
    # Set SKIP_INTEGRATION_TESTS to false since we have contracts
    update_env_var "$SSRI_ENV" "SKIP_INTEGRATION_TESTS" "false"
fi
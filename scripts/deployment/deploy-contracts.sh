#!/bin/bash

# CKBoost Contract Deployment Script
# This script deploys CKBoost contracts using ccc-deploy
#
# Usage:
#   ./deploy-contracts.sh <contract-name> [options]
#   ./deploy-contracts.sh --all [options]
#
# Contract names:
#   protocol-type, protocol-lock, campaign-type, campaign-lock, user-type
#
# Options:
#   --network <network>     Network to deploy to (testnet|mainnet|devnet) [default: testnet]
#   --tag <tag>            Deployment tag [default: auto-generated]
#   --upgradeFrom <tag>    Upgrade from existing deployment with this tag
#   --upgrade              Interactive upgrade mode - select from existing deployments
#   --all                  Deploy all contracts
#
# Examples:
#   ./deploy-contracts.sh protocol-type                      # Deploy protocol-type to testnet
#   ./deploy-contracts.sh protocol-type --tag v1.0.0        # Deploy with specific tag
#   ./deploy-contracts.sh protocol-type --upgradeFrom v1.0.0 --tag v2.0.0  # Upgrade contract
#   ./deploy-contracts.sh --all --network mainnet --tag v1.0.0  # Deploy all to mainnet

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    echo "Please create a .env file with your WALLET_PRIVATE_KEY"
    echo "Example:"
    echo "WALLET_PRIVATE_KEY=0x..."
    echo "CKB_RPC_URL=https://testnet.ckb.dev/rpc (optional)"
    exit 1
fi

# Source environment variables
source .env

# Check if WALLET_PRIVATE_KEY is set
if [ -z "$WALLET_PRIVATE_KEY" ]; then
    echo -e "${RED}Error: WALLET_PRIVATE_KEY not found in .env file!${NC}"
    exit 1
fi

# Parse command line arguments
CONTRACT_NAME=""
NETWORK="testnet"
TAG=""
UPGRADE_FROM=""
INTERACTIVE_UPGRADE=false
DEPLOY_ALL=false

# Show usage
show_usage() {
    echo "Usage: $0 <contract-name> [options]"
    echo "       $0 --all [options]"
    echo ""
    echo "Contract names:"
    echo "  protocol-type, protocol-lock, campaign-type, campaign-lock, user-type"
    echo ""
    echo "Options:"
    echo "  --network <network>     Network to deploy to (testnet|mainnet|devnet) [default: testnet]"
    echo "  --tag <tag>            Deployment tag [default: auto-generated]"
    echo "  --upgradeFrom <tag>    Upgrade from existing deployment with this tag"
    echo "  --upgrade              Interactive upgrade mode - select from existing deployments"
    echo "  --all                  Deploy all contracts"
    echo ""
    echo "Examples:"
    echo "  $0 protocol-type                                      # Deploy protocol-type to testnet"
    echo "  $0 protocol-type --tag v1.0.0                        # Deploy with specific tag"
    echo "  $0 protocol-type --upgradeFrom v1.0.0 --tag v2.0.0   # Upgrade from v1.0.0 to v2.0.0"
    echo "  $0 protocol-type --upgrade                            # Interactive upgrade mode"
    echo "  $0 --all --network mainnet --tag v1.0.0             # Deploy all to mainnet"
    exit 1
}

# Check if no arguments provided
if [ $# -eq 0 ]; then
    show_usage
fi

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --all)
            DEPLOY_ALL=true
            shift
            ;;
        --network)
            NETWORK="$2"
            shift 2
            ;;
        --tag)
            TAG="$2"
            shift 2
            ;;
        --upgradeFrom)
            UPGRADE_FROM="$2"
            shift 2
            ;;
        --upgrade)
            INTERACTIVE_UPGRADE=true
            shift
            ;;
        --help|-h)
            show_usage
            ;;
        protocol-type|protocol-lock|campaign-type|campaign-lock|user-type)
            if [ -z "$CONTRACT_NAME" ]; then
                CONTRACT_NAME="$1"
            else
                echo -e "${RED}Error: Multiple contract names specified${NC}"
                show_usage
            fi
            shift
            ;;
        *)
            echo -e "${RED}Error: Unknown option $1${NC}"
            show_usage
            ;;
    esac
done

# Validate input
if [ "$DEPLOY_ALL" = false ] && [ -z "$CONTRACT_NAME" ]; then
    echo -e "${RED}Error: Must specify a contract name or use --all${NC}"
    show_usage
fi

if [ "$DEPLOY_ALL" = true ] && [ ! -z "$CONTRACT_NAME" ]; then
    echo -e "${RED}Error: Cannot specify both --all and a contract name${NC}"
    show_usage
fi

if [ ! -z "$UPGRADE_FROM" ] && [ "$DEPLOY_ALL" = true ]; then
    echo -e "${RED}Error: Cannot use --upgradeFrom with --all${NC}"
    echo "Upgrades must be done one contract at a time"
    show_usage
fi

if [ "$INTERACTIVE_UPGRADE" = true ] && [ "$DEPLOY_ALL" = true ]; then
    echo -e "${RED}Error: Cannot use --upgrade with --all${NC}"
    echo "Interactive upgrades must be done one contract at a time"
    show_usage
fi

if [ "$INTERACTIVE_UPGRADE" = true ] && [ ! -z "$UPGRADE_FROM" ]; then
    echo -e "${RED}Error: Cannot use both --upgrade and --upgradeFrom${NC}"
    echo "Choose either interactive mode or specify the tag directly"
    show_usage
fi

echo -e "${GREEN}CKBoost Contract Deployment${NC}"
echo -e "${BLUE}Network: ${NETWORK}${NC}"

if [ "$DEPLOY_ALL" = true ]; then
    echo -e "${BLUE}Mode: Deploy all contracts${NC}"
    if [ ! -z "$TAG" ]; then
        echo -e "${BLUE}Tag: ${TAG}${NC}"
    else
        echo -e "${BLUE}Tag: <auto-generated>${NC}"
    fi
elif [ "$INTERACTIVE_UPGRADE" = true ]; then
    echo -e "${BLUE}Mode: Interactive Upgrade${NC}"
    echo -e "${BLUE}Contract: ${CONTRACT_NAME}${NC}"
elif [ ! -z "$UPGRADE_FROM" ]; then
    echo -e "${BLUE}Mode: Upgrade${NC}"
    echo -e "${BLUE}Contract: ${CONTRACT_NAME}${NC}"
    echo -e "${BLUE}From: ${UPGRADE_FROM} → To: ${TAG:-<auto-generated>}${NC}"
else
    echo -e "${BLUE}Mode: Deploy${NC}"
    echo -e "${BLUE}Contract: ${CONTRACT_NAME}${NC}"
    if [ ! -z "$TAG" ]; then
        echo -e "${BLUE}Tag: ${TAG}${NC}"
    else
        echo -e "${BLUE}Tag: <auto-generated>${NC}"
    fi
fi
echo ""

# Function to deploy a contract
deploy_contract() {
    local CONTRACT_NAME=$1
    local CONTRACT_PATH=$2
    local WITH_TYPE_ID=${3:-true}
    
    echo -e "\n${YELLOW}Deploying ${CONTRACT_NAME}...${NC}"
    
    # Build command with correct syntax
    local CMD="ccc-deploy deploy generic_contract ${CONTRACT_PATH} --network=${NETWORK}"
    
    # Add tag if provided
    if [ ! -z "$TAG" ]; then
        CMD="${CMD} --tag=${TAG}"
    fi
    
    # Add upgrade flag if provided
    if [ ! -z "$UPGRADE_FROM" ]; then
        if [ "$WITH_TYPE_ID" = "false" ]; then
            echo -e "${YELLOW}Warning: ${CONTRACT_NAME} was deployed without Type ID and cannot be upgraded${NC}"
            echo -e "${YELLOW}Skipping upgrade for ${CONTRACT_NAME}${NC}"
            return
        fi
        CMD="${CMD} --upgradeFrom=${UPGRADE_FROM}"
    elif [ "$INTERACTIVE_UPGRADE" = true ]; then
        if [ "$WITH_TYPE_ID" = "false" ]; then
            echo -e "${YELLOW}Warning: ${CONTRACT_NAME} was deployed without Type ID and cannot be upgraded${NC}"
            echo -e "${YELLOW}Skipping upgrade for ${CONTRACT_NAME}${NC}"
            return
        fi
        CMD="${CMD} --upgrade"
    fi
    
    # Add Type ID flag if needed
    if [ "$WITH_TYPE_ID" = "false" ]; then
        CMD="${CMD} --no-typeId"
    fi
    
    # Execute deployment
    ${CMD}
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ ${CONTRACT_NAME} deployed successfully${NC}"
        
        # Note: ccc-deploy now creates deployment files automatically
        # Files are named: deployment-{contractName}-{network}-{tag}.json
    else
        echo -e "${RED}✗ Failed to deploy ${CONTRACT_NAME}${NC}"
        exit 1
    fi
}

# Deploy contracts
cd contracts

# Build contracts if not already built
if [ ! -d "build/release" ]; then
    echo -e "${YELLOW}Building contracts...${NC}"
    make build
fi

cd ..

# Define contract configurations using functions instead of associative arrays
# This approach is compatible with older bash versions
get_contract_name() {
    case $1 in
        "protocol-type") echo "protocol-type" ;;
        "protocol-lock") echo "protocol-lock" ;;
        "campaign-type") echo "campaign-type" ;;
        "campaign-lock") echo "campaign-lock" ;;
        "user-type") echo "user-type" ;;
        *) echo "" ;;
    esac
}

get_contract_path() {
    case $1 in
        "protocol-type") echo "./contracts/build/release/ckboost-protocol-type" ;;
        "protocol-lock") echo "./contracts/build/release/ckboost-protocol-lock" ;;
        "campaign-type") echo "./contracts/build/release/ckboost-campaign-type" ;;
        "campaign-lock") echo "./contracts/build/release/ckboost-campaign-lock" ;;
        "user-type") echo "./contracts/build/release/ckboost-user-type" ;;
        *) echo "" ;;
    esac
}

get_contract_type_id() {
    case $1 in
        "protocol-type") echo "true" ;;
        "protocol-lock") echo "false" ;;
        "campaign-type") echo "false" ;;
        "campaign-lock") echo "false" ;;
        "user-type") echo "false" ;;
        *) echo "false" ;;
    esac
}

# Deploy contracts
if [ "$DEPLOY_ALL" = true ]; then
    if [ ! -z "$UPGRADE_FROM" ]; then
        echo -e "${RED}Error: Cannot use --upgradeFrom with --all${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}Deploying all contracts...${NC}\n"
    
    for contract in "protocol-type" "protocol-lock" "campaign-type" "campaign-lock" "user-type"; do
        deploy_contract "$(get_contract_name "$contract")" "$(get_contract_path "$contract")" "$(get_contract_type_id "$contract")"
    done
    
    echo -e "\n${GREEN}All contracts deployed successfully!${NC}"
else
    # Deploy single contract
    CONTRACT_PATH=$(get_contract_path "$CONTRACT_NAME")
    if [ -z "$CONTRACT_PATH" ]; then
        echo -e "${RED}Error: Unknown contract name: ${CONTRACT_NAME}${NC}"
        exit 1
    fi
    
    deploy_contract "$(get_contract_name "$CONTRACT_NAME")" "$CONTRACT_PATH" "$(get_contract_type_id "$CONTRACT_NAME")"
    
    if [ ! -z "$UPGRADE_FROM" ]; then
        echo -e "\n${GREEN}Contract upgraded successfully!${NC}"
    else
        echo -e "\n${GREEN}Contract deployed successfully!${NC}"
    fi
fi

# Only create summary if deploying all contracts
if [ "$DEPLOY_ALL" = true ]; then
    echo -e "\n${YELLOW}Checking deployments.json for all contract info...${NC}"

    # Create .env.contracts file for dapp
    echo -e "\n${YELLOW}Creating .env.contracts file for dapp...${NC}"

cat > .env.contracts << EOF
# CKBoost Contract Deployment
# Generated by deploy-contracts.sh
# Network: ${NETWORK}
# Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

# IMPORTANT: Only the protocol type script needs to be in the environment.
# All other contract addresses will be stored in the protocol cell data.

EOF

# Function to extract env vars from deployments.json
extract_env_vars() {
    local CONTRACT_NAME=$1
    local VAR_PREFIX=$2
    
    if [ -f "deployments.json" ]; then
        # Extract values from deployments.json using grep and sed
        local CONTRACT_TYPE=$(echo $CONTRACT_NAME | sed 's/-\([a-z]\)/\U\1/g' | sed 's/^./\L&/')
        
        # Look for the contract in current deployments
        local TYPE_HASH=$(grep -A 10 "\"${CONTRACT_TYPE}\":" deployments.json | grep -o '"typeHash":[[:space:]]*"[^"]*"' | sed 's/.*"typeHash":[[:space:]]*"\([^"]*\)".*/\1/' | head -1)
        local TYPE_ARGS=$(grep -A 10 "\"${CONTRACT_TYPE}\":" deployments.json | grep -A 5 '"typeScript"' | grep -o '"args":[[:space:]]*"[^"]*"' | sed 's/.*"args":[[:space:]]*"\([^"]*\)".*/\1/' | head -1)
        
        if [ ! -z "$TYPE_HASH" ]; then
            echo "# Protocol Type Contract (with Type ID)" >> .env.contracts
            echo "NEXT_PUBLIC_${VAR_PREFIX}_TYPE_HASH=\"${TYPE_HASH}\"" >> .env.contracts
            echo "NEXT_PUBLIC_${VAR_PREFIX}_TYPE_ARGS=\"${TYPE_ARGS}\"" >> .env.contracts
            echo "" >> .env.contracts
        fi
    fi
}

    # Only extract protocol type script info for env
    extract_env_vars "protocol-type" "PROTOCOL_TYPE"
    
    # Add note about other contracts
    echo "# Other contracts are deployed but their addresses will be stored in the protocol cell data" >> .env.contracts
    echo "# See deployment-summary.json for all contract deployment details" >> .env.contracts

    echo -e "${GREEN}✓ All deployments complete!${NC}"
    echo -e "\nDeployment info saved in:"
    echo "  - deployments.json (all deployment info)"
    echo "  - .env.contracts (environment variables for dapp)"
    echo -e "\n${YELLOW}Next steps:${NC}"
    echo "1. Copy ONLY the protocol type script info from .env.contracts to your dapp/.env.local"
    echo "2. Start the dApp and navigate to /platform-admin"
    echo "3. Deploy the protocol cell with all contract addresses from deployments.json"
    echo "4. Create your first campaign using the dapp interface"
fi
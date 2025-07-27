#!/bin/bash

# Integration test script for ssri-ckboost
# This script runs integration tests with automatic Docker management

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

CONTAINER_NAME="ckb-ssri-server-integration"
CONTAINER_STARTED_BY_SCRIPT=false

echo -e "${GREEN}=== SSRI CKBoost Integration Test ===${NC}"
echo

# Function to cleanup Docker container
cleanup_docker() {
    if [ "$CONTAINER_STARTED_BY_SCRIPT" = true ]; then
        echo
        echo -e "${BLUE}Cleaning up Docker container...${NC}"
        docker stop $CONTAINER_NAME >/dev/null 2>&1
        docker rm $CONTAINER_NAME >/dev/null 2>&1
        echo -e "${GREEN}Docker container cleaned up${NC}"
    fi
}

# Set up trap to cleanup on exit
trap cleanup_docker EXIT

# Check if docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running${NC}"
    echo "Please start Docker and try again"
    exit 1
fi

# Start SSRI executor if not running
if ! docker ps | grep -q $CONTAINER_NAME; then
    echo -e "${YELLOW}Starting SSRI executor container...${NC}"
    
    # Remove any existing container with the same name
    docker rm -f $CONTAINER_NAME >/dev/null 2>&1
    
    # Start the container
    docker run -d --name $CONTAINER_NAME -p 9090:9090 hanssen0/ckb-ssri-server >/dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}SSRI executor container started${NC}"
        CONTAINER_STARTED_BY_SCRIPT=true
        # Give it a moment to initialize
        sleep 2
    else
        echo -e "${YELLOW}Could not start SSRI executor (port may be in use)${NC}"
        echo -e "${BLUE}Proceeding with existing setup${NC}"
    fi
else
    echo -e "${GREEN}SSRI executor container already running${NC}"
    CONTAINER_STARTED_BY_SCRIPT=true
fi

echo

# Check for --keep flag
if [ "$1" == "--keep" ] || [ "$1" == "--no-cleanup" ]; then
    trap - EXIT
    echo -e "${YELLOW}Note: Docker container will be kept running after tests${NC}"
fi

# Run integration tests with Jest
echo "Running integration tests..."
npm test -- protocol.integration.test.ts

# Store test exit code
TEST_EXIT_CODE=$?

# If there's an examples directory, run those too
if [ -d "examples" ] && [ -f "examples/update-protocol.ts" ]; then
    echo
    echo "Running protocol update example..."
    npx ts-node examples/update-protocol.ts
fi

echo
echo -e "${GREEN}Integration test completed!${NC}"

# Exit with the test exit code
exit $TEST_EXIT_CODE
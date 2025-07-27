#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

CONTAINER_NAME="ckb-ssri-server-test"
CONTAINER_STARTED_BY_SCRIPT=false

echo -e "${GREEN}=== CKBoost SSRI SDK Test Runner ===${NC}"
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

# Load environment variables if .env.test exists
if [ -f .env.test ]; then
    echo "Loading environment variables from .env.test"
    # Filter out comments and empty lines before exporting
    export $(cat .env.test | grep -v '^#' | grep -v '^$' | xargs)
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    pnpm install
fi

# Build the project
echo
echo "Building project..."
pnpm run build

# Parse command line arguments
TEST_TYPE="all"
KEEP_CONTAINER=false

for arg in "$@"; do
    case $arg in
        unit|integration|watch)
            TEST_TYPE=$arg
            ;;
        --keep|--no-cleanup)
            KEEP_CONTAINER=true
            ;;
        --help|-h)
            echo "Usage: $0 [test-type] [options]"
            echo ""
            echo "Test types:"
            echo "  unit          Run unit tests only"
            echo "  integration   Run integration tests only"
            echo "  watch         Run tests in watch mode"
            echo "  (default)     Run all tests"
            echo ""
            echo "Options:"
            echo "  --keep        Keep Docker container running after tests"
            echo "  --no-cleanup  Same as --keep"
            echo "  --help        Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                    # Run all tests and cleanup"
            echo "  $0 unit               # Run unit tests only"
            echo "  $0 integration --keep # Run integration tests and keep container"
            exit 0
            ;;
    esac
done

# If user wants to keep container, disable auto cleanup
if [ "$KEEP_CONTAINER" = true ]; then
    trap - EXIT
    echo -e "${YELLOW}Note: Docker container will be kept running after tests${NC}"
fi

# Run tests
echo
echo "Running tests..."

case $TEST_TYPE in
    unit)
        echo "Running unit tests only..."
        pnpm test -- --testPathIgnorePatterns=integration
        ;;
    integration)
        echo "Running integration tests only..."
        pnpm test -- protocol.integration.test.ts
        ;;
    watch)
        echo "Running tests in watch mode..."
        # Disable auto cleanup for watch mode
        trap - EXIT
        echo -e "${YELLOW}Note: Docker container will be kept running in watch mode${NC}"
        pnpm run test:watch
        ;;
    *)
        echo "Running all tests..."
        pnpm test
        ;;
esac

# Store test exit code
TEST_EXIT_CODE=$?

# Manual cleanup command
if [ "$TEST_TYPE" != "watch" ] && [ "$KEEP_CONTAINER" != true ]; then
    cleanup_docker
fi

echo
echo -e "${GREEN}Test run completed!${NC}"

# Exit with the test exit code
exit $TEST_EXIT_CODE
#!/bin/bash
# Kill all Jest and related test processes

echo "Killing all Jest processes..."

# Kill jest processes
pkill -9 -f jest

# Kill pnpm test processes
pkill -9 -f "pnpm.*test"

# Kill node processes running jest
pkill -9 -f "node.*jest"

# Also kill any hanging node processes in the ssri-ckboost directory
pkill -9 -f "ssri-ckboost.*node"

# Kill any processes using port 9090 (SSRI executor)
lsof -ti:9090 | xargs kill -9 2>/dev/null

echo "All Jest processes killed"
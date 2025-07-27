#!/bin/bash
# Jest runner for monorepo - handles directory changes

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Always run from ssri-ckboost package for now
cd "$SCRIPT_DIR/packages/ssri-ckboost" || exit 1

# Export PATH to ensure pnpm is found
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# Run pnpm test with all arguments
exec pnpm test -- "$@"
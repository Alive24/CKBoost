#!/bin/bash
set -e

echo "Installing build tools for CKBoost..."

# Install Rust and set up properly
echo "Installing Rust..."
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal
source $HOME/.cargo/env
export PATH="$HOME/.cargo/bin:$PATH"

# Verify Rust installation
echo "Verifying Rust installation..."
rustc --version
cargo --version

# Install moleculec
echo "Installing moleculec..."
cargo install moleculec

# Download and install moleculec-es
echo "Installing moleculec-es..."
MOLECULEC_ES_VERSION="0.4.6"

# Detect platform
if [[ "$OSTYPE" == "linux-gnu"* ]] || [[ -z "$OSTYPE" ]] || [[ "$NETLIFY" == "true" ]]; then
    PLATFORM="linux_amd64"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="darwin_amd64"
else
    echo "Unsupported platform: $OSTYPE, defaulting to linux_amd64"
    PLATFORM="linux_amd64"
fi

MOLECULEC_ES_URL="https://github.com/nervosnetwork/moleculec-es/releases/download/${MOLECULEC_ES_VERSION}/moleculec-es_${MOLECULEC_ES_VERSION}_${PLATFORM}.tar.gz"
echo "Downloading moleculec-es for platform: $PLATFORM"

# Create bin directory if it doesn't exist
mkdir -p $HOME/.local/bin

# Download and extract moleculec-es
curl -L "$MOLECULEC_ES_URL" -o /tmp/moleculec-es.tar.gz
rm -rf /tmp/moleculec-es-extract
mkdir -p /tmp/moleculec-es-extract
tar -xzf /tmp/moleculec-es.tar.gz -C /tmp/moleculec-es-extract
cp /tmp/moleculec-es-extract/moleculec-es $HOME/.local/bin/moleculec-es
chmod +x $HOME/.local/bin/moleculec-es
rm -rf /tmp/moleculec-es.tar.gz /tmp/moleculec-es-extract

# Add to PATH
export PATH="$HOME/.local/bin:$PATH"

echo "Build tools installed successfully!"
echo "moleculec version: $(moleculec --version)"
echo "moleculec-es location: $(which moleculec-es)"
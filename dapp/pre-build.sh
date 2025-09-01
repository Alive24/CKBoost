#!/bin/bash
# Install Rust if not already installed
if ! command -v rustup &> /dev/null; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi

# Source cargo environment
source "$HOME/.cargo/env"
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

# Set default toolchain if not set
rustup default stable 2>/dev/null || rustup install stable && rustup default stable

# Install moleculec if not already installed
if ! command -v moleculec &> /dev/null; then
    cargo install moleculec
fi
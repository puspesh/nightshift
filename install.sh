#!/usr/bin/env bash
set -euo pipefail

# Nightshift installer
# Usage: curl -fsSL https://raw.githubusercontent.com/nightshift-agents/nightshift/main/install.sh | bash

REPO="https://github.com/nightshift-agents/nightshift.git"
INSTALL_DIR="${NIGHTSHIFT_HOME:-$HOME/.nightshift-install}"
BIN_DIR="${NIGHTSHIFT_BIN:-/usr/local/bin}"

# Colors (disabled when not a TTY)
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  DIM='\033[2m'
  RESET='\033[0m'
else
  RED='' GREEN='' YELLOW='' DIM='' RESET=''
fi

info()  { printf "${GREEN}▸${RESET} %s\n" "$1"; }
warn()  { printf "${YELLOW}▸${RESET} %s\n" "$1"; }
error() { printf "${RED}✗${RESET} %s\n" "$1" >&2; exit 1; }

# --- Pre-flight checks ---

command -v git  >/dev/null 2>&1 || error "git is required but not installed"
command -v node >/dev/null 2>&1 || error "node >= 18 is required but not installed"

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
[ "$NODE_MAJOR" -ge 18 ] || error "node >= 18 required (found v$(node -v))"

# npm or bun for building
if command -v npm >/dev/null 2>&1; then
  PKG_MGR="npm"
elif command -v bun >/dev/null 2>&1; then
  PKG_MGR="bun"
else
  error "npm or bun is required but not installed"
fi

# --- Resolve BIN_DIR (avoid surprise sudo) ---

if [ ! -w "$BIN_DIR" ]; then
  BIN_DIR="$HOME/.local/bin"
  mkdir -p "$BIN_DIR"
  warn "Default bin dir not writable. Installing to $BIN_DIR — ensure it is in your PATH."
fi

# --- Install ---

if [ -d "$INSTALL_DIR" ]; then
  info "Updating existing installation..."
  if ! git -C "$INSTALL_DIR" diff --quiet HEAD 2>/dev/null; then
    warn "$INSTALL_DIR has local modifications. Removing and re-cloning."
    rm -rf "$INSTALL_DIR"
    git clone --depth 1 "$REPO" "$INSTALL_DIR"
  else
    git -C "$INSTALL_DIR" pull --ff-only --quiet 2>/dev/null || {
      warn "Pull failed, re-cloning..."
      rm -rf "$INSTALL_DIR"
      git clone --depth 1 "$REPO" "$INSTALL_DIR"
    }
  fi
else
  info "Cloning nightshift..."
  git clone --depth 1 "$REPO" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

info "Installing dependencies..."
# --ignore-scripts: safe — current deps (chalk, prompts, yaml) need no postinstall
$PKG_MGR install --ignore-scripts || error "Dependency installation failed"

info "Building..."
$PKG_MGR run build || error "Build failed"

# --- Link binary ---

NIGHTSHIFT_BIN_PATH="$INSTALL_DIR/dist/bin/nightshift.js"
[ -f "$NIGHTSHIFT_BIN_PATH" ] || error "Build failed: $NIGHTSHIFT_BIN_PATH not found"

LINK_PATH="$BIN_DIR/nightshift"
ln -sf "$NIGHTSHIFT_BIN_PATH" "$LINK_PATH"

# --- Verify ---

if [ -x "$LINK_PATH" ]; then
  VERSION=$("$LINK_PATH" --version 2>/dev/null || echo "installed")
  echo ""
  printf "${GREEN}✓ nightshift ${VERSION} installed successfully${RESET}\n"
  echo ""
  printf "${DIM}  Source:  ${INSTALL_DIR}${RESET}\n"
  printf "${DIM}  Binary:  ${LINK_PATH}${RESET}\n"
  echo ""
  info "Get started: cd your-repo && nightshift init --team dev"
else
  error "Installation completed but $LINK_PATH is not executable. Check permissions."
fi

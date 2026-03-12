#!/bin/sh
set -e

# Ensure vault directory exists
mkdir -p /vault/Projects

if [ -z "$OBSIDIAN_EMAIL" ]; then
  echo "OBSIDIAN_EMAIL not set — running as local vault only (no sync)"
  echo "Vault directory: /vault"
  # Keep container alive so the shared volume remains accessible
  exec sleep infinity
fi

echo "Logging in to Obsidian Sync..."
ob login --email "$OBSIDIAN_EMAIL" --password "$OBSIDIAN_PASSWORD"

echo "Setting up vault sync for: $OBSIDIAN_VAULT_NAME"
ob sync-setup --vault "$OBSIDIAN_VAULT_NAME" --path /vault

echo "Starting continuous sync..."
exec ob sync --continuous

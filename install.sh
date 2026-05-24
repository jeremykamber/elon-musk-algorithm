#!/usr/bin/env bash
set -euo pipefail

# ─── Elon Plugin Installer ───────────────────────────────────────────────────
# Installs the plugin into opencode's config, registers the ELON agent,
# and sets it as the default. Run from anywhere — the script auto-locates itself.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCODE_CONFIG_DIR="${HOME}/.config/opencode"
OPENCODE_CONFIG="${OPENCODE_CONFIG_DIR}/opencode.jsonc"
PLUGIN_NAME="elon"

echo "🚀 Installing Elon plugin into opencode..."

# 1. Build the plugin
echo "   → Building plugin..."
cd "$SCRIPT_DIR"
npm install --silent 2>/dev/null
npm run build 2>/dev/null || npx tsc

# 2. Install as npm dependency in opencode config directory
echo "   → Installing package in ${OPENCODE_CONFIG_DIR}..."
mkdir -p "$OPENCODE_CONFIG_DIR"
cd "$OPENCODE_CONFIG_DIR"
npm install "$SCRIPT_DIR" 2>/dev/null

# 3. Read existing config or create from scratch
if [ -f "$OPENCODE_CONFIG" ]; then
  CONFIG=$(cat "$OPENCODE_CONFIG")
else
  CONFIG='{}'
fi

# 4. Update plugin array — add "elon" after "oh-my-openagent@latest" if not present
if ! echo "$CONFIG" | grep -q '"elon"'; then
  # Add elon to plugin array
  CONFIG=$(echo "$CONFIG" | sed 's/"oh-my-openagent@latest"/"oh-my-openagent@latest",\n    "'"$PLUGIN_NAME"'"/')
  echo "   → Added 'elon' to plugin array"
fi

# 5. Add agent configuration (read from agent-config.json, single source of truth)
if ! echo "$CONFIG" | grep -q '"agent"'; then
  AGENT_CONFIG=$(cat "$SCRIPT_DIR/agent-config.json")
  # Indent the agent JSON properly for insertion into opencode.jsonc
  AGENT_BLOCK="  \"agent\": ${AGENT_CONFIG},
  \"default_agent\": \"elon\","
  CONFIG=$(echo "$CONFIG" | sed 's|"$schema":|'"$AGENT_BLOCK"'\
  "$schema":|')
  echo "   → Added agent config for 'elon'"
fi

# 6. Set default_agent if not present
if ! echo "$CONFIG" | grep -q '"default_agent"'; then
  CONFIG=$(echo "$CONFIG" | sed 's|"$schema":|"default_agent": "elon",\n  "$schema":|')
  echo "   → Set elon as default agent"
fi

# 7. Write config
echo "$CONFIG" > "$OPENCODE_CONFIG"
echo ""
echo "✅ Installation complete!"
echo ""
echo "   Restart opencode. The 'ELON' agent will appear in the agent"
echo "   selector and be set as the default for new sessions."
echo ""

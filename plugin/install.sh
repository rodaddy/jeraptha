#!/usr/bin/env bash
# install.sh -- Install pai-hooks plugin on any OpenClaw instance
# Usage: ./install.sh [--remote user@host]
#
# Installs the pai-hooks plugin, enables it, adds debug logging to plist,
# and restarts the gateway. Idempotent -- safe to run multiple times.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REMOTE=""

if [[ "${1:-}" == "--remote" ]]; then
  REMOTE="${2:?Usage: ./install.sh --remote user@host}"
  shift 2
fi

run() {
  if [[ -n "$REMOTE" ]]; then
    ssh "$REMOTE" "$@"
  else
    eval "$@"
  fi
}

log() { echo "[pai-hooks:install] $*"; }

# 1. Copy plugin files
log "Installing plugin..."
DEST="~/.openclaw/extensions/pai-hooks"
run "mkdir -p $DEST"

if [[ -n "$REMOTE" ]]; then
  scp "$SCRIPT_DIR/openclaw.plugin.json" "$REMOTE:$DEST/"
  scp "$SCRIPT_DIR/index.js" "$REMOTE:$DEST/"
else
  cp "$SCRIPT_DIR/openclaw.plugin.json" "$(eval echo $DEST)/"
  cp "$SCRIPT_DIR/index.js" "$(eval echo $DEST)/"
fi
log "Plugin files copied to $DEST"

# 2. Enable plugin
log "Enabling plugin..."
run "openclaw plugins enable pai-hooks 2>/dev/null || true"
run "openclaw config set plugins.entries.pai-hooks.config.debug true 2>/dev/null || true"

# 3. Add OPENCLAW_LOG_LEVEL=debug to plist (if macOS)
if run "test -f ~/Library/LaunchAgents/ai.openclaw.gateway.plist" 2>/dev/null; then
  if ! run "grep -q OPENCLAW_LOG_LEVEL ~/Library/LaunchAgents/ai.openclaw.gateway.plist" 2>/dev/null; then
    log "Adding OPENCLAW_LOG_LEVEL=debug to plist..."
    run "cp ~/Library/LaunchAgents/ai.openclaw.gateway.plist ~/Library/LaunchAgents/ai.openclaw.gateway.plist.backup-\$(date +%s)"
    run "/usr/libexec/PlistBuddy -c 'Add :EnvironmentVariables:OPENCLAW_LOG_LEVEL string debug' ~/Library/LaunchAgents/ai.openclaw.gateway.plist"
  else
    log "OPENCLAW_LOG_LEVEL already in plist"
  fi
fi

# 4. Remove dead managed hooks (if they exist)
log "Cleaning dead managed hooks..."
DEAD_HOOKS="law-01-never-assume law-05-explain-before-doing law-10-search-ob-first law-11-no-secrets law-13-no-silent-autopilot law-15-no-litellm-self-surgery law-reinforcement no-deaf-polls no-self-surgery no-unsolicited-images ob-gate rate-limiter sentiment-tracker session-start sop-gate subagent-nudge task-context"
for hook in $DEAD_HOOKS; do
  if run "test -d ~/.openclaw/hooks/$hook" 2>/dev/null; then
    run "rm -rf ~/.openclaw/hooks/$hook"
    log "  Removed dead hook: $hook"
  fi
done

# 5. Restart gateway
log "Restarting gateway..."
run "openclaw gateway restart 2>/dev/null || true"

# 6. Verify
sleep 5
log "Verifying..."
if run "grep -q '\[pai-hooks\] registered' /tmp/openclaw/openclaw-\$(date +%Y-%m-%d).log 2>/dev/null"; then
  log "SUCCESS -- pai-hooks plugin registered and running"
else
  log "WARNING -- registration not yet visible in logs (may need a few seconds)"
fi

log "Done. Monitor: grep '\[pai-hooks\]' /tmp/openclaw/openclaw-\$(date +%Y-%m-%d).log"

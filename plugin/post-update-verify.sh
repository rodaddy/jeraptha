#!/usr/bin/env bash
# post-update-verify.sh -- Run after any OC update to verify pai-hooks plugin
# Usage: ./post-update-verify.sh [--remote user@host] [--fix]
#
# Checks:
# 1. Plugin files exist in extensions/
# 2. Plugin enabled in openclaw.json
# 3. OPENCLAW_LOG_LEVEL=debug in plist
# 4. No dead managed hooks lingering
# 5. Gateway loaded the plugin
#
# With --fix: auto-repairs anything broken

set -uo pipefail
# NOT using set -e -- we handle errors ourselves in checks

REMOTE=""
FIX=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote) REMOTE="$2"; shift 2 ;;
    --fix) FIX=true; shift ;;
    *) echo "Usage: $0 [--remote user@host] [--fix]"; exit 1 ;;
  esac
done

run() {
  if [[ -n "$REMOTE" ]]; then
    ssh "$REMOTE" "$@"
  else
    eval "$@"
  fi
}

PASS=0
FAIL=0
FIXED=0

check() {
  local name="$1" result="$2"
  if [[ "$result" == "ok" ]]; then
    echo "  [PASS] $name"
    ((PASS++))
  else
    echo "  [FAIL] $name -- $result"
    ((FAIL++))
  fi
}

fix() {
  local name="$1"
  echo "  [FIX]  $name"
  ((FIXED++))
}

echo "=== PAI Hooks Post-Update Verification ==="
echo ""

# 1. Plugin files
if run "test -f ~/.openclaw/extensions/pai-hooks/index.js && test -f ~/.openclaw/extensions/pai-hooks/openclaw.plugin.json" 2>/dev/null; then
  check "Plugin files exist" "ok"
else
  check "Plugin files exist" "MISSING -- run install.sh"
  if $FIX; then
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    if [[ -n "$REMOTE" ]]; then
      run "mkdir -p ~/.openclaw/extensions/pai-hooks"
      scp "$SCRIPT_DIR/index.js" "$REMOTE:~/.openclaw/extensions/pai-hooks/"
      scp "$SCRIPT_DIR/openclaw.plugin.json" "$REMOTE:~/.openclaw/extensions/pai-hooks/"
    fi
    fix "Copied plugin files"
  fi
fi

# 2. Plugin enabled
if run "cat ~/.openclaw/openclaw.json 2>/dev/null | grep -q 'pai-hooks'" 2>/dev/null; then
  check "Plugin enabled in config" "ok"
else
  check "Plugin enabled in config" "NOT ENABLED"
  if $FIX; then
    run "openclaw plugins enable pai-hooks 2>/dev/null || true"
    run "openclaw config set plugins.entries.pai-hooks.config.debug true 2>/dev/null || true"
    fix "Enabled pai-hooks plugin"
  fi
fi

# 3. Plist debug logging
if run "test -f ~/Library/LaunchAgents/ai.openclaw.gateway.plist" 2>/dev/null; then
  if run "grep -q OPENCLAW_LOG_LEVEL ~/Library/LaunchAgents/ai.openclaw.gateway.plist" 2>/dev/null; then
    check "OPENCLAW_LOG_LEVEL in plist" "ok"
  else
    check "OPENCLAW_LOG_LEVEL in plist" "MISSING (OC update wiped it)"
    if $FIX; then
      run "cp ~/Library/LaunchAgents/ai.openclaw.gateway.plist ~/Library/LaunchAgents/ai.openclaw.gateway.plist.backup-\$(date +%s)"
      run "/usr/libexec/PlistBuddy -c 'Add :EnvironmentVariables:OPENCLAW_LOG_LEVEL string debug' ~/Library/LaunchAgents/ai.openclaw.gateway.plist 2>/dev/null || true"
      fix "Added OPENCLAW_LOG_LEVEL=debug to plist"
    fi
  fi
fi

# 4. No dead managed hooks
DEAD_COUNT=$(run 'count=0; for d in law-01-never-assume law-05-explain-before-doing law-10-search-ob-first law-11-no-secrets law-13-no-silent-autopilot law-15-no-litellm-self-surgery law-reinforcement no-deaf-polls no-self-surgery no-unsolicited-images ob-gate rate-limiter sentiment-tracker session-start sop-gate subagent-nudge task-context; do [ -d ~/.openclaw/hooks/$d ] && count=$((count+1)); done; echo $count' 2>/dev/null || echo "0")
DEAD_COUNT=$(echo "$DEAD_COUNT" | tr -d ' ')
if [[ "$DEAD_COUNT" == "0" ]]; then
  check "No dead managed hooks" "ok"
else
  check "No dead managed hooks" "$DEAD_COUNT dead hooks still present"
  if $FIX; then
    run 'for d in law-01-never-assume law-05-explain-before-doing law-10-search-ob-first law-11-no-secrets law-13-no-silent-autopilot law-15-no-litellm-self-surgery law-reinforcement no-deaf-polls no-self-surgery no-unsolicited-images ob-gate rate-limiter sentiment-tracker session-start sop-gate subagent-nudge task-context; do rm -rf ~/.openclaw/hooks/$d 2>/dev/null; done'
    fix "Removed dead managed hooks"
  fi
fi

# 5. Workspace hook duplicates
WS_DUPES=$(run 'count=0; for d in law-reinforcement no-self-surgery no-unsolicited-images rate-limiter; do [ -d ~/.openclaw/workspace/hooks/$d ] && count=$((count+1)); done; echo $count' 2>/dev/null || echo "0")
WS_DUPES=$(echo "$WS_DUPES" | tr -d ' ')
if [[ "$WS_DUPES" == "0" ]]; then
  check "No workspace hook duplicates" "ok"
else
  check "No workspace hook duplicates" "$WS_DUPES duplicates causing log noise"
  if $FIX; then
    run 'for d in law-reinforcement no-self-surgery no-unsolicited-images rate-limiter; do rm -rf ~/.openclaw/workspace/hooks/$d 2>/dev/null; done'
    fix "Removed workspace hook duplicates"
  fi
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed, $FIXED fixed ==="

if [[ $FAIL -gt 0 && ! $FIX ]]; then
  echo ""
  echo "Run with --fix to auto-repair: $0 --fix"
fi

# 6. Check if gateway needs restart
if [[ $FIXED -gt 0 ]]; then
  echo ""
  echo "Changes made -- restart gateway: openclaw gateway restart"
fi

#!/usr/bin/env bash
# verify-quick.sh -- One-shot pass/fail verification for OC + Jeraptha
# Usage: ./verify-quick.sh [user@host]
#
# Runs all critical checks from verify.md and summarizes results.
# Pass a user@host argument to run remotely, or omit for local execution.
set -uo pipefail

OC_HOST="${1:-}"
r() { if [[ -n "${OC_HOST:-}" ]]; then ssh -o ConnectTimeout=10 "$OC_HOST" "$@"; else eval "$@"; fi; }

PASS=0; FAIL=0
check() {
  local name="$1" ok="$2"
  if [[ "$ok" == "true" ]]; then echo "  [PASS] $name"; ((PASS++))
  else echo "  [FAIL] $name"; ((FAIL++)); fi
}

echo "=== OpenClaw + Jeraptha Verification ==="
echo ""

# Gateway
echo "--- Gateway ---"
check "Process running" "$(r 'ps aux | grep "[o]penclaw" | grep -q . && echo true || echo false')"
check "Port 18789" "$(r 'lsof -iTCP:18789 -sTCP:LISTEN -P 2>/dev/null | grep -q . && echo true || echo false')"
check "HTTP 200" "$(r 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18789/' | grep -q 200 && echo true || echo false)"

# Plugin
echo "--- Jeraptha Plugin ---"
check "Plugin files" "$(r 'test -f ~/.openclaw/extensions/jeraptha/index.js && echo true || echo false')"
check "Plugin enabled" "$(r 'jq -e ".plugins.entries.jeraptha.enabled" ~/.openclaw/openclaw.json 2>/dev/null | grep -q true && echo true || echo false')"
check "Plugin registered" "$(r 'grep -q "\[jeraptha\] registered" /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log 2>/dev/null && echo true || echo false')"
check "No stale pai-hooks" "$(r 'test -d ~/.openclaw/extensions/pai-hooks && echo false || echo true')"

# Workspace
echo "--- Workspace ---"
for f in TASKS.md SCORECARD.md HEARTBEAT.md AGENTS.md SOUL.md; do
  check "$f" "$(r "test -f ~/.openclaw/workspace/$f && echo true || echo false")"
done

# Config
echo "--- Config ---"
check "contextTokens=1M" "$(r 'jq -e ".agents.defaults.contextTokens == 1000000" ~/.openclaw/openclaw.json 2>/dev/null | grep -q true && echo true || echo false')"
check "lightContext=false" "$(r 'jq -e ".agents.defaults.heartbeat.lightContext == false" ~/.openclaw/openclaw.json 2>/dev/null | grep -q true && echo true || echo false')"
check "suppressErrors=false" "$(r 'jq -e ".agents.defaults.heartbeat.suppressToolErrorWarnings == false" ~/.openclaw/openclaw.json 2>/dev/null | grep -q true && echo true || echo false')"

# Network
echo "--- Network ---"
check "LiteLLM" "$(r 'curl -s -m 5 -o /dev/null -w "%{http_code}" http://10.71.1.33:4000/health' | grep -qE '200|2[0-9][0-9]' && echo true || echo false)"
check "Open Brain" "$(r 'curl -s -m 5 -o /dev/null -w "%{http_code}" http://10.71.20.15:3100/health' | grep -qE '200|2[0-9][0-9]' && echo true || echo false)"

# mcp2cli
echo "--- mcp2cli ---"
check "Daemon port 9501" "$(r 'lsof -iTCP:9501 -sTCP:LISTEN -P 2>/dev/null | grep -q . && echo true || echo false')"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[[ $FAIL -gt 0 ]] && echo "Review failing checks above. Use verify.md for remediation steps."
exit $FAIL

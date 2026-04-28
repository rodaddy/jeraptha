#!/usr/bin/env bash
# jeraptha v2.0 installer
# Installs plugin, workspace files, docs, and config into an OpenClaw instance
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace}"
HOOKS_DIR="${OPENCLAW_HOOKS:-$HOME/.openclaw/hooks}"
EXTENSIONS_DIR="${OPENCLAW_EXTENSIONS:-$HOME/.openclaw/extensions}"
OC_CONFIG="$HOME/.openclaw/openclaw.json"
DRY_RUN=false
APPLY_CONFIG=false

# Colors (disabled if not a terminal)
if [ -t 1 ]; then
  GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
else
  GREEN=''; YELLOW=''; RED=''; NC=''
fi

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --workspace) WORKSPACE="$2"; shift 2 ;;
    --hooks) HOOKS_DIR="$2"; shift 2 ;;
    --apply-config) APPLY_CONFIG=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help|-h)
      echo "Usage: $0 [--workspace <path>] [--hooks <path>] [--apply-config] [--dry-run]"
      echo "Installs jeraptha v2.0 into an OpenClaw instance."
      echo "  --workspace <path>  Workspace dir (default: ~/.openclaw/workspace)"
      echo "  --hooks <path>      Hooks dir (default: ~/.openclaw/hooks)"
      echo "  --apply-config      Apply recommended config to openclaw.json"
      echo "  --dry-run           Show what would be done without doing it"
      exit 0
      ;;
    *) echo -e "${RED}[jeraptha] Unknown option: $1${NC}"; exit 1 ;;
  esac
done

log()  { echo -e "${GREEN}[jeraptha]${NC} $1"; }
warn() { echo -e "${YELLOW}[jeraptha]${NC} $1"; }
err()  { echo -e "${RED}[jeraptha]${NC} $1"; }

run() {
  if $DRY_RUN; then
    echo -e "  ${YELLOW}[DRY RUN]${NC} $1"
  else
    eval "$1"
  fi
}

# --- Dated backup helper ---
BACKUP_DIR="$HOME/.openclaw/backups/$(date +%Y-%m-%d)-jeraptha-install"

backup_file() {
  local file="$1"
  if [ -f "$file" ]; then
    run "mkdir -p '$BACKUP_DIR'"
    local base; base=$(basename "$file")
    run "cp '$file' '$BACKUP_DIR/$base'"
    log "  Backed up: $base -> $BACKUP_DIR/"
  fi
}

backup_dir() {
  local dir="$1"
  local name="$2"
  if [ -d "$dir" ]; then
    run "mkdir -p '$BACKUP_DIR'"
    run "cp -R '$dir' '$BACKUP_DIR/$name'"
    log "  Backed up: $name -> $BACKUP_DIR/"
  fi
}

log "Installing jeraptha v2.6"
log "  Workspace: $WORKSPACE | Hooks: $HOOKS_DIR"
log "  Extensions: $EXTENSIONS_DIR | Config: $OC_CONFIG"
echo ""

# --- Disable old pai-hooks plugin ---
OLD_PLUGIN_DIR="$EXTENSIONS_DIR/pai-hooks"
if [ -d "$OLD_PLUGIN_DIR" ]; then
  log "=== Disabling Legacy pai-hooks Plugin ==="
  backup_dir "$OLD_PLUGIN_DIR" "pai-hooks"
  DISABLED_DIR="$EXTENSIONS_DIR/_disabled"
  run "mkdir -p '$DISABLED_DIR'"
  run "mv '$OLD_PLUGIN_DIR' '$DISABLED_DIR/pai-hooks'"
  log "  Moved pai-hooks -> _disabled/pai-hooks"
fi
echo ""

# --- Install jeraptha plugin ---
log "=== Installing Jeraptha Plugin ==="
PLUGIN_DIR="$EXTENSIONS_DIR/jeraptha"
if [ -d "$PLUGIN_DIR" ]; then
  backup_dir "$PLUGIN_DIR" "jeraptha-previous"
fi
run "mkdir -p '$PLUGIN_DIR'"
run "cp '$SCRIPT_DIR/plugin/openclaw.plugin.json' '$PLUGIN_DIR/'"
run "cp '$SCRIPT_DIR/plugin/index.js' '$PLUGIN_DIR/'"
run "cp '$SCRIPT_DIR/plugin/post-update-verify.sh' '$PLUGIN_DIR/'"
log "  Plugin installed to $PLUGIN_DIR"

# Copy post-update-verify.sh to patches dir as well
run "mkdir -p '$HOME/.openclaw/patches'"
run "cp '$SCRIPT_DIR/plugin/post-update-verify.sh' '$HOME/.openclaw/patches/'"
log "  post-update-verify.sh copied to ~/.openclaw/patches/"

# Enable the plugin via CLI
if ! $DRY_RUN; then
  if command -v openclaw &>/dev/null; then
    openclaw plugins enable jeraptha 2>/dev/null || true
    openclaw config set plugins.entries.jeraptha.config.debug true 2>/dev/null || true
    log "  Plugin enabled via openclaw CLI"
  else
    warn "  openclaw CLI not found -- enable manually: openclaw plugins enable jeraptha"
  fi
fi
echo ""

# --- Clean up dead managed hooks from previous installs ---
log "=== Cleaning Dead Managed Hooks ==="
DEAD_HOOKS="law-reinforcement no-deaf-polls no-self-surgery ob-gate sentiment-tracker sop-gate task-context"
cleaned=0
for hook in $DEAD_HOOKS; do
  if [ -d "$HOOKS_DIR/$hook" ]; then
    log "  Removing dead managed hook: $hook"
    run "rm -rf '$HOOKS_DIR/$hook'"
    cleaned=$((cleaned + 1))
  fi
done
if [ "$cleaned" -eq 0 ]; then
  log "  No dead hooks found -- clean"
fi
echo ""

# --- Workspace files ---
log "=== Installing Workspace Files ==="
run "mkdir -p '$WORKSPACE'"
for file in AGENTS.md HEARTBEAT.md; do
  if [ -f "$WORKSPACE/$file" ]; then
    warn "  $file exists -- skipping"
  else
    log "  Installing: $file"
    run "cp '$SCRIPT_DIR/workspace/$file' '$WORKSPACE/$file'"
  fi
done
echo ""

# --- Includes (prompt-include system) ---
log "=== Installing Prompt-Include Files ==="
run "mkdir -p '$WORKSPACE/includes'"
for inc in "$SCRIPT_DIR"/workspace/includes/*.include.md; do
  [ -f "$inc" ] || continue
  inc_name=$(basename "$inc")
  dest="$WORKSPACE/includes/$inc_name"
  if [ -f "$dest" ]; then
    warn "  $inc_name already exists -- skipping (won't overwrite custom includes)"
  else
    log "  Installing include: $inc_name"
    run "cp '$inc' '$dest'"
  fi
done
echo ""

log "=== Installing Templates ==="
for tmpl in "$SCRIPT_DIR"/workspace/*.template; do
  [ -f "$tmpl" ] || continue
  tmpl_name=$(basename "$tmpl")
  base_name="${tmpl_name%.template}"
  dest="$WORKSPACE/$tmpl_name"

  if [ -f "$WORKSPACE/$base_name" ]; then
    warn "  $base_name already exists -- skipping template"
  elif [ -f "$dest" ]; then
    warn "  $tmpl_name already exists -- skipping"
  else
    log "  Copying template: $tmpl_name"
    run "cp '$tmpl' '$dest'"
  fi
done
echo ""

# --- Docs ---
log "=== Installing Documentation ==="
run "mkdir -p '$WORKSPACE/docs/jeraptha'"
for doc in "$SCRIPT_DIR"/docs/*.md; do
  [ -f "$doc" ] || continue
  doc_name=$(basename "$doc")
  dest="$WORKSPACE/docs/jeraptha/$doc_name"
  if [ -f "$dest" ]; then
    warn "  $doc_name already exists -- skipping"
  else
    log "  Installing doc: $doc_name"
    run "cp '$doc' '$dest'"
  fi
done
echo ""

# --- Config reference ---
log "=== Installing Config Reference ==="
run "mkdir -p '$WORKSPACE/docs/jeraptha/config'"
for cfg in "$SCRIPT_DIR"/config/*.md; do
  [ -f "$cfg" ] || continue
  cfg_name=$(basename "$cfg")
  dest="$WORKSPACE/docs/jeraptha/config/$cfg_name"
  if [ -f "$dest" ]; then
    warn "  $cfg_name already exists -- skipping"
  else
    log "  Installing config doc: $cfg_name"
    run "cp '$cfg' '$dest'"
  fi
done
echo ""

# --- Apply recommended config ---
if $APPLY_CONFIG; then
  log "=== Applying Recommended Config ==="
  if ! command -v jq &>/dev/null; then
    err "  jq is required to apply config. Install with: brew install jq"
    exit 1
  fi

  if [ -f "$OC_CONFIG" ]; then
    backup_file "$OC_CONFIG"
  else
    warn "  openclaw.json not found -- creating fresh config"
    if ! $DRY_RUN; then
      mkdir -p "$(dirname "$OC_CONFIG")"
      echo '{}' > "$OC_CONFIG"
    fi
  fi

  if ! $DRY_RUN; then
    TMP_CONFIG="$(mktemp)"
    jq '
      .agents.defaults.contextTokens = 1000000 |
      .agents.defaults.compaction.reserveTokens = 600000 |
      .agents.defaults.compaction.reserveTokensFloor = 600000 |
      .agents.defaults.heartbeat.lightContext = false |
      .agents.defaults.heartbeat.suppressToolErrorWarnings = false |
      .agents.defaults.heartbeat.model = "litellm/sonnet4.6[1M]" |
      .agents.defaults.thinkingDefault = "high"
    ' "$OC_CONFIG" > "$TMP_CONFIG"
    mv "$TMP_CONFIG" "$OC_CONFIG"
    log "  Applied: contextTokens=1M, reserveTokens=600K, lightContext=false"
    log "  Applied: heartbeat.model=litellm/sonnet4.6[1M], thinkingDefault=high"
  else
    run "jq '...' '$OC_CONFIG' > tmpfile && mv tmpfile '$OC_CONFIG'"
  fi
  echo ""
elif [ -t 0 ] && ! $DRY_RUN; then
  # Interactive prompt if not --apply-config and stdin is a terminal
  echo -n "[jeraptha] Apply recommended config to openclaw.json? [y/N] "
  read -r answer
  if [[ "$answer" =~ ^[Yy] ]]; then
    log "Re-running with --apply-config..."
    exec "$0" --workspace "$WORKSPACE" --hooks "$HOOKS_DIR" --apply-config
  else
    log "Skipping config application. Run with --apply-config later."
  fi
  echo ""
fi

# --- Post-install verification ---
log "=== Post-Install Verification ==="
errors=0

# Check plugin files
if [ -f "$PLUGIN_DIR/openclaw.plugin.json" ] && [ -f "$PLUGIN_DIR/index.js" ]; then
  log "  Plugin files: OK"
else
  err "  Plugin files: MISSING"
  errors=$((errors + 1))
fi

# Check plugin in config
if [ -f "$OC_CONFIG" ] && command -v jq &>/dev/null; then
  if jq -e '.plugins.entries.jeraptha' "$OC_CONFIG" &>/dev/null; then
    log "  Plugin config: OK"
  else
    warn "  Plugin config: not in openclaw.json (openclaw plugins enable jeraptha)"
  fi
fi

# Check gateway log
LOG_FILE="/tmp/openclaw/openclaw-$(date +%Y-%m-%d).log"
if [ -f "$LOG_FILE" ] && grep -q '\[jeraptha\]' "$LOG_FILE" 2>/dev/null; then
  log "  Gateway log: registration found"
elif [ -f "$LOG_FILE" ]; then
  warn "  Gateway log: no [jeraptha] entries (restart gateway)"
else
  warn "  Gateway log: not found (gateway may not be running)"
fi

# Check workspace files
if [ -f "$WORKSPACE/AGENTS.md" ] && [ -f "$WORKSPACE/HEARTBEAT.md" ]; then
  log "  Workspace files: OK"
else
  warn "  Workspace files: some missing"
fi
echo ""
if [ "$errors" -gt 0 ]; then
  err "=== Install completed with $errors error(s) ==="
  exit 1
fi

log "=== Install Complete ==="
log "Next steps:"
log "  1. Customize .template files in $WORKSPACE/"
log "  2. Review docs: $WORKSPACE/docs/jeraptha/"
if ! $APPLY_CONFIG; then
  log "  3. Apply config: $0 --apply-config"
fi
log "  4. Restart gateway: openclaw gateway restart"
log "  5. Verify: $PLUGIN_DIR/post-update-verify.sh"

#!/usr/bin/env bash
# oc-bootstrap installer
# Installs hooks, templates, and docs into an OpenClaw workspace
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace}"
HOOKS_DIR="${OPENCLAW_HOOKS:-$HOME/.openclaw/hooks}"
EXTENSIONS_DIR="${OPENCLAW_EXTENSIONS:-$HOME/.openclaw/extensions}"
DRY_RUN=false

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --workspace) WORKSPACE="$2"; shift 2 ;;
    --hooks) HOOKS_DIR="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --help|-h)
      echo "Usage: $0 [--workspace <path>] [--hooks <path>] [--dry-run]"
      echo ""
      echo "Installs oc-bootstrap into an OpenClaw instance."
      echo ""
      echo "Options:"
      echo "  --workspace <path>  OpenClaw workspace dir (default: ~/.openclaw/workspace)"
      echo "  --hooks <path>      OpenClaw hooks dir (default: ~/.openclaw/hooks)"
      echo "  --dry-run           Show what would be done without doing it"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

log() { echo "[oc-bootstrap] $1"; }
dry() { if $DRY_RUN; then echo "[DRY RUN] $1"; else eval "$1"; fi; }

log "Installing oc-bootstrap"
log "  Workspace: $WORKSPACE"
log "  Hooks: $HOOKS_DIR"
echo ""

# --- Plugin (replaces managed hooks -- see decisions/004) ---
log "=== Installing PAI Hooks Plugin ==="
log "  NOTE: Managed hooks (HOOK.md + handler.ts) do NOT work for before_tool_call"
log "        or before_prompt_build events. They register in the wrong dispatch system."
log "        The plugin uses api.on() which registers correctly."
PLUGIN_DIR="$EXTENSIONS_DIR/pai-hooks"
dry "mkdir -p '$PLUGIN_DIR'"
dry "cp '$SCRIPT_DIR/plugin/openclaw.plugin.json' '$PLUGIN_DIR/'"
dry "cp '$SCRIPT_DIR/plugin/index.js' '$PLUGIN_DIR/'"
dry "cp '$SCRIPT_DIR/plugin/post-update-verify.sh' '$PLUGIN_DIR/'"
log "  ✅ Plugin installed to $PLUGIN_DIR"

# Enable the plugin
if ! $DRY_RUN; then
  openclaw plugins enable pai-hooks 2>/dev/null || true
  openclaw config set plugins.entries.pai-hooks.config.debug true 2>/dev/null || true
  log "  ✅ Plugin enabled"
fi

# Clean up dead managed hooks from previous installs
log "  Cleaning dead managed hooks (legacy -- now handled by plugin)..."
DEAD_HOOKS="law-reinforcement no-deaf-polls no-self-surgery ob-gate sentiment-tracker sop-gate task-context"
for hook in $DEAD_HOOKS; do
  if [ -d "$HOOKS_DIR/$hook" ]; then
    log "    Removing dead managed hook: $hook"
    dry "rm -rf '$HOOKS_DIR/$hook'"
  fi
done
echo ""

# --- Workspace files (universal, non-template) ---
log "=== Installing Universal Workspace Files ==="
for file in AGENTS.md HEARTBEAT.md; do
  src="$SCRIPT_DIR/workspace/$file"
  dest="$WORKSPACE/$file"
  if [ -f "$dest" ]; then
    log "  ⚠️  $file already exists -- skipping"
  else
    log "  ✅ Installing: $file"
    dry "cp '$src' '$dest'"
  fi
done
echo ""

# --- Workspace templates ---
log "=== Installing Templates ==="
log "  Templates are copied as .template files. Remove the suffix and customize."
for tmpl in "$SCRIPT_DIR"/workspace/*.template; do
  tmpl_name=$(basename "$tmpl")
  base_name="${tmpl_name%.template}"
  dest="$WORKSPACE/$tmpl_name"

  if [ -f "$WORKSPACE/$base_name" ]; then
    log "  ⚠️  $base_name already exists -- skipping template"
  elif [ -f "$dest" ]; then
    log "  ⚠️  $tmpl_name already exists -- skipping"
  else
    log "  ✅ Copying template: $tmpl_name"
    dry "cp '$tmpl' '$dest'"
  fi
done
echo ""

# --- Docs ---
log "=== Installing Documentation ==="
dry "mkdir -p '$WORKSPACE/docs/oc-bootstrap'"
for doc in "$SCRIPT_DIR"/docs/*.md; do
  doc_name=$(basename "$doc")
  dest="$WORKSPACE/docs/oc-bootstrap/$doc_name"
  if [ -f "$dest" ]; then
    log "  ⚠️  $doc_name already exists -- skipping"
  else
    log "  ✅ Installing doc: $doc_name"
    dry "cp '$doc' '$dest'"
  fi
done
echo ""

# --- Config reference ---
log "=== Installing Config Reference ==="
dry "mkdir -p '$WORKSPACE/docs/oc-bootstrap/config'"
for cfg in "$SCRIPT_DIR"/config/*.md; do
  cfg_name=$(basename "$cfg")
  dest="$WORKSPACE/docs/oc-bootstrap/config/$cfg_name"
  if [ -f "$dest" ]; then
    log "  ⚠️  $cfg_name already exists -- skipping"
  else
    log "  ✅ Installing config doc: $cfg_name"
    dry "cp '$cfg' '$dest'"
  fi
done
echo ""

log "=== Done ==="
log ""
log "Next steps:"
log "  1. Remove .template suffix from workspace files and customize them"
log "  2. Review docs in $WORKSPACE/docs/oc-bootstrap/"
log "  3. Apply config recommendations from config/defaults.md to openclaw.json"
log "  4. Restart gateway: openclaw gateway restart"
log "  5. Verify plugin: grep '[pai-hooks] registered' /tmp/openclaw/openclaw-\$(date +%Y-%m-%d).log"
log "  6. Run post-update verify: $PLUGIN_DIR/post-update-verify.sh"

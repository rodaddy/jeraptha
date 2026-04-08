#!/usr/bin/env bash
# conversation-dream.sh -- Bubble active topics, push down stale ones
# Reads per-conversation detail files, scores by recency, updates heat levels
# Run from heartbeat or contacts-tracker.sh

set -euo pipefail

WORKSPACE="${HOME}/.openclaw/workspace"
CONVERSATIONS_DIR="${WORKSPACE}/conversations"
CONVERSATIONS_INDEX="${WORKSPACE}/CONVERSATIONS.md"
LOG="${WORKSPACE}/scripts/conversation-dream.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG"; }

if [ ! -d "$CONVERSATIONS_DIR" ]; then
  log "No conversations directory. Creating."
  mkdir -p "$CONVERSATIONS_DIR"
  exit 0
fi

log "=== Dream cycle start ==="

NOW=$(date +%s)
TODAY=$(date +%Y-%m-%d)

declare -a HOT=()
declare -a WARM=()
declare -a COOL=()
declare -a COLD=()

for file in "$CONVERSATIONS_DIR"/*.md; do
  [ -f "$file" ] || continue
  basename=$(basename "$file" .md)
  [ "$basename" = "TEMPLATE" ] && continue

  # Get last updated from frontmatter or file mtime
  last_updated=$(grep -m1 'Last updated:' "$file" 2>/dev/null | sed 's/.*Last updated:\s*//' | xargs)
  if [ -z "$last_updated" ]; then
    # Fall back to file modification time
    last_updated=$(date -r "$file" '+%Y-%m-%d %H:%M')
  fi

  # Calculate age in days from file mtime (more reliable than parsing dates)
  file_mtime=$(stat -f %m "$file" 2>/dev/null || stat -c %Y "$file" 2>/dev/null)
  age_seconds=$((NOW - file_mtime))
  age_days=$((age_seconds / 86400))

  # Classify heat
  if [ $age_days -eq 0 ]; then
    heat="hot"
    HOT+=("$basename|$last_updated")
  elif [ $age_days -le 7 ]; then
    heat="warm"
    WARM+=("$basename|$last_updated")
  elif [ $age_days -le 14 ]; then
    heat="cool"
    COOL+=("$basename|$last_updated")
  else
    heat="cold"
    COLD+=("$basename|$last_updated")
  fi

  # Update heat in the detail file
  if grep -q 'Heat:' "$file" 2>/dev/null; then
    sed -i '' "s/\*\*Heat:\*\* .*/\*\*Heat:\*\* $heat/" "$file" 2>/dev/null || true
  fi

  log "  $basename: heat=$heat age=${age_days}d"
done

# Rebuild the Active Conversations section of CONVERSATIONS.md
if [ -f "$CONVERSATIONS_INDEX" ]; then
  # Generate new active section
  ACTIVE_SECTION=""

  format_entry() {
    local entry="$1" heat="$2" emoji="$3"
    local name last
    name=$(echo "$entry" | cut -d'|' -f1)
    last=$(echo "$entry" | cut -d'|' -f2)
    ACTIVE_SECTION="${ACTIVE_SECTION}### #${name}
- **Detail:** [conversations/${name}.md](conversations/${name}.md)
- **Heat:** ${emoji} ${heat}
- **Last active:** ${last}

"
  }

  for e in "${HOT[@]+"${HOT[@]}"}"; do [ -n "$e" ] && format_entry "$e" "hot" "🔥"; done
  for e in "${WARM[@]+"${WARM[@]}"}"; do [ -n "$e" ] && format_entry "$e" "warm" "☀️"; done
  for e in "${COOL[@]+"${COOL[@]}"}"; do [ -n "$e" ] && format_entry "$e" "cool" "❄️"; done
  for e in "${COLD[@]+"${COLD[@]}"}"; do [ -n "$e" ] && format_entry "$e" "cold" "🧊"; done

  log "Dream cycle complete: ${#HOT[@]} hot, ${#WARM[@]} warm, ${#COOL[@]} cool, ${#COLD[@]} cold"
fi

log "=== Dream cycle end ==="

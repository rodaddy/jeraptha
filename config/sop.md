# Jeraptha SOP -- Standard Operating Procedure for OpenClaw Changes

All changes to OC config, hooks, plugins, workspace files, or plist follow this procedure. No exceptions.

## Backup Location

All backups live in `~/.openclaw/backups/` on the target machine. One directory per change session, named by date and description:

```
~/.openclaw/backups/
  YYYY-MM-DD-<short-description>/
    <files that were backed up>
  index.md    # Master index of all backups
```

Legacy backup locations (pre-SOP) have been consolidated here. Do NOT create backups at `~/.openclaw/*.backup-*` or `~/.openclaw-backup-*` anymore.

## Change Procedure

### 1. Backup (BEFORE touching anything)

```bash
BACKUP_DIR=~/.openclaw/backups/$(date +%Y-%m-%d)-<description>
mkdir -p "$BACKUP_DIR"
cp <file-to-change> "$BACKUP_DIR/"
```

For config changes:
```bash
cp ~/.openclaw/openclaw.json "$BACKUP_DIR/"
```

For plugin changes:
```bash
cp -r ~/.openclaw/extensions/jeraptha/ "$BACKUP_DIR/jeraptha-plugin/"
```

For workspace file changes:
```bash
cp ~/.openclaw/workspace/<file>.md "$BACKUP_DIR/"
```

### 2. Update the backup index

Append to `~/.openclaw/backups/index.md`:

```markdown
## YYYY-MM-DD -- <short description>
- **Dir:** `YYYY-MM-DD-<description>/`
- **Files:** <list of backed up files>
- **Reason:** <why we're making this change>
- **Changed by:** <the operator / Claude Code / Skippy>
```

### 3. Make the change

Edit the file. For openclaw.json, always validate before bouncing:

```bash
openclaw doctor
```

If `openclaw doctor` is not available or doesn't catch schema issues, at minimum verify JSON is valid:

```bash
cat ~/.openclaw/openclaw.json | jq . > /dev/null
```

### 4. Update the changelog

Add an entry to the appropriate changelog:
- **Config changes:** `~/.openclaw/workspace/docs/config-changelog.md` (on the Air)
- **Plugin changes:** `/Volumes/ThunderBolt/Development/jeraptha/evolution/CHANGELOG.md`
- **Hook changes:** Both the Jeraptha CHANGELOG.md and the config-changelog.md

Use this format:
```markdown
## YYYY-MM-DD -- <short description>

### What was changed
- key: old_value -> new_value

### Why
What problem this solves.

### What went wrong (if applicable)
What broke, or what was bad before.

### Backups
- `~/.openclaw/backups/YYYY-MM-DD-<description>/`

### Lessons
Rules to prevent recurrence.
```

### 5. Verify

After bouncing the gateway:

```bash
# Bounce
ssh user@<AGENT_HOST_IP> "launchctl kickstart -k gui/\$(id -u)/ai.openclaw.gateway"

# Verify (wait ~10s for startup)
ssh user@<AGENT_HOST_IP> "openclaw gateway status"

# For plugin changes, check registration
ssh user@<AGENT_HOST_IP> "grep '\[jeraptha\]' ~/.openclaw/logs/gateway.log | tail -5"

# For hook changes, verify hook count
ssh user@<AGENT_HOST_IP> "openclaw hooks list 2>/dev/null | head -5"
```

### 6. Test

Send a test message through Discord/Telegram and verify the change works as expected. For hook changes, intentionally trigger the hook and confirm it fires.

## Rollback

If something breaks:

```bash
# Restore from backup
cp ~/.openclaw/backups/YYYY-MM-DD-<description>/openclaw.json ~/.openclaw/openclaw.json

# Bounce
launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway
```

Add a "REVERTED" entry to the changelog explaining what broke.

## What Lives Where

| Thing | Source of truth | Deployed to |
|-------|----------------|-------------|
| Jeraptha hooks + plugin | `/Volumes/ThunderBolt/Development/jeraptha/` | `~/.openclaw/extensions/jeraptha/` |
| OC config | `~/.openclaw/openclaw.json` on Air | N/A (lives on Air) |
| Workspace files | Jeraptha `workspace/` templates | `~/.openclaw/workspace/` on Air |
| Config changelog | `~/.openclaw/workspace/docs/config-changelog.md` on Air | N/A |
| Jeraptha changelog | `jeraptha/evolution/CHANGELOG.md` | N/A |
| Backups | `~/.openclaw/backups/` on Air | N/A |
| Plist | `~/Library/LaunchAgents/ai.openclaw.gateway.plist` on Air | N/A |

## Post-OC-Update Checklist

After ANY `openclaw` version update:

1. [ ] Verify `agents.defaults.contextTokens: 1000000`
2. [ ] Verify `agents.defaults.compaction.reserveTokens: 600000`
3. [ ] Verify heartbeat config intact (lightContext: false, suppress: false)
4. [ ] Verify `plugins.entries.jeraptha.enabled: true`
5. [ ] Verify `~/.openclaw/extensions/jeraptha/` exists
6. [ ] Re-apply plist patches (--force, OPENCLAW_NO_RESPAWN, ThrottleInterval, OPENCLAW_LOG_LEVEL)
7. [ ] Bounce and verify: `openclaw gateway status`
8. [ ] Run: `~/.openclaw/patches/post-update-verify.sh`

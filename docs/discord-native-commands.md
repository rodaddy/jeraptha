# Discord Native Slash Commands -- SOP

*How to get custom OpenClaw skills registered as native Discord slash commands with autocomplete.*

**Date:** 2026-04-07
**Status:** Working -- `/eco` and `/taskboard` live as native Discord commands

## The Problem

OpenClaw skills can be invoked as text triggers (just type the trigger phrase in chat), but Discord also supports native slash commands with autocomplete. Getting skills registered as native Discord commands requires several things to align.

## Root Cause (Multi-Layered)

Discord limits bots to **100 slash commands per guild**. This is a Discord API restriction, not OpenClaw's.

OpenClaw registers commands from two sources:
1. **Built-in commands** (~66) -- /new, /status, /compact, /model, etc.
2. **Skill commands** -- any skill where `user-invocable` is not explicitly `false`

The trap: **`user-invocable` defaults to `true` if not set in the SKILL.md frontmatter.** With 102 ready skills and no explicit setting, ALL of them tried to register. 102 skills + 66 built-in = 168 commands. Way over the 100 limit.

When over 100, OpenClaw drops ALL per-skill commands and falls back to a single `/skill` command. It logs:
```
discord: 146 commands exceeds limit; removing per-skill commands and keeping /skill.
```

## The Fix

### 1. openclaw.json -- Three Settings

```json
"commands": {
    "native": true,
    "nativeSkills": true,
    "useAccessGroups": false
}
```

| Setting | Before | After | Why |
|---------|--------|-------|-----|
| `nativeSkills` | `false` | `true` | Enables skill registration as native commands |
| `useAccessGroups` | `true` | `false` | Must be false for guild slash commands to register |
| `native` | `"auto"` | `true` | Explicit enable -- auto works but explicit is safer |

### 2. Skill Trimming -- Get Under 100

Every workspace SKILL.md that should NOT be a native Discord command needs `user-invocable: false` in the frontmatter:

```yaml
---
name: my-skill
description: Does stuff
triggers:
  - /my-skill
  - do stuff
user-invocable: false   # <-- ADD THIS to prevent Discord command registration
---
```

**Only skills you want as Discord autocomplete commands should have `user-invocable: true`.**

On the Skippy instance, only these are true:
- `eco` (3 triggers)
- `taskboard` (6 triggers)

All other 100+ skills are set to `false`. They still work as text triggers -- zero functionality lost.

### 3. Avoid Name Conflicts

OpenClaw has a built-in `/tasks` command (shows background tasks). Don't name a skill `tasks` -- it won't override the built-in. Use a different name (we used `taskboard`).

## How It Works Internally

### Code Path (OC 2026.4.5)

1. **Skill filtering** (`skills-BnlzYY40.js`):
   ```javascript
   .filter((entry) => entry.invocation?.userInvocable !== false)
   ```
   Skills without the field pass through (default true).

2. **Command counting** (`provider-DR2mO1YM.js:18167`):
   ```javascript
   const maxDiscordCommands = 100;
   ```
   If total exceeds 100, ALL skill commands are dropped.

3. **Deploy** (`provider-DR2mO1YM.js:17901`):
   Uses Discord's Carbon reconcile path via `client.handleDeployRequest()`, which calls `rest.put(Routes.applicationGuildCommands(...))`.

4. **Rate limit protection**: If Discord's daily command create limit (30034) is hit, deploy is skipped silently. Existing commands stay active.

### Telegram

Telegram has the same 100 limit. OC handles it differently -- registers the first 100, truncates descriptions to fit the 5700-char payload budget. Telegram is more graceful about this.

## Adding a New Native Command

1. Create the skill in `~/.openclaw/workspace/skills/<name>/SKILL.md`
2. Set `user-invocable: true` in the frontmatter
3. Keep triggers minimal (each trigger does NOT count as a separate command -- only the skill name matters)
4. Check your total: currently 69/100 commands, so ~31 slots available for new native commands
5. Bounce the gateway: `launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway`
6. Discord updates guild commands immediately (no propagation delay for guild commands)

## Troubleshooting

### Commands don't appear in Discord autocomplete
1. Check the log for "exceeds limit": `grep 'exceeds limit' /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log`
2. If over 100, find skills missing `user-invocable: false` and add it
3. Verify config: `openclaw config get commands` -- all three settings must be correct
4. Bounce gateway and wait ~15 seconds
5. Discord client may need restart (Ctrl+R on desktop) to refresh command cache

### Check registered command count
Query Discord API directly:
```bash
curl -s -H "Authorization: Bot $BOT_TOKEN" \
  "https://discord.com/api/v10/applications/$APP_ID/guilds/$GUILD_ID/commands" \
  | python3 -c "import sys,json; print(len(json.load(sys.stdin)))"
```

### Bulk-set all skills to non-invocable
```python
import os, glob
skills_dir = os.path.expanduser('~/.openclaw/workspace/skills')
for skill_md in glob.glob(f'{skills_dir}/**/SKILL.md', recursive=True):
    with open(skill_md, 'r') as f:
        content = f.read()
    if 'user-invocable' in content:
        continue
    parts = content.split('---')
    if len(parts) >= 3:
        parts[1] = parts[1].rstrip() + '\nuser-invocable: false\n'
        with open(skill_md, 'w') as f:
            f.write('---'.join(parts))
```

**Always back up first:** `tar czf skills-backup-$(date +%s).tar.gz -C ~/.openclaw/workspace skills`

## Backups (2026-04-07 Session)

| Backup | Location | Contents |
|--------|----------|----------|
| `openclaw.json.backup-1775608303` | `~/.openclaw/` | Pre-nativeSkills config |
| `skills-backup-1775609164.tar.gz` | `~/.openclaw/workspace/` | Full skills dir before bulk edit |
| `atlassian.backup-*.tar.gz` | `~/.openclaw/workspace/skills/` | Deleted atlassian skill |
| Individual `.backup-*` files | Per-skill dirs | Per-skill backups before changes |

## Rules for Skippy

- Do NOT modify `commands.native`, `commands.nativeSkills`, or `commands.useAccessGroups`
- Do NOT add `user-invocable: true` to skills without Rico's approval
- Do NOT touch openclaw.json (carapace lock)
- If a new native command is needed, ask Rico -- Claude Code handles the config

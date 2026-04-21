# Agent Index -- Task Domain → Skill Routing

Subagents cannot invoke slash commands. When spawning agents, give them the relevant
SKILL.md path to read directly. Paste reference data from agent-reference.md into prompts.

## Domain → Skill Map

| Domain | Skill File | Key Tools | When |
|--------|-----------|-----------|------|
| Knowledge Base | skills/brain/SKILL.md | mcp2cli open-brain search_all | Any factual lookup, session save, knowledge write |
| Deployment | skills/deploy/SKILL.md | scp, gateway restart | Deploying code to Air or other hosts |
| Git / PRs | skills/git/SKILL.md | git, gh | Commits, PRs, branch management |
| Infrastructure | skills/infra/SKILL.md | proxmox, containers, network | VM/container management, network config |
| Credentials | skills/vault/SKILL.md | mcp2cli vaultwarden-secrets | API keys, passwords, tokens |
| Session Mgmt | skills/session/SKILL.md | checkpoint, session-wrap | Session start/end, state persistence |
| Content | skills/research/SKILL.md | fabric, browser, brightdata | Research, web scraping, content processing |
| n8n Workflows | skills/n8n/SKILL.md | mcp2cli n8n | Workflow creation, credential setup |
| Home Automation | skills/homeassistant/SKILL.md | mcp2cli homekit | HA entities, HomeKit, automations |

## Agent Prompt Template

When spawning an agent for domain X:
1. Look up the skill file from the table above
2. Include `Read <skill-file>` in the agent prompt
3. Paste relevant section from `.planning/agent-reference.md`
4. NEVER tell agents to read .env files (secrets stay in vaultwarden)

## Rules

- Orchestrators paste reference data INTO prompts -- agents don't go hunting for it
- If no skill exists for the domain, flag it -- don't improvise
- Agents that need multiple domains get multiple skill reads

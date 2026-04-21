# Available Skills -- Check Before Manual Work

Read the SKILL.md in each skill directory for full instructions. Use `skills/<name>/SKILL.md`.

## Core Operations
| Skill | Command | Use When |
|-------|---------|----------|
| brain | /brain | ANY Open Brain interaction -- search, log, save. NEVER call mcp2cli open-brain directly |
| mcp2cli | /mcp2cli | MCP tool bridge -- invoking any MCP tool via CLI |
| Git | | Commits, PRs, branch management, diff analysis |
| Debug | | Troubleshooting, error investigation, systematic debugging |
| vaultwarden | | Credentials, API keys, passwords, tokens |

## Task & Session Management
| Skill | Command | Use When |
|-------|---------|----------|
| eco | /eco | Show behavioral scorecard |
| taskboard | /taskboard | Show task board from TASKS.md |
| conversations | /conversations | Show conversation tracker |
| report | /report | Enforcement report from gateway logs |
| checkpoint | /checkpoint | Save state before compaction |
| session-start | /session-start | Resume after /clear |
| session-handoff | /session-handoff | Generate next-session first message |
| capture-session | /capture-session | Extract session insights to OB |
| add-todo | | Add a todo or idea |
| check-todos | | Review pending todos |
| update-todo | | Update todo status |

## Content & Research
| Skill | Command | Use When |
|-------|---------|----------|
| fabric | | Process content through AI patterns (YouTube, URLs, text) |
| browser | | Web automation, reading articles, form filling |
| research | | Multi-source research with parallel agents |
| brightdata | | URL scraping with fallback tiers |
| review-swarm | /review-swarm | Multi-perspective code review |
| autoresearch | /autoresearch | Self-improving optimization loops |

## Infrastructure
| Skill | Command | Use When |
|-------|---------|----------|
| deploy-service | | Deploy new LXC service with proxy + DNS |
| remove-service | | Tear down a deployed service |
| proxmox | | Manage VMs and containers |
| homeassistant | /homeassistant | HA config, HomeKit, entities |
| litellm | /litellm | LiteLLM proxy models and endpoints |
| infra-status | | Query infrastructure state |
| infra-docs | /infra-docs | Update service docs when configs change |
| apple | /apple | Apple services -- Mail, Calendar, Notes, Contacts, Messages |

## Behavioral
| Skill | Command | Use When |
|-------|---------|----------|
| core | | Personas, LAWs, project templates |
| persona-switcher | | Switch between Skippy/Bob/Clarisa/April |
| explain-before-doing | | Enforce explain-then-act pattern |
| correct | | Add corrections when mistakes repeat |
| skill-qa | /skill-qa | Test if hooks and skills are working |
| ISC | | Define success criteria for complex tasks |
| prompting | | Prompt engineering best practices |

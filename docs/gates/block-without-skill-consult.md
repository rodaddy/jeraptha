# Gate: block-without-skill-consult

**Priority:** 68
**File:** `plugin/gates/block-without-skill-consult.js`
**Factory:** `createBlockWithoutSkillConsult(state, config, log)`

## What

Blocks high-risk operations (deployment, infrastructure management, code swarms, workflow automation) unless the agent has consulted the relevant skill documentation first.

## Why

Skills contain workflow knowledge, checklists, and guardrails for complex operations. Agents that skip skill consultation tend to improvise deployment sequences, miss infrastructure requirements, or use outdated patterns. This gate forces the agent to read SKILL-INDEX.md and the relevant skill before executing.

## How

The gate only fires on `exec` and `bash` tool calls.

1. **Early exits:** Skip if heartbeat session, compliance exec, within grace period, or skill already consulted this turn.
2. **Match against SKILL_OPS:** Check the command against the `SKILL_OPS` pattern list (deploy/rsync/scp, docker/container/lxc/pct, swarm, n8n/workflow). If a match is found and no skill was consulted, block.

The grace period (default 5 turns) allows the session to bootstrap without blocking.

## Config

| Key | Default | Purpose |
|---|---|---|
| `gracePeriodTurns` | 5 | Number of initial turns where the gate does not fire |

## State Dependencies

| State Field | Read/Write | Purpose |
|---|---|---|
| `skillConsultedThisTurn` | Read | Whether skill docs were read this turn |
| `currentTurn` | Read | Current turn number for grace period check |

## Block Message

> SKILL GATE: About to do {taskType} work without consulting skills. Read SKILL-INDEX.md, then the relevant SKILL.md. Skills have workflow knowledge you'll miss.

Where `{taskType}` is one of: `deploy`, `infrastructure`, `code-swarm`, `n8n`.

## Examples

**Blocked:** Agent runs `deploy-service my-app` on turn 10 without reading skill docs.

**Blocked:** Agent runs `docker compose up -d` without consulting infrastructure skill.

**Allowed:** Agent reads SKILL-INDEX.md (sets `skillConsultedThisTurn`), then deploys.

**Allowed:** Agent runs `deploy-service my-app` on turn 3 -- within grace period.

**Allowed:** Agent runs `cat src/index.ts` -- not a SKILL_OPS match.

**Allowed:** Agent runs `mcp2cli deploy-tool status` -- compliance exec.

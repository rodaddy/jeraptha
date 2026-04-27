---
name: a2a-client
description: Talk to any A2A agent on the network. Discover capabilities via Agent Cards, delegate tasks, stream results. The universal client for Skippy to reach Bilby, MonkeyProof, and any future A2A peer.
metadata:
  version: 0.1.0
  author: Rico
  category: infrastructure
triggers:
  - a2a
  - delegate to
  - ask agent
  - send to bilby
  - send to monkeyproof
  - run on remote
  - spawn remote session
  - remote claude
---

# A2A Client -- Universal Agent Communication

Talk to any A2A-speaking agent on the network. Skippy uses this to delegate
tasks to peers instead of using file drops, SSH, or custom REST calls.

## Known Agents

| Agent | Endpoint | What It Does |
|-------|----------|-------------|
| **Bilby** | `http://10.71.20.71:41271` | Infrastructure monitoring (health, services, logs, network, debug) |
| **MonkeyProof** | `http://10.71.1.120:3210` | Remote Claude Code sessions (print + interactive) |

## How to Call (curl)

Every A2A call needs:
- `Content-Type: application/json`
- `A2A-Version: 1.0` header
- JSON-RPC 2.0 body with `SendMessage` method

```bash
curl -s -X POST http://<agent-url>/ \
  -H "Content-Type: application/json" \
  -H "A2A-Version: 1.0" \
  -d '{
    "jsonrpc": "2.0",
    "id": "req-001",
    "method": "SendMessage",
    "params": {
      "message": {
        "role": 1,
        "parts": [{"text": "<your query>"}],
        "message_id": "msg-001"
      }
    }
  }'
```

## Response Structure

```
.result.task.status.state    -> "TASK_STATE_COMPLETED" / "TASK_STATE_FAILED"
.result.task.artifacts[0].parts[0].text  -> the actual result
```

## Discover an Agent

Fetch its Agent Card to see what it can do:

```bash
curl -s http://<agent-url>/.well-known/agent-card.json | jq '{name, skills: [.skills[].id]}'
```

## Agent-Specific Metadata

### Bilby
No special metadata needed. Just send natural language queries.

### MonkeyProof
Pass metadata to control session behavior:

```json
{
  "message": {
    "role": 1,
    "parts": [{"text": "Fix the auth bug"}],
    "message_id": "msg-001",
    "metadata": {
      "mode": "interactive",
      "preset": "claude-interactive-opus",
      "cwd": "/home/skippy/Development/king/king-dashboard",
      "max_turns": 50
    }
  }
}
```

**mode:** `"print"` (default, one-shot) or `"interactive"` (tmux, multi-turn)
**preset:** `claude`, `claude-sonnet`, `claude-opus`, `claude-interactive`, `claude-interactive-opus`, `codex`, `codex-auto`
**cwd:** Working directory on CT 120
**max_turns:** Max tool-use turns for Claude

## Adding New Agents

When a new A2A server is deployed:
1. Add its endpoint to the Known Agents table above
2. Verify: `curl -s http://<url>/.well-known/agent-card.json | jq .name`
3. Test: send a `SendMessage` with a simple query
4. The agent is now reachable from Skippy using the same pattern

## Architecture

```
Skippy (Air/OC)
    |
  A2A JSON-RPC over HTTP
    |
  ┌─────────────────────────────────────┐
  |                                     |
Bilby (CT 271:41271)     MonkeyProof (CT 120:3210)
  |                         |
SSH/local commands     MonkeyProof REST (:3200)
  |                         |
Proxmox cluster        Claude Code sessions
```

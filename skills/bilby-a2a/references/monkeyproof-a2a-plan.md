# MonkeyProof A2A Facade -- Implementation Plan

Status: PLANNED (not yet built)

## What

Python sidecar on CT 120 (port 3210) that wraps MonkeyProof's REST+WS API
with an A2A-compliant JSON-RPC+SSE interface. MonkeyProof stays untouched.

## Architecture

```
A2A Client --> A2A Sidecar (:3210) --REST--> MonkeyProof (:3200)
           <--SSE--                  <--WS---
```

## Session-to-Task Mapping

| MonkeyProof | A2A |
|-------------|-----|
| POST /sessions (spawn) | SendMessage -> SUBMITTED |
| Session running | WORKING + SSE artifact chunks |
| POST /sessions/:id/input | Follow-up message resolves INPUT_REQUIRED |
| Session exits (code 0) | COMPLETED |
| Session exits (code != 0) | FAILED |
| DELETE /sessions/:id | CancelTask |

## Agent Card Skills

- `run-claude-print` -- one-shot Claude Code sessions
- `run-claude-interactive` -- multi-turn tmux sessions with stdin
- `run-codex` -- OpenAI Codex sessions

## Key Design Decisions

1. **Sidecar not native** -- MonkeyProof is Bun/Hono, A2A SDK is Python. Separate failure domains.
2. **Idle timeout for INPUT_REQUIRED** -- 30s of no stdout -> transition to INPUT_REQUIRED
3. **WebSocket-to-SSE bridge** -- WS stdout chunks become TaskArtifactUpdateEvent via TaskUpdater
4. **Task-session mapping** -- in-memory dict maps A2A task_id to MonkeyProof session_id

## Prerequisites

- bilby-a2a deployed and tested (DONE)
- uv + Python 3.13 on CT 120
- MonkeyProof running on :3200

## Repo

Will be at: github.com/rodaddy/monkeyproof-a2a

# A2A Protocol Quick Reference

## What A2A Is

Agent-to-Agent protocol by Google. JSON-RPC 2.0 over HTTP. The "HTTP for agents."
Linux Foundation governed, 150+ org backing, v1.0 as of early 2026.

## A2A vs MCP

- **MCP** = agent-to-tool (vertical, hierarchical). "Call this API."
- **A2A** = agent-to-agent (horizontal, peer-to-peer). "Analyze this and report back."
- They're complementary, not competing. Most production systems use both.

## Core Concepts

### Agent Card
JSON at `/.well-known/agent-card.json`. Describes capabilities, skills, auth, endpoint.
Clients fetch it before engaging. Like a business card for agents.

### Task Lifecycle
```
SUBMITTED -> WORKING -> COMPLETED
                    -> FAILED
                    -> CANCELED
                    -> INPUT_REQUIRED (needs more info, then back to WORKING)
                    -> AUTH_REQUIRED
                    -> REJECTED (agent declines)
```

### Messages
- `role`: ROLE_USER (1) or ROLE_AGENT (2)
- `parts`: array of {text, raw, url, data}
- `message_id`: unique per message
- Linked by `contextId` for conversation threads

### Artifacts
Results of completed work. Streamed incrementally via TaskArtifactUpdateEvent.
Fields: artifactId, parts, append (chunked), lastChunk (signals done).

## JSON-RPC Methods (v1.0)

| Method | Purpose |
|--------|---------|
| `SendMessage` | Send message, create/update task |
| `SendStreamingMessage` | Same but returns SSE stream |
| `GetTask` | Get task state and artifacts |
| `ListTasks` | Query tasks |
| `CancelTask` | Cancel a task |
| `SubscribeToTask` | SSE stream for existing task |

## Required Header

Every request MUST include: `A2A-Version: 1.0`
Without it, SDK defaults to v0.3 and rejects.

## Python SDK

```python
# Server
from a2a.server.agent_execution import AgentExecutor
from a2a.server.tasks import TaskUpdater, InMemoryTaskStore
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import create_jsonrpc_routes, create_agent_card_routes
from a2a.types import Part, Task, TaskState, TaskStatus, Message, Role

# Client
from a2a.client import A2ACardResolver, create_client
```

## Gotchas

- `protobuf>=5.28,<6` required -- v7 has a FieldDescriptor.label bug with the SDK
- Must enqueue a `Task` object event before any `TaskStatusUpdateEvent`
- `sse-starlette` is an unlisted dependency -- add it manually
- Agent Card has no `url` field -- use `supported_interfaces` with `AgentInterface`

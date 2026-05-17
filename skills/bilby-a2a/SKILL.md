---
name: bilby-a2a
description: Talk to Bilby (PAI Agent #2) via A2A protocol. Infrastructure health checks, service monitoring, log analysis, network diagnostics, and remote debugging across the homelab cluster. Bilby runs on CT 271.
metadata:
  version: 0.1.0
  author: <your-name>
  source: https://github.com/<your-username>/bilby-a2a
  category: infrastructure
triggers:
  - ask bilby
  - bilby check
  - bilby health
  - bilby status
  - check infrastructure
  - is CT running
  - check containers
  - service status
  - failed services
  - check disk on
  - check memory on
  - ping from bilby
  - bilby debug
  - bilby logs
---

# Bilby A2A -- Infrastructure Monitor Agent

Talk to Bilby via the A2A (Agent-to-Agent) protocol. Bilby is PAI Agent #2
running on CT 271 (<BILBY_HOST>), specialized in infrastructure monitoring.

## Endpoint

- **Agent Card:** `http://<BILBY_HOST>:41271/.well-known/agent-card.json`
- **JSON-RPC:** `http://<BILBY_HOST>:41271/`
- **Protocol:** A2A v1.0 (JSON-RPC 2.0 over HTTP)

## Skills Available

| Skill | What It Does |
|-------|-------------|
| `infra_health_check` | Proxmox VM/CT status across all 4 cluster nodes |
| `service_monitor` | systemd service checks (local or remote via SSH) |
| `log_analysis` | journalctl queries filtered by service/severity/time |
| `network_diagnostics` | ping, traceroute, port checks, DNS, curl |
| `mutual_debug` | SSH into other CTs -- disk, memory, processes, configs |

## How to Call

### Via curl (direct A2A JSON-RPC)

```bash
curl -s -X POST http://<BILBY_HOST>:41271/ \
  -H "Content-Type: application/json" \
  -H "A2A-Version: 1.0" \
  -d '{
    "jsonrpc": "2.0",
    "id": "req-001",
    "method": "SendMessage",
    "params": {
      "message": {
        "role": 1,
        "parts": [{"text": "check all containers on proxmox01"}],
        "message_id": "msg-001"
      }
    }
  }'
```

### Via mcp2cli (preferred for Skippy)

```bash
mcp2cli bilby ask_bilby --params '{"query": "check disk space on CT 202"}'
```

## A2A Protocol Notes

- **Version header required:** `A2A-Version: 1.0` on every request
- **Role values:** `1` = user (sender), `2` = agent (responder)
- **Task lifecycle:** SUBMITTED -> WORKING -> COMPLETED/FAILED
- **Response location:** `.result.task.artifacts[0].parts[0].text`
- **Message ID:** Must be unique per message (UUID recommended)

## Example Queries

- "check all containers on proxmox01"
- "is CT 202 running?"
- "show failed services on proxmox02"
- "check disk space on CT 205"
- "ping <LITELLM_HOST>"
- "check if port 4000 is open on litellm"
- "show errors from caddy in the last hour"
- "what's using memory on proxmox01?"

## Architecture

```
Skippy (Air/OC)
    |
  mcp2cli bilby
    |
  A2A JSON-RPC (HTTP)
    |
Bilby A2A Server (CT 271:41271)
    |
  SSH / local commands
    |
Proxmox nodes, other CTs, local system
```

## Troubleshooting

- **Connection refused:** `ssh root@<BILBY_HOST> "systemctl status bilby-a2a"`
- **Version error:** Missing `A2A-Version: 1.0` header
- **Task enqueue error:** SDK bug -- restart the service
- **Slow response:** SSH timeout to a Proxmox node (default 30s)

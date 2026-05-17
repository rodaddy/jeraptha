# BlueBubbles iMessage Bridge Research

Research date: 2026-03-17

## Summary

BlueBubbles is the only viable self-hosted iMessage bridge. Requires a Mac (physical or VM) running the server. OpenClaw has **native BlueBubbles channel support** built in -- setup is essentially a config change.

## Key Facts

- Server: TypeScript, open-source, actively maintained (Jan 2026 latest)
- **Always needs a Mac** -- reads from native `chat.db` SQLite database
- REST API (`/api/v1/...`) + webhooks (push model), no WebSocket
- Auth: query parameter `password=<server-password>` on every request
- Headless mode supported (built-in toggle, CLI args for automation)
- Supports: typing indicators, read receipts, tapbacks, editing/unsending, reply threading, attachments

## API Endpoints

- `POST /api/v1/message/text` -- send message (chatGuid, text, method)
- `GET /api/v1/chat` -- list chats
- `GET /api/v1/message` -- query messages
- `GET /api/v1/ping` -- health check
- Postman collection: https://documenter.getpostman.com/view/765844/UV5RnfwM

## OpenClaw Integration

Already built in: `channels.bluebubbles` config in openclaw.json:
- `serverUrl`, `password`, `webhookPath`
- DM policy options: pairing, allowlist, open, disabled
- `openclaw onboard` wizard handles setup

## Architecture for King-NG (2-3 LXC instances)

**Recommended: Option A -- Single relay, multiple consumers**

```
                    ┌─────────────────────┐
                    │  Mac mini (headless) │
                    │  BlueBubbles Server  │
                    │  Tailscale mesh      │
                    │  Port 1234           │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
        ┌─────┴─────┐   ┌─────┴─────┐   ┌─────┴─────┐
        │ User PA    │   │ Collab PA │   │ Strategy  │
        │ CT 310     │   │ CT 311    │   │ CT 312    │
        │ OpenClaw   │   │ OpenClaw  │   │ OpenClaw  │
        └────────────┘   └───────────┘   └───────────┘
```

- One Mac mini (~$100 used eBay) runs BlueBubbles + Tailscale
- All OpenClaw LXC instances connect via Tailscale IP
- One instance registers as webhook receiver, others poll REST API
- All share one iMessage identity (one Apple ID)

**Limitation:** Can't run in LXC -- needs KVM for macOS VM (use Proxmox VM or physical Mac)

## Alternatives

| Solution | Mac Required? | Self-Hosted? | Status |
|----------|--------------|--------------|--------|
| BlueBubbles | Yes | Yes | Active, best API |
| AirMessage | Yes | Yes | Active, weaker API |
| Beeper | No (cloud) | No | Fragile, Apple blocks |
| Beeper Mini | No | No | Dead |

## Hardware Notes

- Mac mini 2012+ works ($100-150 eBay), can patch to run Ventura
- HDMI dummy plug recommended for headless initial setup
- Enable "Start after power failure" in System Preferences
- BlueBubbles has "Keep macOS Awake" built-in toggle
- Could run on the MacBook Air itself but requires always-on

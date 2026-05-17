# Brain Namespace Guide

## Host Detection

| Hostname Pattern | Type | Default Namespace | Example |
|-----------------|------|-------------------|---------|
| `cc-*` | LXC container | `collab` | cc-king, cc-collaborator, cc-collab |
| `*.local` | Personal machine | `<caller_identity>` | Mini-M4-Pro.local, <your-hostname>.local |
| Other | Unknown | `<caller_identity>` | |

## Known Hosts

| Hostname | Owner | Location |
|----------|-------|----------|
| `Mini-M4-Pro.local` | User | Local Mac Mini |
| `<your-hostname>.local` | User/Agent | MacBook Air |
| `cc-project` | Collaborator | LXC <YOUR_IP> |

## Directory-Based Override (Personal Machines Only)

On `*.local` hosts, the working directory overrides the default:

| Directory Pattern | Namespace | Why |
|-------------------|-----------|-----|
| `*/king*` or `*/King*` | `collab` | King Capital work is shared |
| Everything else | `<caller_identity>` | Personal by default |

LXC boxes do NOT use directory detection -- they default to `collab` regardless of cwd.

## Intent Keywords

These phrases override all host/directory detection:

### Personal Override
- "my brain", "my ob"
- "personal", "private"
- "save to my ..."
- "this is personal"
- "keep this private"

Result: `namespace = <caller_identity>`

### Collab Override
- "collab", "shared", "team"
- "king", "push to collab"
- "this is for the team"

Result: `namespace = "collab"`

## Resolution Order

1. **Explicit intent** -- user says "personal" or "collab" -> use that
2. **Host type** -- `cc-*` -> collab default; `*.local` -> identity default
3. **Directory** -- only on personal machines; `king*` -> collab
4. **Fallback** -- `<caller_identity>`

## Examples

### User on local Mac, in ~/Development/king-trading
```
Host: Mini-M4-Pro.local (personal machine)
CWD: king-trading (matches king*)
-> namespace: "collab"
```

### User on local Mac, in ~/Development/tax-strategy
```
Host: Mini-M4-Pro.local (personal machine)
CWD: tax-strategy (no king match)
-> namespace: "<user_identity>"
```

### User on local Mac, in ~/Development/tax-strategy, says "push this to collab"
```
Host: Mini-M4-Pro.local (personal machine)
CWD: tax-strategy (no king match)
Intent: "collab" override
-> namespace: "collab" (intent wins)
```

### a collaborator on cc-collaborator LXC, working on anything
```
Host: cc-collaborator (LXC)
-> namespace: "collab"
```

### a collaborator on cc-collaborator LXC, says "save this to my brain"
```
Host: cc-collaborator (LXC)
Intent: "my brain" -> personal override
-> namespace: "collaborator" (intent wins)
```

### Skippy on <your-hostname>.local, in ~/Development/open-brain
```
Host: <your-hostname>.local (personal machine)
CWD: open-brain (no king match)
Caller: skippy
-> namespace: "skippy"
```

### Skippy on <your-hostname>.local, says "this is for the team"
```
Host: <your-hostname>.local (personal machine)
Intent: "team" -> collab override
-> namespace: "collab" (intent wins)
```

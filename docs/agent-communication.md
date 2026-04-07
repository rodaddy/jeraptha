# Agent Communication Protocol

## The Core Problem

AI agents go silent. They start a task, block on a tool call, spawn a sub-agent, or just get distracted -- and the user sees nothing for 5, 10, 20 minutes. This destroys trust.

## The Rules

### Never go dark for > 60 seconds during active work
If the user looks at the chat and sees no message from the agent in the last 60 seconds during active work, something is wrong.

### Use tmux, not blocking polls
```bash
# RIGHT: Fire and forget, stay available
tmux new-session -d -s agent-name 'claude --print "task here"'
# Check progress between messages
tmux capture-pane -t agent-name -p | tail -20

# WRONG: Blocks the agent's turn entirely
process poll --timeout 300000  # Agent is deaf for 5 minutes
```

### Announce every step
- Before starting: "Starting Step X -- [what and why]"
- After completing: "Done with Step X -- [what happened]"
- During waits: "Still waiting on [thing]..."
- On failure: "FAILED: [what broke]" -- immediately, not after trying to fix silently

### Multi-step work flow
1. State the plan (bullet points)
2. Wait for user go-ahead
3. Do step 1, report
4. Ask before step 2
5. Repeat

### Sub-agent communication
- Before spawning: "Spinning up a [model] worker to [task]..."
- After spawning (tmux): "Agent is running in tmux. I'll check every 2-3 min."
- Progress checks: Brief 1-2 line update every 2-3 minutes
- Completion: Report results immediately
- NEVER chain spawn → wait → PR without checkpoints

## The Anti-Pattern

```
User: "Do the thing"
Agent: [spawns agent, blocks on poll for 15 min, creates PR]
User: [sees nothing for 20 min, gets angry]
```

## The Correct Pattern

```
User: "Do the thing"
Agent: "Plan: 1) create branch 2) spawn agent 3) verify 4) PR. Go?"
User: "Go"
Agent: "Spawning agent in tmux now. I'll check in 2-3 min."
Agent: [2 min later] "Agent is 40% through, working on file X"
Agent: [2 min later] "Agent finished. 5 files changed. Want me to PR?"
User: "Yeah"
Agent: "PR #42 created. Here's the summary..."
```

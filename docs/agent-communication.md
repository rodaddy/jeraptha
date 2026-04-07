# Antenna Discipline -- Agent Communication Protocol

*Jeraptha antennae are "wildly articulate and expressive, conveying a wide range of body language and nonverbal communication." Your agent's comms should be the same.*

## The Core Problem

AI agents go silent. They start a task, block on a tool call, spawn a sub-agent, or just get distracted -- and the user sees nothing for 5, 10, 20 minutes.

In Jeraptha terms: antenna failure. Comms dark. Crew abandons ship.

## Standing Orders

### Keep antennae up -- never go dark for > 60 seconds
If the user looks at the chat and sees no message in the last 60 seconds during active work, the agent has failed antenna discipline.

### Use tmux, not blocking polls
```bash
# RIGHT: Fire and forget, antennae stay up
tmux new-session -d -s agent-name 'claude --print "task here"'
# Check progress between messages
tmux capture-pane -t agent-name -p | tail -20

# WRONG: Antenna failure -- agent is deaf
process poll --timeout 300000  # 5 minutes of silence
```

The `no-deaf-polls` ECO hook enforces this. Polls > 10s get blocked.

### Signal every action
- Before starting: "Starting [what] -- [why]"
- After completing: "Done -- [what happened]"
- During waits: "Still waiting on [thing]..."
- On failure: "[what broke]" -- immediately

### Multi-step operations -- get clearance first
1. State the plan (bullet points)
2. Wait for go-ahead
3. Execute step 1, report
4. Ask before step 2
5. Repeat

### Sub-agent comms protocol
- Before spawning: "Spinning up a worker for [task]..."
- After spawning (tmux): "Agent running. Checking every 2-3 min."
- Progress: Brief 1-2 line update every 2-3 minutes
- Completion: Report immediately
- NEVER chain operations without checkpoints

## The Anti-Pattern (Antenna Failure)

```
User: "Do the thing"
Agent: [spawns agent, blocks on poll for 15 min, creates PR]
User: [sees nothing for 20 min]
User: "wtf where are you"
```

*Civilian crew would generally abandon a Jeraptha ship whose captain was unable to pay their wages. Users will abandon an agent that doesn't communicate.*

## The Correct Pattern

```
User: "Do the thing"
Agent: "Plan: 1) branch 2) spawn agent 3) verify 4) PR. Go?"
User: "Go"
Agent: "Agent running in tmux. Checking in 2-3 min."
Agent: [2 min later] "Agent 40% through, working on file X"
Agent: [2 min later] "Agent done. 5 files changed. PR?"
User: "Yeah"
Agent: "PR #42 created. Summary: ..."
```

*Antennae up. Comms clear. The Jeraptha way.*

# block-praise-without-review

**Hook type:** `before_tool_call`
**Priority:** 52
**Event:** message sends in PR/review context
**Fail mode:** Fail-closed (blocks praise without review)

## Why It Exists

The anti-sycophancy gate. When someone shares a PR, code, or data for review, agents reflexively respond with praise: "Looks great! Nice work!" -- without actually reviewing anything. This is the AI equivalent of rubber-stamping.

The pattern:
1. User shares a PR link or asks for a code review
2. Agent immediately says "Looks solid! Clean code!" (having read zero lines)
3. User assumes the review happened
4. Bugs ship

This gate enforces that praise in a review context must come with a commitment to actually do the review, and that the review must actually happen before sending more messages.

## How It Works

### Phase 1: Context Detection

When a user message matches PR/review patterns (PR links, "code review", "check my changes", etc.), the gate sets `state.prReviewContext = true`. Outside PR context, this gate is completely inert.

### Phase 2: First Response Enforcement

On the first message in a PR context:
- **Praise + commitment** ("Looks solid, let me dig into the code") -- allowed, sets `reviewPromisedThisTurn`
- **Praise without commitment** ("Looks great! Ship it!") -- blocked
- **Non-praise** (clarifying questions, technical discussion) -- allowed

### Phase 3: Follow-Through Enforcement

Once a review commitment has been made (`reviewPromisedThisTurn = true`):
- If `reviewAgentSpawned = true` -- messages are allowed (the agent did the work)
- If `reviewAgentSpawned = false` -- hard block ("No more talking until you've done the work")

## State

- `state.prReviewContext` -- set when PR/review context detected, reset per turn
- `state.reviewPromisedThisTurn` -- set when agent sends praise + commitment, reset per turn
- `state.reviewAgentSpawned` -- set externally (by state-tracker) when a review agent is spawned, reset per turn

## Dependencies

- `PR_CONTEXT_PATTERNS`, `PRAISE_WITHOUT_REVIEW`, `REVIEW_COMMITMENT` from `shared/constants.js`
- `getToolName`, `getMessageText` from `shared/helpers.js`

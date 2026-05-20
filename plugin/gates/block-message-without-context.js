import { isHeartbeatSession, getToolName } from "../shared/helpers.js";

export function createBlockMessageWithoutContext(state, config, log) {
  const gracePeriod = config.gracePeriodTurns || 5;
  const commThreshold = config.commGateThreshold || 8;
  return async (event, ctx) => {
    if (isHeartbeatSession(ctx)) return {};
    const tn = getToolName(event);
    if (tn !== "message" || state.currentTurn <= gracePeriod) return {};
    // If the agent has been doing heavy tool work (past commGateThreshold), defer to
    // the communication gate (block-silent-work-streak) instead of blocking here.
    // This prevents double-blocking on the same condition.
    if (state.toolCallsSinceMessage > commThreshold) return {};
    if (
      state.tasksReadThisSession &&
      state.conversationsReadThisSession &&
      state.obContextLoadedThisSession
    )
      return {};
    const missing = [
      !state.tasksReadThisSession && "TASKS.md",
      !state.conversationsReadThisSession && "CONVERSATIONS.md",
      !state.obContextLoadedThisSession && "OB context",
    ].filter(Boolean);
    log("BLOCKED context-gate: missing " + missing.join(", "));
    return {
      block: true,
      blockReason: `CONTEXT GATE: Load context before responding. Missing: ${missing.join(", ")}. Read TASKS.md + CONVERSATIONS.md + run mcp2cli open-brain session_load --params '{"project":"skippy-main"}' BEFORE sending messages. You keep saying dumb stuff without context.`,
    };
  };
}

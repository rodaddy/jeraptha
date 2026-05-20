import { isHeartbeatSession, getToolName } from "../shared/helpers.js";

export function createBlockMessageWithoutContext(state, config, log) {
  const gracePeriod = config.gracePeriodTurns || 5;
  const commThreshold = config.commGateThreshold || 8;
  return async (event, ctx) => {
    if (isHeartbeatSession(ctx)) {
      log.skip("heartbeat", "heartbeat session");
      return {};
    }
    const tn = getToolName(event);
    if (tn !== "message" || state.currentTurn <= gracePeriod) {
      log.skip(tn, tn !== "message" ? "not message" : "within grace period");
      return {};
    }
    if (state.prReviewContext) {
      log.skip(tn, "PR review context active");
      return {};
    }
    // If the agent has been doing heavy tool work (past commGateThreshold), defer to
    // the communication gate (block-silent-work-streak) instead of blocking here.
    // This prevents double-blocking on the same condition.
    if (state.toolCallsSinceMessage > commThreshold) {
      log.skip(tn, "deferred to communication gate");
      return {};
    }
    if (
      state.tasksReadThisSession &&
      state.conversationsReadThisSession &&
      state.obContextLoadedThisSession
    ) {
      log.allow(tn, "all context loaded");
      return {};
    }
    const missing = [
      !state.tasksReadThisSession && "TASKS.md",
      !state.conversationsReadThisSession && "CONVERSATIONS.md",
      !state.obContextLoadedThisSession && "OB context",
    ].filter(Boolean);
    log.block(tn, "missing context: " + missing.join(", "));
    return {
      block: true,
      blockReason: `CONTEXT GATE: Load context before responding. Missing: ${missing.join(", ")}. Read TASKS.md + CONVERSATIONS.md + run mcp2cli open-brain session_load --params '{"project":"skippy-main"}' BEFORE sending messages. You keep saying dumb stuff without context.`,
    };
  };
}

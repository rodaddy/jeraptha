import {
  isHeartbeatSession,
  isComplianceExec,
  getToolName,
  getCommand,
} from "../shared/helpers.js";
import { CONVERSATIONS_PATH } from "../shared/paths.js";
import { statSync } from "fs";

export function createBlockStaleConversationFile(state, config, log) {
  const threshold = config.conversationFreshnessTurns || 15;
  const gracePeriod = config.gracePeriodTurns || 5;

  return async (event, ctx) => {
    if (isHeartbeatSession(ctx)) return {};
    const tn = getToolName(event);
    if (tn !== "exec" && tn !== "bash" && tn !== "message") return {};
    if ((tn === "exec" || tn === "bash") && isComplianceExec(event.params))
      return {};
    // Self-update bypass: if the command targets CONVERSATIONS.md, let it through
    if (
      (tn === "exec" || tn === "bash") &&
      /CONVERSATIONS\.md/i.test(getCommand(event.params))
    )
      return {};
    if (state.currentTurn <= gracePeriod) return {};

    const turnsSinceUpdate =
      state.currentTurn - state.lastConversationsWriteTurn;
    if (turnsSinceUpdate <= threshold) return {};

    try {
      const stat = statSync(CONVERSATIONS_PATH);
      if (Date.now() - stat.mtimeMs < 120000) return {};
    } catch {}

    const blocked =
      event.params?.command || event.params?.cmd || event.params?.text || tn;
    log(
      "BLOCKED conversation-freshness-gate: " +
        turnsSinceUpdate +
        " turns since CONVERSATIONS.md update",
    );
    return {
      block: true,
      blockReason: `CONVERSATIONS GATE: CONVERSATIONS.md hasn't been updated in ${turnsSinceUpdate} turns. 1) Write to ${CONVERSATIONS_PATH} -- update topics, heat, what's current. 2) Then IMMEDIATELY resume what you were doing (you were about to: ${String(blocked).substring(0, 80)}). Do NOT stop after updating -- the update is a pit stop, not the destination.`,
    };
  };
}

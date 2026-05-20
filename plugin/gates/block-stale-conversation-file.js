import {
  isHeartbeatSession,
  isComplianceExec,
  getToolName,
  getCommand,
  isContextRecoveryCommand,
} from "../shared/helpers.js";
import { CONVERSATIONS_PATH } from "../shared/paths.js";
import { statSync } from "fs";

export function createBlockStaleConversationFile(state, config, log) {
  const threshold = config.conversationFreshnessTurns || 15;
  const gracePeriod = config.gracePeriodTurns || 5;

  return async (event, ctx) => {
    if (isHeartbeatSession(ctx)) {
      log.skip("heartbeat", "heartbeat session");
      return {};
    }
    const tn = getToolName(event);
    if (tn !== "exec" && tn !== "bash" && tn !== "message") {
      log.skip(tn, "not exec/bash/message");
      return {};
    }
    if ((tn === "exec" || tn === "bash") && isComplianceExec(event.params)) {
      log.allow(tn, "compliance exec");
      return {};
    }
    // Self-update bypass: if the command targets CONVERSATIONS.md, let it through
    if (
      (tn === "exec" || tn === "bash") &&
      isContextRecoveryCommand(getCommand(event.params))
    ) {
      log.allow(tn, "self-update targeting CONVERSATIONS.md");
      return {};
    }
    if (state.currentTurn <= gracePeriod) {
      log.allow(tn, "within grace period");
      return {};
    }

    const turnsSinceUpdate =
      state.currentTurn - state.lastConversationsWriteTurn;
    if (turnsSinceUpdate <= threshold) {
      log.allow(tn, "CONVERSATIONS.md within freshness threshold");
      return {};
    }

    try {
      const stat = statSync(CONVERSATIONS_PATH);
      if (Date.now() - stat.mtimeMs < 120000) {
        state.lastConversationsWriteTurn = state.currentTurn;
        log.allow(tn, "CONVERSATIONS.md recently modified on disk");
        return {};
      }
    } catch {}

    const blocked =
      event.params?.command || event.params?.cmd || event.params?.text || tn;
    log.block(tn, "CONVERSATIONS.md stale", { turnsSinceUpdate });
    return {
      block: true,
      blockReason: `CONVERSATIONS GATE: CONVERSATIONS.md hasn't been updated in ${turnsSinceUpdate} turns. 1) Write to ${CONVERSATIONS_PATH} -- update topics, heat, what's current. 2) Then IMMEDIATELY resume what you were doing (you were about to: ${String(blocked).substring(0, 80)}). Do NOT stop after updating -- the update is a pit stop, not the destination.`,
    };
  };
}

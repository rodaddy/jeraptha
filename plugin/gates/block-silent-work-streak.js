import {
  isHeartbeatSession,
  isComplianceExec,
  getToolName,
} from "../shared/helpers.js";

export function createBlockSilentWorkStreak(state, config, log) {
  const gracePeriod = config.gracePeriodTurns || 5;
  return async (event, ctx) => {
    if (isHeartbeatSession(ctx)) {
      log.skip("heartbeat", "heartbeat session");
      return {};
    }
    const tn = getToolName(event);
    if (tn !== "exec" && tn !== "bash") {
      log.skip(tn, "not exec/bash");
      return {};
    }
    if (isComplianceExec(event.params)) {
      log.skip(tn, "compliance exec");
      return {};
    }
    if (state.currentTurn <= gracePeriod) {
      log.allow(tn, "within grace period");
      return {};
    }
    const threshold = config.commGateThreshold || 8;
    if (state.toolCallsSinceMessage <= threshold) {
      log.allow(tn, "within communication threshold");
      return {};
    }

    const blocked = event.params?.command || event.params?.cmd || tn;
    log.block(tn, "silent work streak", {
      toolCallsSinceMessage: state.toolCallsSinceMessage,
    });
    return {
      block: true,
      blockReason: `COMMS GATE: You've made ${state.toolCallsSinceMessage} tool calls without sending a status update. 1) Post a progress message to the active channel NOW. 2) Then IMMEDIATELY resume what you were doing (you were about to: ${String(blocked).substring(0, 80)}). Do NOT stop after posting -- the update is a pit stop, not the destination.`,
    };
  };
}

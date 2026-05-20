import {
  isHeartbeatSession,
  isComplianceExec,
  getToolName,
  getCommand,
} from "../shared/helpers.js";
import { TASKS_PATH } from "../shared/paths.js";
import { statSync } from "fs";

export function createBlockStaleTaskFile(state, config, log) {
  const threshold = config.taskFreshnessTurns || 10;
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
    // Self-update bypass: if the command targets TASKS.md, let it through --
    // blocking the fix for the block creates a deadlock
    if (
      (tn === "exec" || tn === "bash") &&
      /TASKS\.md/i.test(getCommand(event.params))
    ) {
      log.allow(tn, "self-update targeting TASKS.md");
      return {};
    }
    if (state.currentTurn <= gracePeriod) {
      log.allow(tn, "within grace period");
      return {};
    }

    const turnsSinceUpdate = state.currentTurn - state.lastTasksWriteTurn;
    if (turnsSinceUpdate <= threshold) {
      log.allow(tn, "TASKS.md within freshness threshold");
      return {};
    }

    try {
      const stat = statSync(TASKS_PATH);
      if (Date.now() - stat.mtimeMs < 60000) {
        log.allow(tn, "TASKS.md recently modified on disk");
        return {};
      }
    } catch {}

    const blocked =
      event.params?.command || event.params?.cmd || event.params?.text || tn;
    log.block(tn, "TASKS.md stale", { turnsSinceUpdate });
    return {
      block: true,
      blockReason: `TASK GATE: TASKS.md hasn't been updated in ${turnsSinceUpdate} turns. 1) Write to ${TASKS_PATH} now -- update Last HB timestamps, status, what you're doing. 2) Then IMMEDIATELY resume what you were doing (you were about to: ${String(blocked).substring(0, 80)}). Do NOT stop after updating -- the update is a pit stop, not the destination.`,
    };
  };
}

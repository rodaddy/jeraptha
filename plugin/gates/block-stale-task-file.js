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
    if (isHeartbeatSession(ctx)) return {};
    const tn = getToolName(event);
    if (tn !== "exec" && tn !== "bash" && tn !== "message") return {};
    if ((tn === "exec" || tn === "bash") && isComplianceExec(event.params))
      return {};
    // Self-update bypass: if the command targets TASKS.md, let it through —
    // blocking the fix for the block creates a deadlock
    if (
      (tn === "exec" || tn === "bash") &&
      /TASKS\.md/i.test(getCommand(event.params))
    )
      return {};
    if (state.currentTurn <= gracePeriod) return {};

    const turnsSinceUpdate = state.currentTurn - state.lastTasksWriteTurn;
    if (turnsSinceUpdate <= threshold) return {};

    try {
      const stat = statSync(TASKS_PATH);
      if (Date.now() - stat.mtimeMs < 60000) return {};
    } catch {}

    const blocked =
      event.params?.command || event.params?.cmd || event.params?.text || tn;
    log(
      "BLOCKED task-freshness-gate: " +
        turnsSinceUpdate +
        " turns since TASKS.md update",
    );
    return {
      block: true,
      blockReason: `TASK GATE: TASKS.md hasn't been updated in ${turnsSinceUpdate} turns. 1) Write to ${TASKS_PATH} now -- update Last HB timestamps, status, what you're doing. 2) Then IMMEDIATELY resume what you were doing (you were about to: ${String(blocked).substring(0, 80)}). Do NOT stop after updating -- the update is a pit stop, not the destination.`,
    };
  };
}

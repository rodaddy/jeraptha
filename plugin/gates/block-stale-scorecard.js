import {
  isHeartbeatSession,
  isComplianceExec,
  getToolName,
} from "../shared/helpers.js";
import { SCORECARD_PATH, RESUME_PATH } from "../shared/paths.js";
import { statSync, writeFileSync } from "fs";

export function createBlockStaleScorecard(state, config, log) {
  const heartbeatMs = config.heartbeatIntervalMs || 10 * 60 * 1000;
  const activeConversationMs = config.activeConversationMs || 5 * 60 * 1000;
  const gracePeriod = config.gracePeriodTurns || 5;

  return async (event, ctx) => {
    if (isHeartbeatSession(ctx)) return {};
    const tn = getToolName(event);
    if (tn !== "exec" && tn !== "bash") return {};
    if (isComplianceExec(event.params)) return {};
    if (state.currentTurn <= gracePeriod) return {};

    const sinceLastMessage = Date.now() - state.lastMessageReceivedTime;
    if (sinceLastMessage < activeConversationMs) {
      log(
        "heartbeat-gate: skipped (active conversation, " +
          Math.round(sinceLastMessage / 1000) +
          "s since last message)",
      );
      return {};
    }

    let lastWrite = state.lastScorecardWriteTime;
    try {
      const mtime = statSync(SCORECARD_PATH).mtimeMs;
      if (mtime > lastWrite) lastWrite = mtime;
    } catch {}
    const elapsed = Date.now() - lastWrite;
    if (elapsed <= heartbeatMs) return {};

    const mins = Math.round(elapsed / 60000);
    const blocked =
      event.params?.command || event.params?.cmd || event.params?.text || tn;

    try {
      const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
      const resume = `# Resume Point\n\n**When:** ${ts}\n**Interrupted by:** heartbeat gate (${mins}min overdue)\n**Was about to run:** \`${String(blocked).substring(0, 200)}\`\n**Turn:** ${state.currentTurn}\n\nAfter heartbeat, resume this immediately.\n`;
      writeFileSync(RESUME_PATH, resume, "utf-8");
      log("heartbeat-gate: wrote RESUME.md breadcrumb");
    } catch (e) {
      log("write failed: " + (e?.message || e));
    }

    log("BLOCKED heartbeat-gate: " + mins + " min since scorecard update");
    return {
      block: true,
      blockReason: `HEARTBEAT GATE: No heartbeat activity in ${mins} minutes. 1) Run heartbeat: read TASKS.md, update SCORECARD.md, session_save to OB. 2) Read ${RESUME_PATH} and IMMEDIATELY resume what you were doing. Do NOT stop after the heartbeat -- it's a pit stop, not the destination.`,
    };
  };
}

import { SKILL_OPS } from "../shared/constants.js";
import {
  isHeartbeatSession,
  isComplianceExec,
  getToolName,
} from "../shared/helpers.js";

export function createBlockWithoutSkillConsult(state, config, log) {
  const gracePeriod = config.gracePeriodTurns || 5;
  return async (event, ctx) => {
    if (isHeartbeatSession(ctx)) return {};
    const tn = getToolName(event);
    if (tn !== "exec" && tn !== "bash") return {};
    if (
      isComplianceExec(event.params) ||
      state.currentTurn <= gracePeriod ||
      state.skillConsultedThisTurn
    )
      return {};
    const cmd = event.params?.command || event.params?.cmd || "";
    const match = SKILL_OPS.find(([p]) => p.test(cmd));
    if (!match) return {};
    log("BLOCKED skill-gate: " + match[1]);
    return {
      block: true,
      blockReason: `SKILL GATE: About to do ${match[1]} work without consulting skills. Read SKILL-INDEX.md, then the relevant SKILL.md. Skills have workflow knowledge you'll miss.`,
    };
  };
}

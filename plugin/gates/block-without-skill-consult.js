import { SKILL_OPS } from "../shared/constants.js";
import {
  isHeartbeatSession,
  isComplianceExec,
  getToolName,
  getCommand,
  isContextRecoveryCommand,
  isSkillConsultCommand,
} from "../shared/helpers.js";

export function createBlockWithoutSkillConsult(state, config, log) {
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
    if (
      isComplianceExec(event.params) ||
      state.currentTurn <= gracePeriod ||
      state.skillConsultedThisTurn
    ) {
      log.allow(tn, "compliance/grace/skill-consulted bypass");
      return {};
    }
    const cmd = getCommand(event.params);
    if (isContextRecoveryCommand(cmd) || isSkillConsultCommand(cmd)) {
      log.allow(tn, "context/skill file recovery command");
      return {};
    }
    const match = SKILL_OPS.find(([p]) => p.test(cmd));
    if (!match) {
      log.allow(tn, "no skill-ops pattern matched");
      return {};
    }
    log.block(tn, match[1] + " without skill consult");
    return {
      block: true,
      blockReason: `SKILL GATE: About to do ${match[1]} work without consulting skills. Read SKILL-INDEX.md, then the relevant SKILL.md. Skills have workflow knowledge you'll miss.`,
    };
  };
}

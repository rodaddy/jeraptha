import { PROCESS_PATTERNS, SOP_SEARCH_PATTERNS } from "../shared/constants.js";
import {
  isHeartbeatSession,
  isComplianceExec,
  getToolName,
  getCommand,
} from "../shared/helpers.js";

export function createBlockWithoutSopSearch(state, config, log) {
  return async (event, ctx) => {
    if (isHeartbeatSession(ctx)) {
      log.skip("heartbeat", "heartbeat session");
      return {};
    }
    const tn = getToolName(event);
    const params = event.params || {};

    if (tn === "exec" || tn === "bash") {
      const cmd = getCommand(params);
      if (
        /mcp2cli\s+open-brain/i.test(cmd) &&
        SOP_SEARCH_PATTERNS.some((p) => p.test(cmd))
      ) {
        state.sopSearchedThisTurn = true;
        log.allow(tn, "SOP search executed");
        return {};
      }
    }
    if (
      tn === "memory_search" &&
      SOP_SEARCH_PATTERNS.some((p) => p.test(params.query || ""))
    ) {
      state.sopSearchedThisTurn = true;
      log.allow(tn, "SOP search via memory_search");
      return {};
    }

    if (tn === "sessions_spawn" && !state.sopSearchedThisTurn) {
      log.block(tn, "agent spawn without SOP search");
      return {
        block: true,
        blockReason:
          'SOP GATE: Spawning agent without checking for an SOP first. Run: ~/.local/bin/mcp2cli open-brain search_brain --params \'{"query":"SOP agent spawn","limit":5}\' BEFORE spawning. If no SOP exists, note it and proceed.',
      };
    }

    if (
      (tn === "exec" || tn === "bash") &&
      !state.sopSearchedThisTurn &&
      !isComplianceExec(params)
    ) {
      const cmd = getCommand(params);
      if (PROCESS_PATTERNS.some((p) => p.test(cmd))) {
        let taskType = "this operation";
        if (/deploy/i.test(cmd)) taskType = "deployment";
        if (/git\s+(push|merge)/i.test(cmd)) taskType = "git workflow";
        if (/gh\s+pr/i.test(cmd)) taskType = "PR creation";
        if (/migrat/i.test(cmd)) taskType = "migration";
        if (/schema/i.test(cmd)) taskType = "schema change";
        if (/drizzle/i.test(cmd)) taskType = "drizzle migration";
        if (/swarm/i.test(cmd)) taskType = "code swarm";

        log.block(tn, taskType + " without SOP search");
        return {
          block: true,
          blockReason: `SOP GATE: About to do ${taskType} without checking for an SOP. Run: ~/.local/bin/mcp2cli open-brain search_brain --params '{"query":"SOP ${taskType}","limit":5}' BEFORE proceeding. If an SOP exists, FOLLOW IT.`,
        };
      }
    }

    log.allow(tn, "SOP gate passed");
    return {};
  };
}

import {
  isComplianceExec,
  getToolName,
  getCommand,
  isReadCommand,
  isSkillConsultCommand,
  touchesTasksFile,
  touchesConversationsFile,
  touchesSkillFile,
} from "../shared/helpers.js";

export function createObserveToolCallState(state, config, log) {
  return async (event, ctx) => {
    const tn = getToolName(event);
    const params = event.params || {};

    if (
      (tn === "write" || tn === "edit" || tn === "apply_patch") &&
      params.path
    ) {
      if (/TASKS\.md/i.test(params.path)) {
        state.lastTasksWriteTurn = state.currentTurn;
        state.tasksReadThisSession = true;
        log.info("TASKS.md write", { turn: state.currentTurn });
      }
      if (/SCORECARD\.md/i.test(params.path)) {
        state.lastScorecardWriteTime = Date.now();
        log.info("SCORECARD.md write");
      }
      if (/CONVERSATIONS\.md/i.test(params.path)) {
        state.lastConversationsWriteTurn = state.currentTurn;
        state.conversationsReadThisSession = true;
        log.info("CONVERSATIONS.md write", { turn: state.currentTurn });
      }
    }

    const cmd = getCommand(params);
    const isShell = tn === "exec" || tn === "bash";
    const readsCommand = isShell && isReadCommand(cmd);
    const skillConsultCommand = isShell && isSkillConsultCommand(cmd);

    if (isShell && !isComplianceExec(params)) {
      state.toolCallsSinceMessage++;
      log.debug("tool call count incremented", {
        toolCallsSinceMessage: state.toolCallsSinceMessage,
      });
    }

    if (
      skillConsultCommand ||
      (tn === "read" && touchesSkillFile(params?.path || ""))
    ) {
      state.skillConsultedThisTurn = true;
    }

    if (
      (tn === "read" && touchesTasksFile(params?.path)) ||
      (readsCommand && touchesTasksFile(cmd))
    )
      state.tasksReadThisSession = true;
    if (
      (tn === "read" && touchesConversationsFile(params?.path)) ||
      (readsCommand && touchesConversationsFile(cmd))
    )
      state.conversationsReadThisSession = true;
    if (/open-brain.*(session_load|search_brain|search_all)/i.test(cmd))
      state.obContextLoadedThisSession = true;

    // Track review agent spawns and pr-investigator usage
    if (state.prReviewContext) {
      if (tn === "sessions_spawn") {
        state.reviewAgentSpawned = true;
        if (
          /pr[_-]investigator/i.test(params?.agentId || params?.label || "")
        ) {
          state.prDetectedIds.forEach((id) => state.prInvestigatedIds.add(id));
          log.info("pr-investigator spawned via sessions_spawn", {
            investigated: state.prInvestigatedIds.size,
          });
        } else {
          log.info("review agent spawned (not pr-investigator)");
        }
      }
      if (isShell && /\bpr[_-]investigator\b/i.test(cmd)) {
        state.prDetectedIds.forEach((id) => state.prInvestigatedIds.add(id));
        log.info("pr-investigator invoked via exec", {
          investigated: state.prInvestigatedIds.size,
        });
      }
    }

    return {};
  };
}

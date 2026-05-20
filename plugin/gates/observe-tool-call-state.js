import {
  isComplianceExec,
  getToolName,
  getCommand,
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

    if (tn === "message") {
      state.toolCallsSinceMessage = 0;
      log.info("message send", { turn: state.currentTurn });
    }

    if ((tn === "exec" || tn === "bash") && !isComplianceExec(params)) {
      state.toolCallsSinceMessage++;
      log.debug("tool call count incremented", {
        toolCallsSinceMessage: state.toolCallsSinceMessage,
      });
    }

    if (
      ((tn === "exec" || tn === "bash") &&
        /\bcat\b.*SKILL/i.test(getCommand(params))) ||
      (tn === "read" && /SKILL/i.test(params?.path || ""))
    ) {
      state.skillConsultedThisTurn = true;
    }

    const rcmd = getCommand(params);
    if (
      (tn === "read" && /TASKS\.md/i.test(params?.path)) ||
      /cat.*TASKS\.md/i.test(rcmd)
    )
      state.tasksReadThisSession = true;
    if (
      (tn === "read" && /CONVERSATIONS\.md/i.test(params?.path)) ||
      /cat.*CONVERSATIONS\.md/i.test(rcmd)
    )
      state.conversationsReadThisSession = true;
    if (/open-brain.*(session_load|search_brain|search_all)/i.test(rcmd))
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
      if (
        (tn === "exec" || tn === "bash") &&
        /\bpr[_-]investigator\b/i.test(rcmd)
      ) {
        state.prDetectedIds.forEach((id) => state.prInvestigatedIds.add(id));
        log.info("pr-investigator invoked via exec", {
          investigated: state.prInvestigatedIds.size,
        });
      }
    }

    return {};
  };
}

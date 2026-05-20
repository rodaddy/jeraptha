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
        log("state-tracker: TASKS.md write (turn " + state.currentTurn + ")");
      }
      if (/SCORECARD\.md/i.test(params.path)) {
        state.lastScorecardWriteTime = Date.now();
        log("state-tracker: SCORECARD.md write");
      }
      if (/CONVERSATIONS\.md/i.test(params.path)) {
        state.lastConversationsWriteTurn = state.currentTurn;
        state.conversationsReadThisSession = true;
        log(
          "state-tracker: CONVERSATIONS.md write (turn " +
            state.currentTurn +
            ")",
        );
      }
    }

    if (tn === "message") {
      state.toolCallsSinceMessage = 0;
      log("state-tracker: message send (turn " + state.currentTurn + ")");
    }

    if ((tn === "exec" || tn === "bash") && !isComplianceExec(params)) {
      state.toolCallsSinceMessage++;
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

    // Track review agent spawns for block-praise-without-review gate
    if (tn === "sessions_spawn" && state.prReviewContext) {
      state.reviewAgentSpawned = true;
      log("state-tracker: review agent spawned during PR context");
    }

    return {};
  };
}

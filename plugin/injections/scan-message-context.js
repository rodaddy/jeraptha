import { QUESTION_PATTERNS, PR_CONTEXT_PATTERNS } from "../shared/constants.js";

export function createScanMessageContext(state, config, log) {
  return async (event, ctx) => {
    const messages = event.messages || [];

    const userMessages = [...messages]
      .reverse()
      .filter((m) => m.role === "user")
      .slice(0, 5);

    if (userMessages.length === 0) {
      log.debug("no user messages in history");
      return {};
    }

    state.recentUserMessages = userMessages
      .map((m) =>
        typeof m.content === "string"
          ? m.content
          : JSON.stringify(m.content || ""),
      )
      .join("\n---\n");

    const lastUserText = userMessages[0]
      ? typeof userMessages[0].content === "string"
        ? userMessages[0].content
        : JSON.stringify(userMessages[0].content || "")
      : "";

    if (lastUserText && PR_CONTEXT_PATTERNS.some((p) => p.test(lastUserText))) {
      state.prReviewContext = true;
      log.info("PR/review context detected from messages");
    }

    if (lastUserText && QUESTION_PATTERNS.some((p) => p.test(lastUserText))) {
      state.factualQuestionThisTurn = true;
      log.debug("factual question detected from user message");
    }

    return {};
  };
}

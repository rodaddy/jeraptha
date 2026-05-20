import { QUESTION_PATTERNS, PR_CONTEXT_PATTERNS } from "../shared/constants.js";

const PR_SKILL_REMINDER = `[JERAPTHA PR ENFORCEMENT] A PR or code review was detected in the conversation. You MUST spawn /pr-investigator as a SUBAGENT (sessions_spawn) for EACH PR to review the actual code before responding with any assessment. Do NOT run it inline -- stay available on the channel while it works. Post status updates for long-running investigations ("investigating PR #X, checking Y so far"). Do NOT praise, approve, or comment on code quality without the investigator results. The praise gate WILL block you if you try.`;

const PR_URL_PATTERN = /github\.com\/[^\s)]+\/pull\/\d+/gi;
const PR_NUMBER_PATTERN = /\bPR\s*#?(\d+)\b/gi;

function extractPrIds(text) {
  const ids = new Set();
  for (const m of text.matchAll(PR_URL_PATTERN)) ids.add(m[0].toLowerCase());
  for (const m of text.matchAll(PR_NUMBER_PATTERN)) ids.add(m[0].toLowerCase());
  return ids;
}

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

      const newIds = extractPrIds(lastUserText);
      let hasNew = false;
      for (const id of newIds) {
        if (!state.prDetectedIds.has(id)) {
          state.prDetectedIds.add(id);
          hasNew = true;
        }
      }

      if (hasNew) {
        log.info("new PR(s) detected", {
          new: [...newIds],
          total: state.prDetectedIds.size,
          investigated: state.prInvestigatedIds.size,
        });
      } else {
        log.debug("PR context active, no new PRs");
      }

      return { appendSystemContext: PR_SKILL_REMINDER };
    }

    if (lastUserText && QUESTION_PATTERNS.some((p) => p.test(lastUserText))) {
      state.factualQuestionThisTurn = true;
      log.debug("factual question detected from user message");
    }

    return {};
  };
}

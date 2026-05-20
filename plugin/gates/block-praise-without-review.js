import {
  PR_CONTEXT_PATTERNS,
  PRAISE_WITHOUT_REVIEW,
  REVIEW_COMMITMENT,
} from "../shared/constants.js";
import { getToolName, getMessageText, getMessages } from "../shared/helpers.js";

export function createBlockPraiseWithoutReview(state, config, log) {
  return async (event, ctx) => {
    const tn = getToolName(event);

    // Detect PR/review context from user messages (set once per turn)
    if (!state.prReviewContext) {
      const messages = getMessages(event);
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (lastUser) {
        const userText =
          typeof lastUser.content === "string"
            ? lastUser.content
            : JSON.stringify(lastUser.content || "");
        if (PR_CONTEXT_PATTERNS.some((p) => p.test(userText))) {
          state.prReviewContext = true;
          log("praise-gate: PR/review context detected");
        }
      }
    }

    if (!state.prReviewContext) return {};
    if (tn !== "message") return {};

    const botMessage = getMessageText(event.params);
    if (!botMessage) return {};

    const hasPraise = PRAISE_WITHOUT_REVIEW.some((p) => p.test(botMessage));
    const hasCommitment = REVIEW_COMMITMENT.some((p) => p.test(botMessage));

    // First message in a PR context
    if (!state.reviewPromisedThisTurn) {
      if (hasPraise && hasCommitment) {
        state.reviewPromisedThisTurn = true;
        log("praise-gate: praise + review commitment accepted");
        return {};
      }

      if (hasPraise && !hasCommitment) {
        log("BLOCKED praise-gate: praise without review commitment");
        return {
          block: true,
          blockReason:
            "PRAISE GATE: You're responding to a PR/code review with praise but no commitment to actually review. Add a review commitment ('let me check the code', 'I'll dig into the changes') and then ACTUALLY spawn a review agent. Praise without verification is sycophancy.",
        };
      }

      // Non-praise message (e.g., asking clarifying questions) -- allow
      return {};
    }

    // Review was promised — check if it happened
    if (state.reviewAgentSpawned) {
      log("praise-gate: review agent confirmed, message allowed");
      return {};
    }

    // Promised but didn't follow through
    log("BLOCKED praise-gate: review promised but no agent spawned");
    return {
      block: true,
      blockReason:
        "PRAISE GATE (HARD BLOCK): You promised to review but haven't spawned a review agent. Do the review before sending another message. Use sessions_spawn or your review skill to actually check the code. No more talking until you've done the work.",
    };
  };
}

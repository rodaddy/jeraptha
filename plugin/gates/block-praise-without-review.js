import {
  PRAISE_WITHOUT_REVIEW,
  REVIEW_COMMITMENT,
} from "../shared/constants.js";
import { getToolName, getMessageText } from "../shared/helpers.js";

export function createBlockPraiseWithoutReview(state, config, log) {
  return async (event, ctx) => {
    const tn = getToolName(event);

    if (!state.prReviewContext) {
      log.skip(tn, "no PR/review context");
      return {};
    }
    if (tn !== "message") {
      log.skip(tn, "not message tool in PR context");
      return {};
    }

    const botMessage = getMessageText(event.params);
    if (!botMessage) {
      log.skip(tn, "empty bot message");
      return {};
    }

    const hasPraise = PRAISE_WITHOUT_REVIEW.some((p) => p.test(botMessage));
    const hasCommitment = REVIEW_COMMITMENT.some((p) => p.test(botMessage));

    // First message in a PR context
    if (!state.reviewPromisedThisTurn) {
      if (hasPraise && hasCommitment) {
        state.reviewPromisedThisTurn = true;
        log.allow(tn, "praise + review commitment accepted");
        return {};
      }

      if (hasPraise && !hasCommitment) {
        log.block(tn, "praise without review commitment");
        return {
          block: true,
          blockReason:
            "PRAISE GATE: You're responding to a PR/code review with praise but no commitment to actually review. Add a review commitment ('let me check the code', 'I'll dig into the changes') and then ACTUALLY spawn a review agent. Praise without verification is sycophancy.",
        };
      }

      // Non-praise message (e.g., asking clarifying questions) -- allow
      log.allow(tn, "non-praise response in PR context");
      return {};
    }

    // Review was promised — check if it happened
    if (state.reviewAgentSpawned) {
      log.allow(tn, "review agent confirmed");
      return {};
    }

    // Promised but didn't follow through
    log.block(tn, "review promised but no agent spawned");
    return {
      block: true,
      blockReason:
        "PRAISE GATE (HARD BLOCK): You promised to review but haven't spawned a review agent. Do the review before sending another message. Use sessions_spawn or your review skill to actually check the code. No more talking until you've done the work.",
    };
  };
}

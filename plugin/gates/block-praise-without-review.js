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

    const uninvestigated = [...state.prDetectedIds].filter(
      (id) => !state.prInvestigatedIds.has(id),
    );
    const allInvestigated =
      state.prDetectedIds.size > 0 && uninvestigated.length === 0;

    // First message in a PR context
    if (!state.reviewPromisedThisTurn) {
      if (hasPraise && hasCommitment) {
        state.reviewPromisedThisTurn = true;
        log.allow(tn, "praise + review commitment accepted");
        return {};
      }

      if (hasPraise && !hasCommitment) {
        log.block(tn, "praise without review commitment", {
          uninvestigated: uninvestigated.length,
        });
        return {
          block: true,
          blockReason:
            "PRAISE GATE: You're responding to a PR/code review with praise but no commitment to actually review. Spawn /pr-investigator as a subagent (sessions_spawn) to review the actual code -- do NOT run it inline, stay available. Praise without verification is sycophancy.",
        };
      }

      log.allow(tn, "non-praise response in PR context");
      return {};
    }

    // All detected PRs have been investigated
    if (allInvestigated) {
      log.allow(tn, "all PRs investigated", {
        count: state.prInvestigatedIds.size,
      });
      return {};
    }

    // Fallback: accept any review agent spawn
    if (state.reviewAgentSpawned) {
      log.allow(tn, "review agent spawned (pr-investigator preferred)", {
        uninvestigated: uninvestigated.length,
      });
      return {};
    }

    // Promised but didn't follow through
    log.block(tn, "review promised but pr-investigator not used", {
      detected: state.prDetectedIds.size,
      investigated: state.prInvestigatedIds.size,
      uninvestigated,
    });
    return {
      block: true,
      blockReason: `PRAISE GATE (HARD BLOCK): You promised to review but haven't used /pr-investigator on ${uninvestigated.length} PR(s). Spawn it as a subagent (sessions_spawn) NOW -- do NOT go heads-down inline. Stay available while it runs. No more talking until the investigator is spawned.`,
    };
  };
}

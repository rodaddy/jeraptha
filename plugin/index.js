// Jeraptha Behavioral Enforcement Plugin for OpenClaw
// v3.0.0 -- 21 hooks, modular architecture
//
// See docs/architecture.md for the full priority map and event flow.
// Each gate is a separate module in gates/, injections/, or events/.

import { createState } from "./shared/state.js";

// Gates (before_tool_call -- blocking)
import { createObserveToolCallState } from "./gates/observe-tool-call-state.js";
import { createBlockConfigModification } from "./gates/block-config-modification.js";
import { createBlockDestructiveGitCommands } from "./gates/block-destructive-git-commands.js";
import { createBlockSedOnWorkspace } from "./gates/block-sed-on-workspace.js";
import { createBlockLongPollTimeouts } from "./gates/block-long-poll-timeouts.js";
import { createBlockWithoutObSearch } from "./gates/block-without-ob-search.js";
import { createBlockWithoutSopSearch } from "./gates/block-without-sop-search.js";
import { createBlockWithoutSkillConsult } from "./gates/block-without-skill-consult.js";
import { createBlockStaleTaskFile } from "./gates/block-stale-task-file.js";
import { createBlockStaleConversationFile } from "./gates/block-stale-conversation-file.js";
import { createBlockMessageWithoutContext } from "./gates/block-message-without-context.js";
import { createBlockSilentWorkStreak } from "./gates/block-silent-work-streak.js";
import { createBlockPraiseWithoutReview } from "./gates/block-praise-without-review.js";
import { createBlockUserDataContradiction } from "./gates/block-user-data-contradiction.js";
import { createBlockStaleScorecard } from "./gates/block-stale-scorecard.js";

// Injections (before_prompt_build -- context enrichment)
import { createInjectResumeAfterRestart } from "./injections/inject-resume-after-restart.js";
import { createScoreAndInjectUserSentiment } from "./injections/score-and-inject-user-sentiment.js";
import { createInjectStalledTaskAlert } from "./injections/inject-stalled-task-alert.js";
import { createInjectSkillIndexPeriodically } from "./injections/inject-skill-index-periodically.js";

// Events (message_received, message_sending)
import { createResetPerTurnState } from "./events/reset-per-turn-state.js";
import { createBreakBotToBotLoop } from "./events/break-bot-to-bot-loop.js";

const plugin = {
  id: "jeraptha",
  name: "Jeraptha Behavioral Enforcement",
  description:
    "21 behavioral enforcement hooks for OpenClaw agents. 15 blocking gates, 4 context injections, 1 state manager, 1 circuit breaker.",

  register(api) {
    const cfg = api.pluginConfig ?? {};
    if (cfg.enabled === false) return;

    const state = createState();
    const log = cfg.debug
      ? (msg) => api.logger.info(`[jeraptha] ${msg}`)
      : () => {};

    // -- before_tool_call gates (priority order: high runs first) --
    api.on("before_tool_call", createObserveToolCallState(state, cfg, log), {
      priority: 110,
    });
    api.on("before_tool_call", createBlockConfigModification(state, cfg, log), {
      priority: 100,
    });
    api.on(
      "before_tool_call",
      createBlockDestructiveGitCommands(state, cfg, log),
      { priority: 95 },
    );
    api.on("before_tool_call", createBlockSedOnWorkspace(state, cfg, log), {
      priority: 92,
    });
    api.on("before_tool_call", createBlockLongPollTimeouts(state, cfg, log), {
      priority: 90,
    });
    api.on("before_tool_call", createBlockWithoutObSearch(state, cfg, log), {
      priority: 80,
    });
    api.on("before_tool_call", createBlockWithoutSopSearch(state, cfg, log), {
      priority: 70,
    });
    api.on(
      "before_tool_call",
      createBlockWithoutSkillConsult(state, cfg, log),
      { priority: 68 },
    );
    api.on("before_tool_call", createBlockStaleTaskFile(state, cfg, log), {
      priority: 65,
    });
    api.on(
      "before_tool_call",
      createBlockStaleConversationFile(state, cfg, log),
      { priority: 62 },
    );
    api.on(
      "before_tool_call",
      createBlockMessageWithoutContext(state, cfg, log),
      { priority: 58 },
    );
    api.on("before_tool_call", createBlockSilentWorkStreak(state, cfg, log), {
      priority: 55,
    });
    api.on(
      "before_tool_call",
      createBlockPraiseWithoutReview(state, cfg, log),
      { priority: 52 },
    );
    api.on(
      "before_tool_call",
      createBlockUserDataContradiction(state, cfg, log),
      { priority: 50 },
    );
    api.on("before_tool_call", createBlockStaleScorecard(state, cfg, log), {
      priority: 45,
    });

    // -- before_prompt_build injections --
    api.on(
      "before_prompt_build",
      createInjectResumeAfterRestart(state, cfg, log),
      { priority: 60 },
    );
    api.on(
      "before_prompt_build",
      createScoreAndInjectUserSentiment(state, cfg, log),
      { priority: 50 },
    );
    api.on(
      "before_prompt_build",
      createInjectStalledTaskAlert(state, cfg, log),
      { priority: 40 },
    );
    api.on(
      "before_prompt_build",
      createInjectSkillIndexPeriodically(state, cfg, log),
      { priority: 35 },
    );

    // -- message events --
    api.on("message_received", createResetPerTurnState(state, cfg, log));
    api.on("message_sending", createBreakBotToBotLoop(state, cfg, log), {
      priority: 120,
    });

    log(
      "registered: 15 before_tool_call (14 blocking + 1 tracker) + 4 before_prompt_build + 1 message_received + 1 message_sending (21 Jeraptha v3.0.0 hooks)",
    );
  },
};

export default plugin;

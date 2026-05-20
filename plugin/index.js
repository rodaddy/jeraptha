// Jeraptha Behavioral Enforcement Plugin for OpenClaw
// v3.1.1 -- 22 hooks, strict context recovery
//
// See docs/architecture.md for the full priority map and event flow.
// Each gate is a separate module in gates/, injections/, or events/.

import { createState } from "./shared/state.js";
import { createGateLogger } from "./shared/helpers.js";

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
import { createScanMessageContext } from "./injections/scan-message-context.js";
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
    const debug = cfg.debug !== false;
    const gl = (name) => createGateLogger(name, api.logger, state, debug);

    // -- before_tool_call gates (priority order: high runs first) --
    api.on(
      "before_tool_call",
      createObserveToolCallState(state, cfg, gl("state-tracker")),
      { priority: 110 },
    );
    api.on(
      "before_tool_call",
      createBlockConfigModification(state, cfg, gl("config-modification")),
      { priority: 100 },
    );
    api.on(
      "before_tool_call",
      createBlockDestructiveGitCommands(state, cfg, gl("destructive-git")),
      { priority: 95 },
    );
    api.on(
      "before_tool_call",
      createBlockSedOnWorkspace(state, cfg, gl("sed-workspace")),
      { priority: 92 },
    );
    api.on(
      "before_tool_call",
      createBlockLongPollTimeouts(state, cfg, gl("long-poll")),
      { priority: 90 },
    );
    api.on(
      "before_tool_call",
      createBlockWithoutObSearch(state, cfg, gl("ob-search")),
      { priority: 80 },
    );
    api.on(
      "before_tool_call",
      createBlockWithoutSopSearch(state, cfg, gl("sop-search")),
      { priority: 70 },
    );
    api.on(
      "before_tool_call",
      createBlockWithoutSkillConsult(state, cfg, gl("skill-consult")),
      { priority: 68 },
    );
    api.on(
      "before_tool_call",
      createBlockStaleTaskFile(state, cfg, gl("task-freshness")),
      { priority: 65 },
    );
    api.on(
      "before_tool_call",
      createBlockStaleConversationFile(
        state,
        cfg,
        gl("conversation-freshness"),
      ),
      { priority: 62 },
    );
    api.on(
      "before_tool_call",
      createBlockMessageWithoutContext(state, cfg, gl("context-before-msg")),
      { priority: 58 },
    );
    api.on(
      "before_tool_call",
      createBlockSilentWorkStreak(state, cfg, gl("silent-work")),
      { priority: 55 },
    );
    api.on(
      "before_tool_call",
      createBlockPraiseWithoutReview(state, cfg, gl("praise-review")),
      { priority: 52 },
    );
    api.on(
      "before_tool_call",
      createBlockUserDataContradiction(state, cfg, gl("contradiction")),
      { priority: 50 },
    );
    api.on(
      "before_tool_call",
      createBlockStaleScorecard(state, cfg, gl("heartbeat")),
      { priority: 45 },
    );

    // -- before_prompt_build injections --
    api.on(
      "before_prompt_build",
      createScanMessageContext(state, cfg, gl("msg-context")),
      { priority: 90 },
    );
    api.on(
      "before_prompt_build",
      createInjectResumeAfterRestart(state, cfg, gl("resume-inject")),
      { priority: 60 },
    );
    api.on(
      "before_prompt_build",
      createScoreAndInjectUserSentiment(state, cfg, gl("sentiment")),
      { priority: 50 },
    );
    api.on(
      "before_prompt_build",
      createInjectStalledTaskAlert(state, cfg, gl("stalled-alert")),
      { priority: 40 },
    );
    api.on(
      "before_prompt_build",
      createInjectSkillIndexPeriodically(state, cfg, gl("skill-reminder")),
      { priority: 35 },
    );

    // -- message events --
    api.on(
      "message_received",
      createResetPerTurnState(state, cfg, gl("state-reset")),
    );
    api.on(
      "message_sending",
      createBreakBotToBotLoop(state, cfg, gl("bot-banter")),
      { priority: 120 },
    );

    api.logger.info(
      `[jeraptha] registered: 15 before_tool_call (14 blocking + 1 tracker) + 5 before_prompt_build + 1 message_received + 1 message_sending (22 Jeraptha v3.1.1 hooks)`,
    );
  },
};

export default plugin;

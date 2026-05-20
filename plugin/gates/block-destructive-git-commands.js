import { DESTRUCTIVE_GIT } from "../shared/constants.js";
import {
  isHeartbeatSession,
  getToolName,
  getCommand,
} from "../shared/helpers.js";

export function createBlockDestructiveGitCommands(state, config, log) {
  return async (event, ctx) => {
    if (isHeartbeatSession(ctx)) {
      log.skip("heartbeat", "heartbeat session");
      return {};
    }
    const tn = getToolName(event);
    if (tn !== "exec" && tn !== "bash") {
      log.skip(tn, "not exec/bash");
      return {};
    }

    const cmd = getCommand(event.params);
    if (DESTRUCTIVE_GIT.some((p) => p.test(cmd))) {
      log.block(tn, "destructive git command", { cmd: cmd.substring(0, 80) });
      return {
        block: true,
        blockReason: `DESTRUCTIVE GIT BLOCK: "${cmd.substring(0, 80)}" can NEVER be run by an agent. This is a hard block with no override. Copy the command and run it yourself if needed.`,
      };
    }

    if (/\bcd\s+\S+\s*(&&|;)\s*git\b/i.test(cmd)) {
      log.block(tn, "cd+git chain command", { cmd: cmd.substring(0, 80) });
      return {
        block: true,
        blockReason:
          'CHAIN BLOCK: Do not chain cd with git. Use "git -C /path command" or separate exec calls.',
      };
    }

    if (
      /<<-?\s*'?[A-Z_]+'?/.test(cmd) &&
      /(?:cat\s*>|tee\s+\S|>>)/.test(cmd) &&
      !/git\s+commit\s+-m\s+"\$\(cat\s+<</.test(cmd) &&
      !/TASKS\.md|CONVERSATIONS\.md|SCORECARD\.md/i.test(cmd)
    ) {
      log.block(tn, "heredoc file write", { cmd: cmd.substring(0, 80) });
      return {
        block: true,
        blockReason:
          "HEREDOC BLOCK: Heredocs that write to files are blocked -- they corrupt configs. Use Write/Edit tools.",
      };
    }

    log.allow(tn, "safe git command");
    return {};
  };
}

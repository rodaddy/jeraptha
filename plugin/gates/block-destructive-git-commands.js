import { DESTRUCTIVE_GIT } from "../shared/constants.js";
import {
  isHeartbeatSession,
  getToolName,
  getCommand,
} from "../shared/helpers.js";

export function createBlockDestructiveGitCommands(state, config, log) {
  return async (event, ctx) => {
    if (isHeartbeatSession(ctx)) return {};
    const tn = getToolName(event);
    if (tn !== "exec" && tn !== "bash") return {};

    const cmd = getCommand(event.params);
    if (DESTRUCTIVE_GIT.some((p) => p.test(cmd))) {
      log("BLOCKED no-destructive-git: " + cmd.substring(0, 80));
      return {
        block: true,
        blockReason: `DESTRUCTIVE GIT BLOCK: "${cmd.substring(0, 80)}" can NEVER be run by an agent. This is a hard block with no override. Copy the command and run it yourself if needed.`,
      };
    }

    if (/\bcd\s+\S+\s*(&&|;)\s*git\b/i.test(cmd)) {
      log("BLOCKED chain-command: " + cmd.substring(0, 80));
      return {
        block: true,
        blockReason:
          'CHAIN BLOCK: Do not chain cd with git. Use "git -C /path command" or separate exec calls.',
      };
    }

    if (
      /<<-?\s*'?[A-Z_]+'?/.test(cmd) &&
      /(?:cat\s*>|tee\s+\S|>>)/.test(cmd) &&
      !/git\s+commit\s+-m\s+"\$\(cat\s+<</.test(cmd)
    ) {
      log("BLOCKED heredoc-write: " + cmd.substring(0, 80));
      return {
        block: true,
        blockReason:
          "HEREDOC BLOCK: Heredocs that write to files are blocked -- they corrupt configs. Use Write/Edit tools.",
      };
    }

    return {};
  };
}

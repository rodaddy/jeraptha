import { getToolName, getCommand } from "../shared/helpers.js";

export function createBlockSedOnWorkspace(state, config, log) {
  return async (event, ctx) => {
    const tn = getToolName(event);
    if (tn !== "exec" && tn !== "bash") return {};

    const cmd = getCommand(event.params);
    // Allow sed on the files that other gates require agents to update
    if (/TASKS\.md|CONVERSATIONS\.md|SCORECARD\.md/i.test(cmd)) return {};
    if (/\bsed\b/i.test(cmd) && /\.openclaw\/workspace\/.*\.md/i.test(cmd)) {
      log("BLOCKED no-sed-workspace: " + cmd.substring(0, 80));
      return {
        block: true,
        blockReason:
          "SED BLOCK: Do NOT use sed on workspace .md files. Use the write tool (full file overwrite) instead. Read the file, modify in memory, write back. sed triggers exec approval popups. This has been explained 5 times. Now it's enforced.",
      };
    }

    return {};
  };
}

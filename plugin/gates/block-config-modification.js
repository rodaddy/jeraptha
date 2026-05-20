import {
  HARD_BLOCKED_PATHS,
  APPROVAL_EXEC,
  APPROVAL_PATHS,
  WRITE_INTENTS,
} from "../shared/constants.js";
import { getToolName, getCommand } from "../shared/helpers.js";

export function createBlockConfigModification(state, config, log) {
  return async (event, ctx) => {
    const tn = getToolName(event);
    const params = event.params || {};

    if (tn === "exec" || tn === "bash") {
      const cmd = getCommand(params);
      if (HARD_BLOCKED_PATHS.some((p) => p.test(cmd))) {
        if (WRITE_INTENTS.test(cmd)) {
          if (/\bssh\s+/i.test(cmd)) {
            log(
              "ALLOWED no-self-surgery (cross-agent SSH): " +
                cmd.substring(0, 80),
            );
            return {};
          }
          if (/\boc-channel\b/i.test(cmd)) {
            log(
              "ALLOWED no-self-surgery (oc-channel): " + cmd.substring(0, 80),
            );
            return {};
          }
          log("BLOCKED no-self-surgery (hard): " + cmd.substring(0, 60));
          return {
            block: true,
            blockReason:
              "CARAPACE LOCK: Cannot modify own openclaw.json. Use oc-channel for channel management, or SSH for cross-agent fixes.",
          };
        }
        log("ALLOWED no-self-surgery (read): " + cmd.substring(0, 60));
      }
    }

    if (
      (tn === "write" || tn === "edit" || tn === "apply_patch") &&
      params?.path
    ) {
      if (HARD_BLOCKED_PATHS.some((p) => p.test(params.path))) {
        log("BLOCKED no-self-surgery (hard): " + params.path);
        return {
          block: true,
          blockReason:
            "CARAPACE LOCK: Cannot modify openclaw.json. EVER. Tell the operator if something is wrong.",
        };
      }
    }

    if (tn === "exec" || tn === "bash") {
      const cmd = getCommand(params);
      if (APPROVAL_EXEC.some((p) => p.test(cmd))) {
        log("APPROVAL no-self-surgery: " + cmd.substring(0, 60));
        return {
          requireApproval: {
            title: "Protected Operation",
            description: `ECO: "${cmd.substring(0, 120)}" targets protected infrastructure. Approve to proceed.`,
            severity: "warning",
            timeoutMs: 60000,
            timeoutBehavior: "deny",
          },
        };
      }
    }

    if (
      (tn === "write" || tn === "edit" || tn === "apply_patch") &&
      params?.path
    ) {
      if (APPROVAL_PATHS.some((p) => p.test(params.path))) {
        log("APPROVAL no-self-surgery: " + params.path);
        return {
          requireApproval: {
            title: "Protected File Edit",
            description: `ECO: Editing "${params.path}" -- make a backup first. Approve to proceed.`,
            severity: "warning",
            timeoutMs: 60000,
            timeoutBehavior: "deny",
          },
        };
      }
    }

    return {};
  };
}

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
            log.allow(tn, "cross-agent SSH to protected path");
            return {};
          }
          if (/\boc-channel\b/i.test(cmd)) {
            log.allow(tn, "oc-channel to protected path");
            return {};
          }
          log.block(tn, "write to hard-blocked path", {
            cmd: cmd.substring(0, 80),
          });
          return {
            block: true,
            blockReason:
              "CARAPACE LOCK: Cannot modify own openclaw.json. Use oc-channel for channel management, or SSH for cross-agent fixes.",
          };
        }
        log.allow(tn, "read-only access to protected path");
      }
    }

    if (
      (tn === "write" || tn === "edit" || tn === "apply_patch") &&
      params?.path
    ) {
      if (HARD_BLOCKED_PATHS.some((p) => p.test(params.path))) {
        log.block(tn, "write to hard-blocked path", { path: params.path });
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
        log.info("approval required", { tool: tn, cmd: cmd.substring(0, 80) });
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
        log.info("approval required", { tool: tn, path: params.path });
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

    log.allow(tn, "no protected paths matched");
    return {};
  };
}

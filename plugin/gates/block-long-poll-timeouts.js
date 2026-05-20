import { isHeartbeatSession, getToolName } from "../shared/helpers.js";

export function createBlockLongPollTimeouts(state, config, log) {
  return async (event, ctx) => {
    if (isHeartbeatSession(ctx)) {
      log.skip("heartbeat", "heartbeat session");
      return {};
    }
    const tn = getToolName(event);
    if (tn !== "process") {
      log.skip(tn, "not process");
      return {};
    }
    const action = (event.params?.action || "").toLowerCase();
    if (action !== "poll") {
      log.skip(tn, "not poll action");
      return {};
    }
    const timeout = event.params?.timeout || event.params?.timeoutMs || 0;
    if (typeof timeout === "number" && timeout > 10000) {
      log.block(tn, "poll timeout exceeds 10s", { timeout });
      return {
        block: true,
        blockReason: `DEAF POLL BLOCKED: timeout ${timeout}ms (${Math.round(timeout / 1000)}s) exceeds 10s max. Use tmux instead: \`tmux new-session -d -s name 'cmd'\`. Stay available. Never go dark.`,
      };
    }
    log.allow(tn, "poll timeout within limit");
    return {};
  };
}

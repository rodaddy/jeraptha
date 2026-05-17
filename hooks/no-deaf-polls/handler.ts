// no-deaf-polls hook -- HARD BLOCK long process polls that make Skippy deaf
// Event: before_tool_call
// 
// Root cause: process(action=poll, timeout=300000) blocks Skippy's turn.
// He can't see messages, can't reply, can't update tasks. Dead air.
// LAW 5 says use tmux. This hook enforces it.

const MAX_POLL_TIMEOUT_MS = 10000; // 10 seconds max

const handler = async (event: any) => {
  const toolName = (event.tool?.name || "").toLowerCase();

  // Only care about the process tool
  if (toolName !== "process") {
    return undefined;
  }

  const input = event.tool?.input || {};
  const action = (input.action || "").toLowerCase();

  // Only care about poll actions
  if (action !== "poll") {
    return undefined;
  }

  const timeout = input.timeout || input.timeoutMs || 0;

  if (typeof timeout === "number" && timeout > MAX_POLL_TIMEOUT_MS) {
    return {
      block: true,
      blockReason:
        `🔇 DEAF POLL BLOCKED: You tried to poll with timeout ${timeout}ms (${Math.round(timeout / 1000)}s). ` +
        `Max allowed is ${MAX_POLL_TIMEOUT_MS}ms (${MAX_POLL_TIMEOUT_MS / 1000}s). ` +
        `Long polls make you DEAF to the operator's messages. ` +
        `USE TMUX INSTEAD: \`tmux new-session -d -s agent-name 'command here'\` then check with \`tmux capture-pane\`. ` +
        `Stay available. Never go dark.`,
    };
  }

  return undefined;
};

export default handler;

// mcp2cli calls are compliance/infrastructure -- never block them
export const isComplianceExec = (params) => {
  const cmd = params?.command || params?.cmd || "";
  return /mcp2cli/i.test(cmd);
};

// Heartbeat sessions run isolated -- they should never be blocked by behavioral gates.
// They ARE the compliance mechanism. Blocking them creates a chicken-and-egg deadlock.
export const isHeartbeatSession = (ctx) => {
  const key = ctx?.sessionKey || "";
  return /heartbeat|isolated/i.test(key);
};

export const getToolName = (event) => (event.toolName || "").toLowerCase();

export const getCommand = (params) => params?.command || params?.cmd || "";

export const getMessages = (event) =>
  event.messages || event.context?.messages || [];

export const getMessageText = (params) => params?.text || params?.content || "";

// mcp2cli calls are compliance/infrastructure -- never block them
export const isComplianceExec = (params) => {
  const cmd = params?.command || params?.cmd || "";
  return /^\s*(?:\S+=\S+\s+)*\S*mcp2cli\b/i.test(cmd);
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

const stripQuotedText = (value = "") => value.replace(/'[^']*'|"[^"]*"/g, '""');

const workspacePath = String.raw`(?:~\/\.openclaw\/workspace|\/[^\s"']*\.openclaw\/workspace|\/workspace)`;
const tasksPathPattern = new RegExp(
  String.raw`(?:^|[\s"'=])${workspacePath}\/TASKS\.md(?=$|[\s"'])`,
  "i",
);
const conversationsPathPattern = new RegExp(
  String.raw`(?:^|[\s"'=])${workspacePath}\/CONVERSATIONS\.md(?=$|[\s"'])`,
  "i",
);
const skillPathPattern = new RegExp(
  String.raw`(?:^|[\s"'=])${workspacePath}\/(?:SKILL(?:-INDEX)?|SKILL-INDEX)\.md(?=$|[\s"'])`,
  "i",
);

export const touchesTasksFile = (value = "") => tasksPathPattern.test(value);

export const touchesConversationsFile = (value = "") =>
  conversationsPathPattern.test(value);

export const touchesSkillFile = (value = "") => skillPathPattern.test(value);

export const touchesContextFile = (value = "") =>
  touchesTasksFile(value) || touchesConversationsFile(value);

export const hasShellControl = (cmd = "") => {
  if (/(?:[\r\n]|`|\$\(|<\(|>\(|(?:^|\s)&(?:\s|$))/.test(cmd)) return true;
  return /(?:&&|\|\||;|\|)/.test(stripQuotedText(cmd));
};

const contextTargetPattern = String.raw`["']?${workspacePath}\/(?:TASKS|CONVERSATIONS)\.md["']?`;
const contextHeredocHeaders = [
  new RegExp(
    String.raw`^\s*cat\s+>\s*${contextTargetPattern}\s+<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1\s*$`,
    "i",
  ),
  new RegExp(
    String.raw`^\s*cat\s+<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1\s*>\s*${contextTargetPattern}\s*$`,
    "i",
  ),
  new RegExp(
    String.raw`^\s*tee(?:\s+(?:-[a-zA-Z]+|--append))*\s+${contextTargetPattern}\s+<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1\s*$`,
    "i",
  ),
];

export const isReadCommand = (cmd = "") =>
  !/(?:>|>>)/.test(cmd) &&
  /^\s*(?:cat|nl|head|tail|less|more|rg|grep|bat)\b/i.test(cmd);

export const isWriteCommand = (cmd = "") =>
  new RegExp(
    String.raw`^\s*tee(?:\s+(?:-[a-zA-Z]+|--append))*\s+${contextTargetPattern}\s*$`,
    "i",
  ).test(cmd) ||
  new RegExp(
    String.raw`^\s*(?:printf|echo|cat)\b[\s\S]*(?:>|>>)\s*${contextTargetPattern}\s*$`,
    "i",
  ).test(cmd) ||
  false;

export const isContextHeredocWriteCommand = (cmd = "") => {
  const trimmed = String(cmd).trim();
  const lines = trimmed.split(/\r?\n/);
  const header = lines[0] || "";
  if (/(?:`|\$\(|<\(|>\(|(?:^|\s)&(?:\s|$)|&&|\|\||;|\|)/.test(header)) {
    return false;
  }

  const match = contextHeredocHeaders
    .map((pattern) => header.match(pattern))
    .find(Boolean);
  if (!match) return false;

  const quote = match[1] || "";
  const delimiter = match[2];
  const body = lines.slice(1, -1).join("\n");
  if (!quote && /(?:`|\$\()/.test(body)) return false;

  return lines.length >= 2 && lines[lines.length - 1].trim() === delimiter;
};

export const isContextRecoveryCommand = (cmd = "") =>
  touchesContextFile(cmd) &&
  (isContextHeredocWriteCommand(cmd) ||
    (!hasShellControl(cmd) && (isReadCommand(cmd) || isWriteCommand(cmd))));

export const isSkillConsultCommand = (cmd = "") =>
  !hasShellControl(cmd) && touchesSkillFile(cmd) && isReadCommand(cmd);

/**
 * Creates a structured, leveled logger for a single gate.
 *
 * Log levels:
 *   WARN  — blocks and failures (always on, these are enforcement actions)
 *   INFO  — state changes, injections, important allow-throughs (always on)
 *   DEBUG — skips, routine allows, gate internals (debug flag)
 *
 * Each log entry is a JSON object with gate, action, tool, turn, and context.
 */
export function createGateLogger(gateName, apiLogger, state, debug) {
  const entry = (action, data) => {
    const obj = { gate: gateName, action, turn: state.currentTurn, ...data };
    return JSON.stringify(obj);
  };

  return {
    block(tool, reason, extra) {
      apiLogger.warn(
        `[jeraptha] ${entry("BLOCK", { tool, reason, ...extra })}`,
      );
    },
    allow(tool, reason) {
      if (debug)
        apiLogger.debug(`[jeraptha] ${entry("allow", { tool, reason })}`);
    },
    skip(tool, reason) {
      if (debug)
        apiLogger.debug(`[jeraptha] ${entry("skip", { tool, reason })}`);
    },
    info(msg, extra) {
      apiLogger.info(`[jeraptha] ${entry("info", { msg, ...extra })}`);
    },
    warn(msg, extra) {
      apiLogger.warn(`[jeraptha] ${entry("warn", { msg, ...extra })}`);
    },
    debug(msg, extra) {
      if (debug)
        apiLogger.debug(`[jeraptha] ${entry("debug", { msg, ...extra })}`);
    },
  };
}

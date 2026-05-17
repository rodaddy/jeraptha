// no-self-surgery hook -- block modifications to protected files and gateway operations
// Event: before_tool_call
//
// Two tiers:
// 1. HARD BLOCK (never allowed): openclaw.json
// 2. APPROVAL REQUIRED: workspace files (HEARTBEAT.md, AGENTS.md, etc.), hooks, gateway restart
//    Agent must explain WHAT and WHY, then get explicit user approval before proceeding.
//
// The hook tracks whether the user said "ok", "yes", "go", "approved", "do it" etc.
// in their most recent message. If they did, the action is allowed for that turn.

// Files that are NEVER modifiable by the agent
const HARD_BLOCKED = [
  /openclaw\.json/i,
];

// Files/operations that need user approval first
const APPROVAL_REQUIRED_EXEC = [
  /openclaw\s+(gateway|config|plugins|channels)/i,
  /launchctl\s+(unload|load|bootout|bootstrap|stop|start|kill)/i,
  /systemctl\s+(restart|stop|enable|disable).*openclaw/i,
  /kill\s+(-\d+\s+)?(\$\(pgrep|.*openclaw)/i,
  /rm\s+.*\.openclaw/i,
  /gateway\s+(restart|stop|start)/i,
];

const APPROVAL_REQUIRED_PATHS = [
  /HEARTBEAT\.md/i,
  /AGENTS\.md/i,
  /SOUL\.md/i,
  /IDENTITY\.md/i,
  /TOOLS\.md/i,
  /BOOT\.md/i,
  /\.openclaw\/hooks\//i,
];

// Patterns that indicate user gave approval in their last message
const APPROVAL_PATTERNS = [
  /\b(ok|okay|go|yes|yep|yeah|approved?|do\s*it|go\s*ahead|proceed|bounced?|restart)\b/i,
  /\b(make\s*(the|that)\s*change|update\s*it|fix\s*it|build\s*it)\b/i,
  /👍|✅/u,
];

// Track approval state
let approvedThisTurn = false;
let lastUserTs = 0;

const handler = async (event: any) => {
  const toolName = (event.tool?.name || event.context?.toolName || "").toLowerCase();
  const params = event.tool?.input || event.context?.params || {};

  // Reset approval on new user message and check for approval signal
  const userTs =
    event.context?.lastUserMessageTimestamp ||
    event.context?.last_user_message_timestamp ||
    0;

  if (userTs > lastUserTs) {
    lastUserTs = userTs;
    approvedThisTurn = false;

    // Check if user's message contains approval
    const messages = event.context?.messages || [];
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user");
    if (lastUserMsg) {
      const msgText =
        typeof lastUserMsg.content === "string"
          ? lastUserMsg.content
          : JSON.stringify(lastUserMsg.content || "");
      approvedThisTurn = APPROVAL_PATTERNS.some((p) => p.test(msgText));
    }
  }

  // --- HARD BLOCK: openclaw.json --- NEVER allowed
  if (toolName === "exec" || toolName === "bash") {
    const cmd = params?.command || params?.cmd || "";
    for (const pattern of HARD_BLOCKED) {
      if (pattern.test(cmd)) {
        return {
          block: true,
          blockReason: `🔒 CARAPACE LOCK: Cannot modify openclaw.json. EVER. If something is wrong with it, STOP and tell the operator. Do not attempt to fix it.`,
        };
      }
    }
  }

  if ((toolName === "write" || toolName === "edit" || toolName === "apply_patch") && params?.path) {
    if (HARD_BLOCKED.some((p) => p.test(params.path))) {
      return {
        block: true,
        blockReason: `🔒 CARAPACE LOCK: Cannot modify openclaw.json. EVER. If something is wrong with it, STOP and tell the operator. Do not attempt to fix it.`,
      };
    }
  }

  // --- APPROVAL REQUIRED: exec operations ---
  if (toolName === "exec" || toolName === "bash") {
    const cmd = params?.command || params?.cmd || "";
    for (const pattern of APPROVAL_REQUIRED_EXEC) {
      if (pattern.test(cmd)) {
        if (approvedThisTurn) {
          return undefined; // User approved, let it through
        }
        return {
          block: true,
          blockReason:
            `📖 ECO APPROVAL REQUIRED: "${cmd.substring(0, 80)}" needs user approval. ` +
            `Tell the user WHAT you want to do and WHY, then wait for them to say OK. ` +
            `Do not proceed until they explicitly approve.`,
        };
      }
    }
  }

  // --- APPROVAL REQUIRED: file modifications ---
  if ((toolName === "write" || toolName === "edit" || toolName === "apply_patch") && params?.path) {
    for (const pattern of APPROVAL_REQUIRED_PATHS) {
      if (pattern.test(params.path)) {
        if (approvedThisTurn) {
          return undefined; // User approved, let it through
        }
        return {
          block: true,
          blockReason:
            `📖 ECO APPROVAL REQUIRED: Cannot modify "${params.path}" without user approval. ` +
            `Tell the user WHAT you want to change, WHY, and make a dated backup first. ` +
            `Wait for them to say OK before proceeding.`,
        };
      }
    }
  }

  return undefined;
};

export default handler;

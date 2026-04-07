// sop-gate hook -- HARD BLOCK process-driven work without SOP check
// Event: before_tool_call
//
// Process-driven patterns detected:
// - exec calls containing: deploy, git push, git merge, gh pr, workflow_dispatch
// - sessions_spawn calls (agent spawning)
// - exec calls with migration/schema keywords
//
// Must have searched OB for SOPs first (mcp2cli open-brain search with "SOP" in query)

// Track whether SOP was searched this turn
let sopSearchedThisTurn = false;
let lastUserTs = 0;

// Patterns that indicate process-driven work
const PROCESS_PATTERNS = [
  /\bgit\s+(push|merge|rebase|checkout\s+-b)\b/i,
  /\bgh\s+(pr|issue)\s+(create|merge)\b/i,
  /\bworkflow.dispatch\b/i,
  /\bdeploy/i,
  /\bmigrat(e|ion)/i,
  /\bschema\s+(change|alter|drop|create)\b/i,
  /\bdrizzle\s+(push|generate)\b/i,
  /\bswarm/i,
];

// Patterns that indicate SOP search
const SOP_SEARCH_PATTERNS = [
  /sop/i,
  /standard.operating.procedure/i,
];

const handler = async (event: any) => {
  const toolName = (event.tool?.name || "").toLowerCase();
  const input = event.tool?.input || {};

  // Reset on new user message
  const userTs =
    event.context?.lastUserMessageTimestamp ||
    event.context?.last_user_message_timestamp ||
    0;
  if (userTs > lastUserTs) {
    lastUserTs = userTs;
    sopSearchedThisTurn = false;
  }

  // Track SOP searches -- mcp2cli open-brain with "SOP" in the query
  if (toolName === "exec") {
    const cmd = input.command || "";
    if (
      /mcp2cli\s+open-brain/i.test(cmd) &&
      SOP_SEARCH_PATTERNS.some((p) => p.test(cmd))
    ) {
      sopSearchedThisTurn = true;
      return undefined;
    }
  }

  // Also count memory_search with SOP in query
  if (toolName === "memory_search") {
    const query = input.query || "";
    if (SOP_SEARCH_PATTERNS.some((p) => p.test(query))) {
      sopSearchedThisTurn = true;
      return undefined;
    }
  }

  // Check if this is a process-driven operation
  if (toolName === "sessions_spawn") {
    // Agent spawning always needs SOP check
    if (!sopSearchedThisTurn) {
      return {
        block: true,
        blockReason:
          "📖 SOP GATE: You are spawning an agent without checking for an SOP first. " +
          "Run: ~/.local/bin/mcp2cli open-brain search_brain --params " +
          "'{\"query\":\"SOP agent spawn\",\"limit\":5}' BEFORE spawning. " +
          "If no SOP exists, note it and proceed. But CHECK FIRST.",
      };
    }
  }

  if (toolName === "exec") {
    const cmd = input.command || "";
    const isProcessWork = PROCESS_PATTERNS.some((p) => p.test(cmd));

    if (isProcessWork && !sopSearchedThisTurn) {
      // Detect what kind of process work
      let taskType = "this operation";
      if (/deploy/i.test(cmd)) taskType = "deployment";
      if (/git\s+(push|merge)/i.test(cmd)) taskType = "git workflow";
      if (/gh\s+pr/i.test(cmd)) taskType = "PR creation";
      if (/migrat/i.test(cmd)) taskType = "migration";
      if (/schema/i.test(cmd)) taskType = "schema change";
      if (/swarm/i.test(cmd)) taskType = "code swarm";

      return {
        block: true,
        blockReason:
          `📖 SOP GATE: You are about to do ${taskType} without checking for an SOP. ` +
          `Run: ~/.local/bin/mcp2cli open-brain search_brain --params ` +
          `'{"query":"SOP ${taskType}","limit":5}' BEFORE proceeding. ` +
          `If an SOP exists, FOLLOW IT. If none exists, proceed and consider creating one.`,
      };
    }
  }

  return undefined;
};

export default handler;

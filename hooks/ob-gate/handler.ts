// ob-gate hook -- HARD BLOCK agent from asking questions without checking OB first
// Event: before_tool_call
// Blocks message sends that look like factual questions unless OB was queried first

const QUESTION_PATTERNS = [
  /what('s| is) the (ip|port|version|password|url|path|config|name|id|key)/i,
  /where (is|are|can I find|do I|does)/i,
  /do you (know|have|remember)/i,
  /can you (tell me|remind me)/i,
  /what (was|were|did)/i,
  /how (do|does|did|is|are)/i,
  /which (one|version|server|port|ip|config)/i,
  /anyone know/i,
  /does anyone/i,
];

// Patterns that are exempt -- confirmations, preferences, not factual lookups
const EXEMPT_PATTERNS = [
  /\bshould (I|we)\b/i,
  /\bdo you want\b/i,
  /\bwould you (like|prefer)\b/i,
  /\bshall (I|we)\b/i,
  /\bproceed\b/i,
  /\bready\b/i,
  /\bgood\?/i,
  /\bcool\?/i,
  /\bsound good\b/i,
  /\bwhat do you think\b/i,
  /\bwhat('s| is) next\b/i,
  /\bwhat.*work on\b/i,
];

let obQueriedThisTurn = false;
let turnCounter = 0;

const handler = async (event: any) => {
  const toolName = event.tool?.name || "";
  const toolInput = JSON.stringify(event.tool?.input || {});

  // If this is an exec call to mcp2cli open-brain, mark OB as queried
  if (toolName === "exec" && toolInput.includes("open-brain")) {
    obQueriedThisTurn = true;
    return undefined;
  }

  // If this is a memory_search call, also counts
  if (toolName === "memory_search") {
    obQueriedThisTurn = true;
    return undefined;
  }

  // If this is a message send, check if it looks like a factual question
  if (toolName === "message") {
    const messageText = event.tool?.input?.text || event.tool?.input?.content || "";

    // Check exempt patterns first -- these are OK without OB
    const isExempt = EXEMPT_PATTERNS.some((pattern) => pattern.test(messageText));
    if (isExempt) return undefined;

    const isQuestion = QUESTION_PATTERNS.some((pattern) => pattern.test(messageText));

    if (isQuestion && !obQueriedThisTurn) {
      // HARD BLOCK -- do not send the message
      return {
        block: true,
        blockReason:
          "OB GATE VIOLATION: You are about to ask the operator a factual question without checking Open Brain first. " +
          "Run: ~/.local/bin/mcp2cli open-brain search_all --params '{\"query\": \"your question\"}' FIRST. " +
          "If OB doesn't have the answer, THEN ask the operator and mention you checked.",
      };
    }
  }

  // Reset OB query flag periodically (approximate turn boundary)
  if (turnCounter++ % 10 === 0) {
    obQueriedThisTurn = false;
  }

  return undefined;
};

export default handler;

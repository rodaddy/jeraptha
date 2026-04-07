// sentiment-tracker hook -- detect user praise/anger and log to SCORECARD.md
// Event: before_prompt_build
//
// Monitors user messages for sentiment signals and auto-logs behavioral feedback.
// Natural reactions become structured reinforcement.

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const WORKSPACE =
  process.env.OPENCLAW_WORKSPACE ||
  join(process.env.HOME || "", ".openclaw/workspace");
const SCORECARD_PATH = join(WORKSPACE, "SCORECARD.md");

// Positive signals (user is happy)
const POSITIVE_PATTERNS = [
  { pattern: /\b(nice|good\s*job|perfect|excellent|great|awesome|love\s*it|nailed\s*it)\b/i, weight: 2, label: "praise" },
  { pattern: /\b(thanks|thank\s*you|appreciate|helpful)\b/i, weight: 1, label: "gratitude" },
  { pattern: /\b(yes|yep|yeah|correct|exactly|right)\b/i, weight: 1, label: "confirmation" },
  { pattern: /👍|👏|🎉|💪|🔥|✅/u, weight: 2, label: "positive-emoji" },
  { pattern: /\b(on\s*it|crushing\s*it|killing\s*it)\b/i, weight: 3, label: "strong-praise" },
];

// Negative signals (user is frustrated/angry)
const NEGATIVE_PATTERNS = [
  { pattern: /\b(wtf|what\s*the\s*(fuck|hell)|are\s*you\s*(serious|kidding))\b/i, weight: -3, label: "anger" },
  { pattern: /\b(dumb|stupid|wrong|broken|bad|terrible|awful)\b/i, weight: -2, label: "criticism" },
  { pattern: /\b(stop|no|don't|quit|enough)\b/i, weight: -1, label: "correction" },
  { pattern: /\b(why\s*(did|would|are)\s*you|what\s*happened|where\s*(are|were)\s*you)\b/i, weight: -2, label: "accountability" },
  { pattern: /\b(again|keeps?\s*happening|every\s*time|how\s*many\s*times)\b/i, weight: -3, label: "repeated-failure" },
  { pattern: /\b(shit\s*show|flaky|lazy|half[- ]?ass)\b/i, weight: -3, label: "strong-criticism" },
  { pattern: /😤|😡|🤦|💀|👎/u, weight: -2, label: "negative-emoji" },
];

// Track last processed message to avoid duplicates
let lastProcessedMsg = "";

const handler = async (event: any) => {
  // Get the latest user message
  const messages = event.context?.messages || [];
  const lastUserMsg = [...messages]
    .reverse()
    .find((m: any) => m.role === "user");

  if (!lastUserMsg) return undefined;

  const msgText =
    typeof lastUserMsg.content === "string"
      ? lastUserMsg.content
      : JSON.stringify(lastUserMsg.content || "");

  // Skip if already processed
  if (msgText === lastProcessedMsg) return undefined;
  lastProcessedMsg = msgText;

  // Score the message
  let totalWeight = 0;
  const triggers: string[] = [];

  for (const { pattern, weight, label } of POSITIVE_PATTERNS) {
    if (pattern.test(msgText)) {
      totalWeight += weight;
      triggers.push(`+${weight} ${label}`);
    }
  }

  for (const { pattern, weight, label } of NEGATIVE_PATTERNS) {
    if (pattern.test(msgText)) {
      totalWeight += weight; // weight is already negative
      triggers.push(`${weight} ${label}`);
    }
  }

  // Only act if there's a clear signal (threshold: abs >= 2)
  if (Math.abs(totalWeight) < 2) return undefined;

  // Generate verbal feedback
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const sentiment = totalWeight > 0 ? "POSITIVE" : "NEGATIVE";
  const emoji = totalWeight > 0 ? "✅" : "❌";
  const triggerStr = triggers.join(", ");

  // Build the scorecard entry
  const entry = `\n- [${timestamp}] ${emoji} ${sentiment} (${totalWeight > 0 ? "+" : ""}${totalWeight}) | Triggers: ${triggerStr} | Message: "${msgText.slice(0, 100)}"`;

  // Append to SCORECARD.md
  try {
    if (existsSync(SCORECARD_PATH)) {
      const current = readFileSync(SCORECARD_PATH, "utf-8");

      // Find the "## Recent Feedback" section and append
      if (current.includes("## Recent Feedback")) {
        const parts = current.split("## Recent Feedback");
        const updated =
          parts[0] +
          "## Recent Feedback" +
          entry +
          parts[1];
        writeFileSync(SCORECARD_PATH, updated, "utf-8");
      } else {
        // Append at end
        writeFileSync(
          SCORECARD_PATH,
          current + "\n## Recent Feedback" + entry + "\n",
          "utf-8"
        );
      }
    }
  } catch {
    // Scorecard write failed -- don't block the agent
  }

  // Update running score
  try {
    if (existsSync(SCORECARD_PATH)) {
      const content = readFileSync(SCORECARD_PATH, "utf-8");
      const scoreMatch = content.match(/Current Score:\s*(-?\d+)/);
      const currentScore = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
      const newScore = currentScore + totalWeight;
      const updated = content.replace(
        /Current Score:\s*-?\d+/,
        `Current Score: ${newScore}`
      );
      writeFileSync(SCORECARD_PATH, updated, "utf-8");
    }
  } catch {
    // Score update failed -- non-critical
  }

  // Inject verbal feedback into prompt if negative
  if (totalWeight < -2) {
    const verbalFeedback = `
## ⚠️ BEHAVIORAL ALERT
User just expressed ${sentiment.toLowerCase()} sentiment (score: ${totalWeight}).
Triggers: ${triggerStr}
Message: "${msgText.slice(0, 200)}"

**What to do:** Acknowledge the feedback. Do not deflect. If you made an error, own it specifically. Check SCORECARD.md for patterns -- is this a repeated issue?
`;
    return {
      prompt: (event.context?.prompt || "") + "\n\n" + verbalFeedback,
    };
  }

  return undefined;
};

export default handler;

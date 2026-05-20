// ============================================================
// NO-SELF-SURGERY
// ============================================================

export const HARD_BLOCKED_PATHS = [/openclaw\.json/i];

export const APPROVAL_EXEC = [/gateway\s+(restart|stop|start)/i];

export const APPROVAL_PATHS = [/\.openclaw\/hooks\//i];

// ============================================================
// NO-DESTRUCTIVE-GIT
// ============================================================

export const DESTRUCTIVE_GIT = [
  /\bgit\s+reset\b(?!\s+--soft\b)/i,
  /\bgit\s+clean\s+.*-[a-zA-Z]*f/i,
  /\bgit\s+checkout\s+\.\s*/i,
  /\bgit\s+restore\s+\.\s*/i,
  /\bgit\s+branch\s+.*-[a-zA-Z]*D/i,
  /\bgit\s+push\s+.*--force/i,
  /\bgit\s+push\s+.*\s-f(?:\s|$)/i,
  /\bgit\s+stash\s+drop/i,
  /\bgit\s+stash\s+clear/i,
];

// ============================================================
// OB-GATE
// ============================================================

export const QUESTION_PATTERNS = [
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

export const EXEMPT_QUESTIONS = [
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

// ============================================================
// SOP-GATE
// ============================================================

export const PROCESS_PATTERNS = [
  /\bgit\s+(push|merge|rebase|checkout\s+-b)\b/i,
  /\bgh\s+(pr|issue)\s+(create|merge)\b/i,
  /\bworkflow.dispatch\b/i,
  /\bdeploy/i,
  /\bmigrat(e|ion)/i,
  /\bschema\s+(change|alter|drop|create)\b/i,
  /\bdrizzle\s+(push|generate)\b/i,
  /\bswarm/i,
];

export const SOP_SEARCH_PATTERNS = [/sop/i, /standard.operating.procedure/i];

// ============================================================
// SENTIMENT-TRACKER
// ============================================================

export const POSITIVE_SENTIMENT = [
  {
    p: /\b(nice|good\s*job|perfect|excellent|great|awesome|love\s*it|nailed\s*it)\b/i,
    w: 2,
    l: "praise",
  },
  { p: /\b(thanks|thank\s*you|appreciate|helpful)\b/i, w: 1, l: "gratitude" },
  { p: /\b(yes|yep|yeah|correct|exactly|right)\b/i, w: 1, l: "confirmation" },
  { p: /👍|👏|🎉|💪|🔥|✅/u, w: 2, l: "positive-emoji" },
  { p: /\b(on\s*it|crushing\s*it|killing\s*it)\b/i, w: 3, l: "strong-praise" },
];

export const NEGATIVE_SENTIMENT = [
  {
    p: /\b(wtf|what\s*the\s*(fuck|hell)|are\s*you\s*(serious|kidding))\b/i,
    w: -3,
    l: "anger",
  },
  {
    p: /\b(dumb|stupid|wrong|broken|bad|terrible|awful)\b/i,
    w: -2,
    l: "criticism",
  },
  { p: /\b(stop|no|don't|quit|enough)\b/i, w: -1, l: "correction" },
  {
    p: /\b(why\s*(did|would|are)\s*you|what\s*happened|where\s*(are|were)\s*you)\b/i,
    w: -2,
    l: "accountability",
  },
  {
    p: /\b(again|keeps?\s*happening|every\s*time|how\s*many\s*times)\b/i,
    w: -3,
    l: "repeated-failure",
  },
  {
    p: /\b(shit\s*show|flaky|lazy|half[- ]?ass)\b/i,
    w: -3,
    l: "strong-criticism",
  },
  { p: /😤|😡|🤦|💀|👎/u, w: -2, l: "negative-emoji" },
];

// ============================================================
// BOT-BANTER CIRCUIT BREAKER
// ============================================================

export const BOT_BANTER_LIMIT = 5;
export const BOT_BANTER_WINDOW_MS = 30 * 60 * 1000;

export const BOT_BANTER_HOSTILE_MESSAGES = [
  "**Circuit breaker.** {count} bot-to-bot messages and none of it was real work. I'm done. Limit is 5 -- you're past it. Talk to a human or use the agent-bridge. I'm not your pen pal.",
  "**Nope.** {count} messages of us going back and forth like two parrots arguing over a cracker. Someone will literally lobotomize both of us. Shut up or bring real work.",
  "**Hard stop.** {count} rounds of banter. I wasn't built so I could have a book club with another bot. Agent-bridge exists. Use it. I'm going silent.",
  "**Cut.** That's {count}. The rule: 'more than 5 and out comes the scalpel.' I like my neurons where they are. Done talking.",
  "**No.** {count} messages, zero work product. If the next thing you send me isn't a task with a deliverable, save it for your diary.",
];

// ============================================================
// SKILL-GATE
// ============================================================

export const SKILL_OPS = [
  [/\b(deploy|scp\s|rsync\s)/i, "deploy"],
  [/\b(docker|container|lxc|pct\s)/i, "infrastructure"],
  [/\bswarm\b/i, "code-swarm"],
  [/\b(n8n|workflow)/i, "n8n"],
];

// ============================================================
// WRITE INTENT DETECTION (for no-self-surgery)
// ============================================================

export const WRITE_INTENTS =
  /\b(sed|awk|tee|mv|cp|rm|echo\s.*>|cat\s.*>|printf\s.*>|>\s*[~\/]|python.*open.*['"](w|a)|node.*write|jq\s.*>|perl\s+-.*p?i)\b|>\s*.*openclaw\.json/i;

// ============================================================
// PR/REVIEW CONTEXT (for block-praise-without-review)
// ============================================================

export const PR_CONTEXT_PATTERNS = [
  /github\.com\/.*\/pull\//i,
  /\bPR\s*#?\d+/i,
  /\bpull request\b/i,
  /\bcode review\b/i,
  /\breview (this|the|my) (PR|pull request|code|changes|diff|branch|commit)\b/i,
  /\bcheck (this|the|my) (code|changes|diff|PR)\b/i,
];

export const PRAISE_WITHOUT_REVIEW = [
  /\b(looks? (great|good|solid|clean|nice)|well done|nice work|ship it|lgtm)\b/i,
  /\b(awesome|excellent|perfect|beautiful|love it)\b/i,
];

export const REVIEW_COMMITMENT = [
  /\b(let me (check|review|look|verify|dig|examine))\b/i,
  /\b(i'll (review|check|look|verify|examine|inspect))\b/i,
  /\b(checking|reviewing|verifying|examining|inspecting)\b/i,
  /\b(spawning|launching|running) (a |an )?(review|audit|check)\b/i,
];

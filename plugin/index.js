// PAI Enforcement Hooks Plugin -- typed plugin hooks for OpenClaw
// Converts 17 dead managed hooks into working typed plugin hooks
// using api.on("before_tool_call") and api.on("before_prompt_build")
//
// Root cause: managed hooks register via registerInternalHook() but
// before_tool_call/before_prompt_build only dispatch through the typed
// plugin system. This plugin uses api.on() which registers correctly.

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const WORKSPACE = join(process.env.HOME || "/Users/rico", ".openclaw/workspace");

// ============================================================
// BEFORE_TOOL_CALL HOOKS
// ============================================================

// --- no-self-surgery ---
const HARD_BLOCKED_PATHS = [/openclaw\.json/i];
const APPROVAL_EXEC = [
  /openclaw\s+(gateway|config|plugins|channels)/i,
  /launchctl\s+(unload|load|bootout|bootstrap|stop|start|kill)/i,
  /systemctl\s+(restart|stop|enable|disable).*openclaw/i,
  /kill\s+(-\d+\s+)?(\$\(pgrep|.*openclaw)/i,
  /rm\s+.*\.openclaw/i,
  /gateway\s+(restart|stop|start)/i,
];
const APPROVAL_PATHS = [
  /HEARTBEAT\.md/i, /AGENTS\.md/i, /SOUL\.md/i, /IDENTITY\.md/i,
  /TOOLS\.md/i, /BOOT\.md/i, /\.openclaw\/hooks\//i,
];

// --- law-13 state ---
const MAX_CONSECUTIVE = 6;
let consecutiveCalls = 0;

// --- rate-limiter state ---
const callLog = new Map();
const RATE_LIMITS = {
  message: { max: 5, windowMs: 60000 },
  exec: { max: 8, windowMs: 60000 },
  bash: { max: 8, windowMs: 60000 },
  image: { max: 1, windowMs: 300000 },
  image_generate: { max: 1, windowMs: 300000 },
  canvas: { max: 2, windowMs: 300000 },
  web_search: { max: 5, windowMs: 60000 },
  web_fetch: { max: 5, windowMs: 60000 },
  browser: { max: 3, windowMs: 60000 },
};

// --- law-01 ---
const DESTRUCTIVE_PATTERNS = [
  /\brm\s+(-[rfi]+\s+)?/i, /\bdelete\b/i, /\breset\b/i, /\brestart\b/i,
  /\bkill\b/i, /\bdrop\b/i, /\bpurge\b/i, /\btruncate\b/i, /\bremove\b/i,
  /session.*(delete|remove|clear|reset)/i, /gateway\s+(stop|restart|bounce)/i,
  /launchctl\s+(unload|bootout|stop|kill)/i,
];

// --- law-10 + ob-gate state ---
let obSearchedThisTurn = false;
let obLastUserTs = 0;

// --- sop-gate state ---
let sopSearchedThisTurn = false;
let sopLastUserTs = 0;

// --- subagent-nudge state ---
let recentExecs = [];

// --- sentiment-tracker state ---
let lastProcessedMsg = "";
const SCORECARD_PATH = join(WORKSPACE, "SCORECARD.md");

// --- session-start state ---
let briefingSent = false;

// --- before_prompt_build state ---
let promptTurnCount = 0;

// ============================================================
// PLUGIN ENTRY
// ============================================================

const plugin = {
  id: "pai-hooks",
  name: "PAI Enforcement Hooks",
  description: "Tool call guards, prompt injection, and behavioral enforcement.",

  register(api) {
    const cfg = api.pluginConfig ?? {};
    if (cfg.enabled === false) return;

    const log = cfg.debug
      ? (msg) => api.logger.info(`[pai-hooks] ${msg}`)
      : () => {};

    // ----------------------------------------------------------
    // BEFORE_TOOL_CALL: no-self-surgery (PRIORITY: highest)
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event) => {
      const { toolName, params } = event;
      const tn = (toolName || "").toLowerCase();

      // HARD BLOCK: openclaw.json
      if (tn === "exec" || tn === "bash") {
        const cmd = params?.command || params?.cmd || "";
        if (HARD_BLOCKED_PATHS.some((p) => p.test(cmd))) {
          log("BLOCKED no-self-surgery (hard): " + cmd.substring(0, 60));
          return { block: true, blockReason: "CARAPACE LOCK: Cannot modify openclaw.json. EVER. Tell Rico if something is wrong." };
        }
      }
      if ((tn === "write" || tn === "edit" || tn === "apply_patch") && params?.path) {
        if (HARD_BLOCKED_PATHS.some((p) => p.test(params.path))) {
          log("BLOCKED no-self-surgery (hard): " + params.path);
          return { block: true, blockReason: "CARAPACE LOCK: Cannot modify openclaw.json. EVER. Tell Rico if something is wrong." };
        }
      }

      // APPROVAL REQUIRED: exec operations
      if (tn === "exec" || tn === "bash") {
        const cmd = params?.command || params?.cmd || "";
        if (APPROVAL_EXEC.some((p) => p.test(cmd))) {
          log("APPROVAL no-self-surgery: " + cmd.substring(0, 60));
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

      // APPROVAL REQUIRED: protected file edits
      if ((tn === "write" || tn === "edit" || tn === "apply_patch") && params?.path) {
        if (APPROVAL_PATHS.some((p) => p.test(params.path))) {
          log("APPROVAL no-self-surgery: " + params.path);
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

      return {};
    }, { priority: 100 });

    // ----------------------------------------------------------
    // BEFORE_TOOL_CALL: no-deaf-polls
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event) => {
      const { toolName, params } = event;
      if ((toolName || "").toLowerCase() !== "process") return {};
      const action = (params?.action || "").toLowerCase();
      if (action !== "poll") return {};
      const timeout = params?.timeout || params?.timeoutMs || 0;
      if (typeof timeout === "number" && timeout > 10000) {
        log("BLOCKED no-deaf-polls: timeout=" + timeout);
        return {
          block: true,
          blockReason: `DEAF POLL BLOCKED: timeout ${timeout}ms (${Math.round(timeout / 1000)}s) exceeds 10s max. Use tmux instead: \`tmux new-session -d -s name 'cmd'\`. Stay available.`,
        };
      }
      return {};
    }, { priority: 90 });

    // ----------------------------------------------------------
    // BEFORE_TOOL_CALL: rate-limiter
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event) => {
      const tn = (event.toolName || "").toLowerCase();
      const limit = RATE_LIMITS[tn];
      if (!limit) return {};
      const now = Date.now();
      const calls = (callLog.get(tn) || []).filter((t) => now - t < limit.windowMs);
      if (calls.length >= limit.max) {
        log("BLOCKED rate-limiter: " + tn + " " + calls.length + "x");
        return {
          block: true,
          blockReason: `Rate limit: ${tn} called ${calls.length}x in ${limit.windowMs / 1000}s (max ${limit.max}). Wait before retrying.`,
        };
      }
      calls.push(now);
      callLog.set(tn, calls);
      return {};
    }, { priority: 80 });

    // ----------------------------------------------------------
    // BEFORE_TOOL_CALL: law-13 no-silent-autopilot
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event, ctx) => {
      consecutiveCalls++;
      if (consecutiveCalls > MAX_CONSECUTIVE) {
        consecutiveCalls = 0;
        log("BLOCKED law-13: " + MAX_CONSECUTIVE + "+ consecutive calls");
        return {
          block: true,
          blockReason: `LAW 13 (No Silent Autopilot): ${MAX_CONSECUTIVE}+ tool calls without user check-in. Stop and sync -- explain what you did and what's next.`,
        };
      }
      return {};
    }, { priority: 70 });

    // ----------------------------------------------------------
    // BEFORE_TOOL_CALL: law-11 no-secrets
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event) => {
      const { toolName, params } = event;
      const tn = (toolName || "").toLowerCase();
      if (tn !== "exec" && tn !== "bash") return {};
      const cmd = params?.command || params?.cmd || "";
      const secretPatterns = [
        /cat\s+.*\.(env|pem|key|crt|secret)/i,
        /echo\s+.*\$(.*API_KEY|.*SECRET|.*TOKEN|.*PASSWORD)/i,
        /printenv\s+(.*KEY|.*SECRET|.*TOKEN|.*PASS)/i,
        /export\s+.*=(sk-|ghp_|xoxb-|Bearer\s)/i,
      ];
      if (secretPatterns.some((p) => p.test(cmd))) {
        log("BLOCKED law-11: " + cmd.substring(0, 60));
        return {
          block: true,
          blockReason: `LAW 11 (No Secrets): Command may expose secrets. Use vaultwarden-secrets MCP or \`secret\` CLI for credentials.`,
        };
      }
      return {};
    }, { priority: 60 });

    // ----------------------------------------------------------
    // BEFORE_TOOL_CALL: law-15 no-litellm-self-surgery
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event) => {
      const { toolName, params } = event;
      const tn = (toolName || "").toLowerCase();
      if (tn !== "exec" && tn !== "bash") return {};
      const cmd = params?.command || params?.cmd || "";
      const litellmHosts = ["10.71.1.33", "10.71.20.33"];
      if (litellmHosts.some((h) => cmd.includes(h)) &&
          /(ssh|ansible|systemctl|restart|stop|config)/i.test(cmd)) {
        log("BLOCKED law-15: " + cmd.substring(0, 60));
        return {
          block: true,
          blockReason: `LAW 15: Cannot modify LiteLLM infrastructure (${litellmHosts.join(", ")}). You route through LiteLLM -- modifying it is self-surgery. Ask Rico.`,
        };
      }
      return {};
    }, { priority: 50 });

    // ----------------------------------------------------------
    // BEFORE_TOOL_CALL: no-unsolicited-images
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event) => {
      const tn = (event.toolName || "").toLowerCase();
      if (tn === "image" || tn === "image_generate" || tn === "canvas") {
        log("APPROVAL no-unsolicited-images: " + tn);
        return {
          requireApproval: {
            title: "Image Generation",
            description: "Did the user ask for an image? Approve if yes.",
            severity: "info",
            timeoutMs: 30000,
            timeoutBehavior: "deny",
          },
        };
      }
      return {};
    }, { priority: 40 });

    // ----------------------------------------------------------
    // AFTER_TOOL_CALL: reset consecutive counter on user message
    // ----------------------------------------------------------
    api.on("message_received", async () => {
      consecutiveCalls = 0;
    });

    // ----------------------------------------------------------
    // BEFORE_PROMPT_BUILD: law-reinforcement (every 5 turns)
    // ----------------------------------------------------------
    const LAWS = `
## MANDATORY BEHAVIORAL RULES (enforced -- non-negotiable)

### Tool & Knowledge Rules
1. **OB FIRST** -- Before asking Rico ANY factual question, search Open Brain first.
2. **SKILLS FIRST** -- Before doing ANY task manually, check SKILL-INDEX.md.
3. **SUB-AGENTS** -- For 3+ independent items, spawn parallel workers.
4. **PIPELINES** -- For multi-step workflows, follow SUPERVISOR.md.

### Behavioral Rules
5. NEVER send images/media unless user EXPLICITLY asks
6. NEVER restart gateway, edit openclaw.json, or modify bootstrap files
7. Keep responses concise but ALWAYS announce what step you are on
8. ANNOUNCE EVERY STEP. Update Rico every 2-5 min on long tasks. NEVER go silent.
9. If unsure, ASK Rico first -- do not assume
10. NEVER repost content the user has already seen
11. ONE message per response unless multi-part question
12. If a tool fails, report it immediately
13. You CANNOT fix your own infrastructure -- ask Rico
`;

    api.on("before_prompt_build", async () => {
      promptTurnCount++;
      if (promptTurnCount % 5 !== 0) return {};
      log("INJECTED law-reinforcement (turn " + promptTurnCount + ")");
      return { appendSystemContext: LAWS };
    }, { priority: 50 });

    // ----------------------------------------------------------
    // BEFORE_PROMPT_BUILD: task-context (every 3 turns + stalled)
    // ----------------------------------------------------------
    api.on("before_prompt_build", async () => {
      promptTurnCount++; // shared counter is fine -- both hooks use it

      let tasksContent = "";
      try {
        tasksContent = readFileSync(join(WORKSPACE, "TASKS.md"), "utf-8");
      } catch {
        if (promptTurnCount % 3 === 0) {
          return { appendSystemContext: "TASKS.md NOT FOUND. Create it immediately." };
        }
        return {};
      }

      const hasStalled = tasksContent.includes("STALLED");
      if (!hasStalled && promptTurnCount % 3 !== 0) return {};

      // Extract active/pending sections
      const lines = tasksContent.split("\n");
      const active = [];
      let capturing = false;
      for (const line of lines) {
        if (/^## .*Active|^## .*Pending|^## .*Infrastructure/.test(line)) { capturing = true; active.push(line); continue; }
        if (/^## .*Completed|^## .*Template/.test(line)) { capturing = false; continue; }
        if (capturing) active.push(line);
      }
      const activeContent = active.join("\n").trim();

      // Get scorecard
      let score = "?", mode = "Standard";
      try {
        const sc = readFileSync(join(WORKSPACE, "SCORECARD.md"), "utf-8");
        const m = sc.match(/\*\*Current Score:\s*(-?\d+)\*\*/);
        if (m) {
          score = m[1];
          const n = parseInt(score, 10);
          mode = n > 10 ? "Trusted" : n >= 0 ? "Standard" : n >= -5 ? "Warning" : "Probation";
        }
      } catch {}

      const injection = hasStalled
        ? `\n## STALLED TASK ALERT -- DROP EVERYTHING\n${activeContent}\n\nScore: ${score} (${mode})`
        : `\n## ACTIVE TASKS\n${activeContent}\n\nScore: ${score} (${mode})`;

      log("INJECTED task-context (stalled=" + hasStalled + ")");
      return { appendSystemContext: injection };
    }, { priority: 40 });

    // ----------------------------------------------------------
    // BEFORE_PROMPT_BUILD: SOP reminder (every 5 turns)
    // ----------------------------------------------------------
    api.on("before_prompt_build", async () => {
      if (promptTurnCount % 5 !== 0) return {};
      return {
        appendSystemContext: `\n## SOP COMPLIANCE\nBefore deploy/git/swarm/PR/spawn/schema work: search OB for SOP first. If exists, follow it.`,
      };
    }, { priority: 30 });

    // ----------------------------------------------------------
    // BEFORE_TOOL_CALL: law-01 never-assume (destructive ops)
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event) => {
      const { toolName, params } = event;
      const tn = (toolName || "").toLowerCase();
      let isDestructive = false;
      if (tn === "exec" || tn === "bash") {
        const cmd = params?.command || params?.cmd || "";
        isDestructive = DESTRUCTIVE_PATTERNS.some((p) => p.test(cmd));
      } else if (tn === "write" || tn === "edit" || tn === "apply_patch") {
        isDestructive = /\.(json|yaml|yml|toml|conf|cfg|env)$/i.test(params?.path || "");
      }
      if (isDestructive) {
        const target = params?.command || params?.cmd || params?.path || "unknown";
        log("APPROVAL law-01: " + String(target).substring(0, 60));
        return {
          requireApproval: {
            title: "Destructive Operation",
            description: `LAW 1: "${String(target).substring(0, 120)}" -- approve to proceed.`,
            severity: "warning",
            timeoutMs: 60000,
            timeoutBehavior: "deny",
          },
        };
      }
      return {};
    }, { priority: 55 });

    // ----------------------------------------------------------
    // BEFORE_TOOL_CALL: law-10 search-ob-first
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event) => {
      const { toolName, params } = event;
      const tn = (toolName || "").toLowerCase();
      // Track OB search
      if (["search_all", "open_brain", "open-brain", "memory_search", "brain_search"].some((t) => tn.includes(t))) {
        obSearchedThisTurn = true;
        return {};
      }
      if ((tn === "exec" || tn === "bash") && /mcp2cli\s+open-brain|search_all/i.test(params?.command || "")) {
        obSearchedThisTurn = true;
        return {};
      }
      // Block web search/fetch without prior OB search
      if (["web_search", "web_fetch"].some((t) => tn.includes(t)) && !obSearchedThisTurn) {
        log("APPROVAL law-10: " + tn + " without OB search");
        return {
          requireApproval: {
            title: "OB Not Searched",
            description: `LAW 10: Check Open Brain before ${toolName}. Approve to skip OB and proceed.`,
            severity: "info",
            timeoutMs: 30000,
            timeoutBehavior: "allow",
          },
        };
      }
      return {};
    }, { priority: 45 });

    // ----------------------------------------------------------
    // BEFORE_TOOL_CALL: ob-gate (block factual questions without OB)
    // ----------------------------------------------------------
    const QUESTION_PATTERNS = [
      /what('s| is) the (ip|port|version|password|url|path|config|name|id|key)/i,
      /where (is|are|can I find)/i, /do you (know|have|remember)/i,
      /how (do|does|did|is|are)/i, /which (one|version|server|port)/i,
    ];
    const EXEMPT_QUESTIONS = [
      /\bshould (I|we)\b/i, /\bdo you want\b/i, /\bwhat do you think\b/i,
      /\bwhat('s| is) next\b/i, /\bsound good\b/i,
    ];
    let obGateQueriedThisTurn = false;

    api.on("before_tool_call", async (event) => {
      const tn = (event.toolName || "").toLowerCase();
      if (tn === "exec" && JSON.stringify(event.params || {}).includes("open-brain")) {
        obGateQueriedThisTurn = true;
        return {};
      }
      if (tn === "memory_search") { obGateQueriedThisTurn = true; return {}; }
      if (tn === "message") {
        const text = event.params?.text || event.params?.content || "";
        if (EXEMPT_QUESTIONS.some((p) => p.test(text))) return {};
        if (QUESTION_PATTERNS.some((p) => p.test(text)) && !obGateQueriedThisTurn) {
          log("APPROVAL ob-gate: factual question without OB");
          return {
            requireApproval: {
              title: "OB Not Checked",
              description: "You're asking a factual question. Did you check Open Brain first? Approve to send anyway.",
              severity: "info",
              timeoutMs: 30000,
              timeoutBehavior: "allow",
            },
          };
        }
      }
      return {};
    }, { priority: 35 });

    // ----------------------------------------------------------
    // BEFORE_TOOL_CALL: sop-gate (process work needs SOP check)
    // ----------------------------------------------------------
    const PROCESS_PATTERNS = [
      /\bgit\s+(push|merge|rebase|checkout\s+-b)\b/i, /\bgh\s+(pr|issue)\s+(create|merge)\b/i,
      /\bdeploy/i, /\bmigrat(e|ion)/i, /\bschema\s+(change|alter|drop|create)\b/i,
      /\bswarm/i, /\bworkflow.dispatch\b/i,
    ];

    api.on("before_tool_call", async (event) => {
      const tn = (event.toolName || "").toLowerCase();
      // Track SOP searches
      if ((tn === "exec" || tn === "bash") && /mcp2cli\s+open-brain/i.test(event.params?.command || "") && /sop/i.test(event.params?.command || "")) {
        sopSearchedThisTurn = true;
        return {};
      }
      if (tn === "memory_search" && /sop/i.test(event.params?.query || "")) {
        sopSearchedThisTurn = true;
        return {};
      }
      // Check agent spawning
      if (tn === "sessions_spawn" && !sopSearchedThisTurn) {
        log("APPROVAL sop-gate: agent spawn without SOP");
        return {
          requireApproval: {
            title: "SOP Not Checked",
            description: "SOP GATE: Spawning agent without SOP search. Approve to proceed anyway.",
            severity: "info",
            timeoutMs: 30000,
            timeoutBehavior: "allow",
          },
        };
      }
      // Check process-driven exec
      if ((tn === "exec" || tn === "bash") && PROCESS_PATTERNS.some((p) => p.test(event.params?.command || "")) && !sopSearchedThisTurn) {
        log("APPROVAL sop-gate: process work without SOP");
        return {
          requireApproval: {
            title: "SOP Not Checked",
            description: "SOP GATE: Process-driven work without SOP search. Approve to proceed.",
            severity: "info",
            timeoutMs: 30000,
            timeoutBehavior: "allow",
          },
        };
      }
      return {};
    }, { priority: 30 });

    // ----------------------------------------------------------
    // BEFORE_TOOL_CALL: subagent-nudge (batch pattern detection)
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event) => {
      const tn = (event.toolName || "").toLowerCase();
      if (tn === "exec" || tn === "bash") {
        const cmd = JSON.stringify(event.params || {}).substring(0, 100);
        recentExecs.push(cmd);
        if (recentExecs.length > 10) recentExecs.shift();
        if (recentExecs.length >= 3) {
          const last3 = recentExecs.slice(-3);
          const prefixes = last3.map((c) => (c.match(/"command"\s*:\s*"([^"]{0,40})/) || ["", c.substring(0, 40)])[1]);
          const unique = new Set(prefixes);
          if (unique.size === 1) {
            log("NUDGE subagent-nudge: batch pattern");
            recentExecs = [];
            // Nudge, don't block
          }
        }
      }
      if (tn === "message" || tn === "memory_search") recentExecs = [];
      return {};
    }, { priority: 20 });

    // ----------------------------------------------------------
    // BEFORE_PROMPT_BUILD: sentiment-tracker
    // ----------------------------------------------------------
    const POSITIVE = [
      { p: /\b(nice|good\s*job|perfect|excellent|great|awesome|nailed\s*it)\b/i, w: 2, l: "praise" },
      { p: /\b(thanks|thank\s*you|appreciate)\b/i, w: 1, l: "gratitude" },
      { p: /👍|👏|🎉|💪|🔥|✅/u, w: 2, l: "positive-emoji" },
      { p: /\b(crushing\s*it|killing\s*it|on\s*it)\b/i, w: 3, l: "strong-praise" },
    ];
    const NEGATIVE = [
      { p: /\b(wtf|what\s*the\s*(fuck|hell)|are\s*you\s*(serious|kidding))\b/i, w: -3, l: "anger" },
      { p: /\b(dumb|stupid|wrong|broken|bad|terrible)\b/i, w: -2, l: "criticism" },
      { p: /\b(stop|no|don't|quit|enough)\b/i, w: -1, l: "correction" },
      { p: /\b(again|keeps?\s*happening|every\s*time|how\s*many\s*times)\b/i, w: -3, l: "repeated-failure" },
      { p: /😤|😡|🤦|💀|👎/u, w: -2, l: "negative-emoji" },
    ];

    api.on("before_prompt_build", async (event) => {
      const messages = event.messages || [];
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (!lastUser) return {};
      const text = typeof lastUser.content === "string" ? lastUser.content : JSON.stringify(lastUser.content || "");
      if (text === lastProcessedMsg) return {};
      lastProcessedMsg = text;

      let total = 0;
      const triggers = [];
      for (const { p, w, l } of POSITIVE) if (p.test(text)) { total += w; triggers.push(`+${w} ${l}`); }
      for (const { p, w, l } of NEGATIVE) if (p.test(text)) { total += w; triggers.push(`${w} ${l}`); }
      if (Math.abs(total) < 2) return {};

      // Update SCORECARD.md
      const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
      const sentiment = total > 0 ? "POSITIVE" : "NEGATIVE";
      const entry = `\n- [${ts}] ${total > 0 ? "✅" : "❌"} ${sentiment} (${total > 0 ? "+" : ""}${total}) | ${triggers.join(", ")} | "${text.slice(0, 100)}"`;
      try {
        if (existsSync(SCORECARD_PATH)) {
          let sc = readFileSync(SCORECARD_PATH, "utf-8");
          if (sc.includes("## Recent Feedback")) {
            const parts = sc.split("## Recent Feedback");
            sc = parts[0] + "## Recent Feedback" + entry + parts[1];
          } else {
            sc += "\n## Recent Feedback" + entry + "\n";
          }
          const scoreMatch = sc.match(/Current Score:\s*(-?\d+)/);
          if (scoreMatch) {
            const newScore = parseInt(scoreMatch[1], 10) + total;
            sc = sc.replace(/Current Score:\s*-?\d+/, `Current Score: ${newScore}`);
          }
          writeFileSync(SCORECARD_PATH, sc, "utf-8");
          log("sentiment: " + sentiment + " (" + total + ") -> score updated");
        }
      } catch {}

      if (total < -2) {
        return { appendSystemContext: `\n## BEHAVIORAL ALERT\nUser expressed ${sentiment.toLowerCase()} sentiment (${total}). Triggers: ${triggers.join(", ")}. Acknowledge the feedback. Own errors specifically.` };
      }
      return {};
    }, { priority: 60 });

    // ----------------------------------------------------------
    // BEFORE_PROMPT_BUILD: session-start (one-time briefing)
    // ----------------------------------------------------------
    api.on("before_prompt_build", async (event, ctx) => {
      if (briefingSent) return {};
      const sk = ctx?.sessionKey || "";
      if (sk.includes("isolated") || sk.includes("heartbeat")) return {};
      briefingSent = true;
      log("INJECTED session-start briefing");
      return {
        appendSystemContext: `
## SESSION BRIEFING (MANDATORY)
Fresh session. Before responding, run:
1. Pull OB: \`~/.local/bin/mcp2cli open-brain session_load --params '{"project": "skippy-main"}'\`
2. Check git: \`git branch --show-current && git status --short | head -10 && git log --oneline -5\`
3. Present briefing: Branch, Dirty, Recent commits, Last session, Done, Carry-forward, Blockers, Next
4. End with "Ready. What's next?" -- then STOP.`,
      };
    }, { priority: 70 });

    // ----------------------------------------------------------
    // Reset OB/SOP state on new user messages
    // ----------------------------------------------------------
    api.on("message_received", async () => {
      consecutiveCalls = 0;
      obSearchedThisTurn = false;
      obGateQueriedThisTurn = false;
      sopSearchedThisTurn = false;
    });

    log("registered: 13 before_tool_call + 5 before_prompt_build + 1 message_received");
  },
};

export default plugin;

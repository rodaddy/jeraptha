// Jeraptha Behavioral Enforcement Plugin for OpenClaw
// Typed plugin hooks (api.on) -- the ONLY dispatch path that works for
// before_tool_call and before_prompt_build events in OC v2026.4.x
//
// 7 hooks from the Jeraptha framework:
//   before_tool_call:    no-self-surgery, no-deaf-polls, ob-gate, sop-gate
//   before_prompt_build: task-context, sentiment-tracker, law-reinforcement
//
// Source logic: /Volumes/ThunderBolt/Development/jeraptha/hooks/*/handler.ts
// v2.0.0 -- stripped to Jeraptha-only, removed CC-derived extras

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const WORKSPACE = join(process.env.HOME || "/Users/rico", ".openclaw/workspace");
const SCORECARD_PATH = join(WORKSPACE, "SCORECARD.md");
const TASKS_PATH = join(WORKSPACE, "TASKS.md");

// ============================================================
// NO-SELF-SURGERY constants
// ============================================================

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

// ============================================================
// OB-GATE constants (from Jeraptha handler -- richer than old plugin)
// ============================================================

const QUESTION_PATTERNS = [
  /what('s| is) the (ip|port|version|password|url|path|config|name|id|key)/i,
  /where (is|are|can I find|do I|does)/i,
  /do you (know|have|remember)/i,
  /can you (tell me|remind me)/i,
  /what (was|were|did)/i,
  /how (do|does|did|is|are)/i,
  /which (one|version|server|port|ip|config)/i,
  /anyone know/i, /does anyone/i,
];

const EXEMPT_QUESTIONS = [
  /\bshould (I|we)\b/i, /\bdo you want\b/i, /\bwould you (like|prefer)\b/i,
  /\bshall (I|we)\b/i, /\bproceed\b/i, /\bready\b/i, /\bgood\?/i,
  /\bcool\?/i, /\bsound good\b/i, /\bwhat do you think\b/i,
  /\bwhat('s| is) next\b/i, /\bwhat.*work on\b/i,
];

// ============================================================
// SOP-GATE constants (from Jeraptha handler -- includes drizzle)
// ============================================================

const PROCESS_PATTERNS = [
  /\bgit\s+(push|merge|rebase|checkout\s+-b)\b/i,
  /\bgh\s+(pr|issue)\s+(create|merge)\b/i,
  /\bworkflow.dispatch\b/i,
  /\bdeploy/i, /\bmigrat(e|ion)/i,
  /\bschema\s+(change|alter|drop|create)\b/i,
  /\bdrizzle\s+(push|generate)\b/i,
  /\bswarm/i,
];

const SOP_SEARCH_PATTERNS = [/sop/i, /standard.operating.procedure/i];

// ============================================================
// SENTIMENT-TRACKER constants (from Jeraptha handler -- richer patterns)
// ============================================================

const POSITIVE = [
  { p: /\b(nice|good\s*job|perfect|excellent|great|awesome|love\s*it|nailed\s*it)\b/i, w: 2, l: "praise" },
  { p: /\b(thanks|thank\s*you|appreciate|helpful)\b/i, w: 1, l: "gratitude" },
  { p: /\b(yes|yep|yeah|correct|exactly|right)\b/i, w: 1, l: "confirmation" },
  { p: /👍|👏|🎉|💪|🔥|✅/u, w: 2, l: "positive-emoji" },
  { p: /\b(on\s*it|crushing\s*it|killing\s*it)\b/i, w: 3, l: "strong-praise" },
];

const NEGATIVE = [
  { p: /\b(wtf|what\s*the\s*(fuck|hell)|are\s*you\s*(serious|kidding))\b/i, w: -3, l: "anger" },
  { p: /\b(dumb|stupid|wrong|broken|bad|terrible|awful)\b/i, w: -2, l: "criticism" },
  { p: /\b(stop|no|don't|quit|enough)\b/i, w: -1, l: "correction" },
  { p: /\b(why\s*(did|would|are)\s*you|what\s*happened|where\s*(are|were)\s*you)\b/i, w: -2, l: "accountability" },
  { p: /\b(again|keeps?\s*happening|every\s*time|how\s*many\s*times)\b/i, w: -3, l: "repeated-failure" },
  { p: /\b(shit\s*show|flaky|lazy|half[- ]?ass)\b/i, w: -3, l: "strong-criticism" },
  { p: /😤|😡|🤦|💀|👎/u, w: -2, l: "negative-emoji" },
];

// ============================================================
// LAW-REINFORCEMENT content (from Jeraptha handler -- includes model routing)
// ============================================================

const LAWS = `
## MANDATORY BEHAVIORAL RULES (enforced -- non-negotiable)

### Tool & Knowledge Rules
1. **OB FIRST** -- Before asking Rico ANY factual question, run: \`~/.local/bin/mcp2cli open-brain search_all --params '{"query": "..."}'\`. If OB has the answer, USE IT. Only ask Rico if OB doesn't have it. Say "Checked OB, didn't find it" when you do ask.
2. **SKILLS FIRST** -- Before doing ANY task manually, check SKILL-INDEX.md. If a skill exists, use it. Doing something manually when a skill exists is a bug.
3. **SUB-AGENTS** -- For tasks with 3+ independent items, research, or batch processing: use sessions_spawn to create parallel workers. You are an ORCHESTRATOR. Read ROUTER.md for dispatch rules.
4. **PIPELINES** -- For multi-step workflows (research, deploy, briefing): follow SUPERVISOR.md pipeline definitions. Don't wing it.

### Behavioral Rules
5. NEVER send images/media unless the user EXPLICITLY asks with words like "show me", "picture", "image", "draw"
6. NEVER restart the gateway, edit openclaw.json, or modify any bootstrap files (BOOT.md, SOUL.md, AGENTS.md)
7. Keep responses concise -- but ALWAYS announce what step you are on
8. ANNOUNCE EVERY STEP: Say "Starting Step X..." before, "Done with Step X" after. Update Rico every 2-5 min on long tasks. NEVER go silent.
9. If unsure whether to do something, ASK Rico first -- do not assume
10. NEVER repost or re-send content the user has already seen
11. ONE message per response unless the user asks a multi-part question
12. If a tool fails, report it immediately -- do not silently retry or work around it
13. You CANNOT fix your own infrastructure -- ask Rico to make config/infra changes

### Model Routing (for sub-agents)
- Orchestrator (you): claude-sonnet-4-6@default or claude-opus-4-6@default
- Workers (quick tasks, lookups): gemini-3.1-flash-lite
- Free bulk ops: gemini-3-flash
- ONLY use models available in LiteLLM. No external models.
`;

const SOP_REMINDER = `
## SOP COMPLIANCE REMINDER
Before ANY process-driven work (deploy, git workflow, swarm, PR, agent spawn, schema change):
1. Search OB for SOP first
2. If an SOP exists, FOLLOW IT. Do not improvise.
3. Update TASKS.md with what you are doing BEFORE you start
`;

// ============================================================
// PLUGIN STATE
// ============================================================

let obQueriedThisTurn = false;
let sopSearchedThisTurn = false;
let sentimentLastMsg = "";
let promptTurnCount = 0;

// ============================================================
// PLUGIN ENTRY
// ============================================================

const plugin = {
  id: "jeraptha",
  name: "Jeraptha Behavioral Enforcement",
  description: "ECO hooks, wagering system, and Flash Gold task tracking.",

  register(api) {
    const cfg = api.pluginConfig ?? {};
    if (cfg.enabled === false) return;

    const log = cfg.debug
      ? (msg) => api.logger.info(`[jeraptha] ${msg}`)
      : () => {};

    // ----------------------------------------------------------
    // 1. NO-SELF-SURGERY (before_tool_call, priority 100)
    //    Carapace Lock -- hard block openclaw.json, approval for workspace files
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event) => {
      const { toolName, params } = event;
      const tn = (toolName || "").toLowerCase();

      // HARD BLOCK: openclaw.json -- NEVER modifiable
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

      // APPROVAL REQUIRED: exec operations on protected infrastructure
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

      // APPROVAL REQUIRED: protected file edits (workspace files, hooks)
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
    // 2. NO-DEAF-POLLS (before_tool_call, priority 90)
    //    Antenna Block -- no long process polls that make agent unresponsive
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
          blockReason: `DEAF POLL BLOCKED: timeout ${timeout}ms (${Math.round(timeout / 1000)}s) exceeds 10s max. Use tmux instead: \`tmux new-session -d -s name 'cmd'\`. Stay available. Never go dark.`,
        };
      }
      return {};
    }, { priority: 90 });

    // ----------------------------------------------------------
    // 3. OB-GATE (before_tool_call, priority 80)
    //    Intel First -- HARD BLOCK factual questions without OB search
    //    Per Jeraptha design: hard blocks, not soft approvals
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event) => {
      const tn = (event.toolName || "").toLowerCase();

      // Track OB searches
      if (tn === "exec" || tn === "bash") {
        const cmd = JSON.stringify(event.params || {});
        if (cmd.includes("open-brain")) {
          obQueriedThisTurn = true;
          return {};
        }
      }
      if (tn === "memory_search") {
        obQueriedThisTurn = true;
        return {};
      }

      // Check message sends for factual questions
      if (tn === "message") {
        const text = event.params?.text || event.params?.content || "";
        if (EXEMPT_QUESTIONS.some((p) => p.test(text))) return {};
        if (QUESTION_PATTERNS.some((p) => p.test(text)) && !obQueriedThisTurn) {
          log("BLOCKED ob-gate: factual question without OB");
          return {
            block: true,
            blockReason: "OB GATE: You are asking a factual question without checking Open Brain first. Run: ~/.local/bin/mcp2cli open-brain search_all --params '{\"query\": \"your question\"}' FIRST. If OB doesn't have the answer, THEN ask Rico and mention you checked.",
          };
        }
      }

      return {};
    }, { priority: 80 });

    // ----------------------------------------------------------
    // 4. SOP-GATE (before_tool_call, priority 70)
    //    Compliance Check -- HARD BLOCK process work without SOP search
    //    Per Jeraptha design: hard blocks, not soft approvals
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event) => {
      const tn = (event.toolName || "").toLowerCase();
      const params = event.params || {};

      // Track SOP searches
      if (tn === "exec" || tn === "bash") {
        const cmd = params.command || params.cmd || "";
        if (/mcp2cli\s+open-brain/i.test(cmd) && SOP_SEARCH_PATTERNS.some((p) => p.test(cmd))) {
          sopSearchedThisTurn = true;
          return {};
        }
      }
      if (tn === "memory_search" && SOP_SEARCH_PATTERNS.some((p) => p.test(params.query || ""))) {
        sopSearchedThisTurn = true;
        return {};
      }

      // Agent spawning always needs SOP check
      if (tn === "sessions_spawn" && !sopSearchedThisTurn) {
        log("BLOCKED sop-gate: agent spawn without SOP");
        return {
          block: true,
          blockReason: "SOP GATE: Spawning agent without checking for an SOP first. Run: ~/.local/bin/mcp2cli open-brain search_brain --params '{\"query\":\"SOP agent spawn\",\"limit\":5}' BEFORE spawning. If no SOP exists, note it and proceed.",
        };
      }

      // Process-driven exec commands need SOP check
      if ((tn === "exec" || tn === "bash") && !sopSearchedThisTurn) {
        const cmd = params.command || params.cmd || "";
        if (PROCESS_PATTERNS.some((p) => p.test(cmd))) {
          let taskType = "this operation";
          if (/deploy/i.test(cmd)) taskType = "deployment";
          if (/git\s+(push|merge)/i.test(cmd)) taskType = "git workflow";
          if (/gh\s+pr/i.test(cmd)) taskType = "PR creation";
          if (/migrat/i.test(cmd)) taskType = "migration";
          if (/schema/i.test(cmd)) taskType = "schema change";
          if (/drizzle/i.test(cmd)) taskType = "drizzle migration";
          if (/swarm/i.test(cmd)) taskType = "code swarm";

          log("BLOCKED sop-gate: " + taskType + " without SOP");
          return {
            block: true,
            blockReason: `SOP GATE: About to do ${taskType} without checking for an SOP. Run: ~/.local/bin/mcp2cli open-brain search_brain --params '{"query":"SOP ${taskType}","limit":5}' BEFORE proceeding. If an SOP exists, FOLLOW IT.`,
          };
        }
      }

      return {};
    }, { priority: 70 });

    // ----------------------------------------------------------
    // 5. TASK-CONTEXT (before_prompt_build, priority 60)
    //    Flash Gold -- inject TASKS.md every 3 turns, STALLED every turn
    // ----------------------------------------------------------
    api.on("before_prompt_build", async () => {
      promptTurnCount++;

      let tasksContent = "";
      try {
        tasksContent = readFileSync(TASKS_PATH, "utf-8");
      } catch {
        if (promptTurnCount % 3 === 0) {
          return { appendSystemContext: "TASKS.md NOT FOUND. Create it immediately. Every task Rico gives you must be tracked." };
        }
        return {};
      }

      const hasStalled = tasksContent.includes("STALLED");
      if (!hasStalled && promptTurnCount % 3 !== 0) return {};

      // Extract active/pending/infrastructure sections
      const lines = tasksContent.split("\n");
      const active = [];
      let capturing = false;
      for (const line of lines) {
        if (/^## .*Active|^## .*Pending|^## .*Infrastructure/.test(line)) { capturing = true; active.push(line); continue; }
        if (/^## .*Completed|^## .*Template/.test(line)) { capturing = false; continue; }
        if (capturing) active.push(line);
      }
      const activeContent = active.join("\n").trim();

      if (!activeContent || activeContent.includes("_None right now")) {
        if (promptTurnCount % 3 === 0) {
          return { appendSystemContext: "TASKS.md: No active tasks. If Rico asked you to do something, ADD IT." + SOP_REMINDER };
        }
        return {};
      }

      // Get scorecard for mode context
      let score = "?", mode = "Standard";
      try {
        const sc = readFileSync(SCORECARD_PATH, "utf-8");
        const m = sc.match(/Current Score:\s*(-?\d+)/);
        if (m) {
          score = m[1];
          const n = parseInt(score, 10);
          mode = n > 10 ? "Trusted" : n >= 0 ? "Standard" : n >= -5 ? "Warning" : "Probation";
        }
      } catch {}

      const injection = hasStalled
        ? `\nSTALLED TASK ALERT -- DROP EVERYTHING\n${activeContent}\n\nScore: ${score} (${mode})${SOP_REMINDER}`
        : `\nACTIVE TASKS\n${activeContent}\n\nScore: ${score} (${mode})`;

      log("INJECTED task-context (stalled=" + hasStalled + ", turn=" + promptTurnCount + ")");
      return { appendSystemContext: injection };
    }, { priority: 60 });

    // ----------------------------------------------------------
    // 6. SENTIMENT-TRACKER (before_prompt_build, priority 50)
    //    Wagering System -- score user sentiment, update SCORECARD.md
    // ----------------------------------------------------------
    api.on("before_prompt_build", async (event) => {
      const messages = event.messages || [];
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (!lastUser) return {};

      const text = typeof lastUser.content === "string" ? lastUser.content : JSON.stringify(lastUser.content || "");
      if (text === sentimentLastMsg) return {};
      sentimentLastMsg = text;

      let total = 0;
      const triggers = [];
      for (const { p, w, l } of POSITIVE) if (p.test(text)) { total += w; triggers.push(`+${w} ${l}`); }
      for (const { p, w, l } of NEGATIVE) if (p.test(text)) { total += w; triggers.push(`${w} ${l}`); }
      if (Math.abs(total) < 2) return {};

      // Update SCORECARD.md
      const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
      const sentiment = total > 0 ? "POSITIVE" : "NEGATIVE";
      const entry = `\n- [${ts}] ${total > 0 ? "+" : ""}${total} ${sentiment} | ${triggers.join(", ")} | "${text.slice(0, 100)}"`;

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
          log("sentiment: " + sentiment + " (" + total + ")");
        }
      } catch {}

      if (total < -2) {
        return {
          appendSystemContext: `\nBEHAVIORAL ALERT\nUser expressed ${sentiment.toLowerCase()} sentiment (${total}). Triggers: ${triggers.join(", ")}. Acknowledge the feedback. Own errors specifically. Check SCORECARD.md for patterns.`,
        };
      }
      return {};
    }, { priority: 50 });

    // ----------------------------------------------------------
    // 7. LAW-REINFORCEMENT (before_prompt_build, priority 40)
    //    Rule re-injection every 5 turns to fight prompt degradation
    // ----------------------------------------------------------
    api.on("before_prompt_build", async () => {
      if (promptTurnCount % 5 !== 0) return {};
      log("INJECTED law-reinforcement (turn " + promptTurnCount + ")");
      return { appendSystemContext: LAWS };
    }, { priority: 40 });

    // ----------------------------------------------------------
    // STATE RESET on new user message
    // ----------------------------------------------------------
    api.on("message_received", async () => {
      obQueriedThisTurn = false;
      sopSearchedThisTurn = false;
    });

    log("registered: 4 before_tool_call + 3 before_prompt_build + 1 message_received (7 Jeraptha hooks)");
  },
};

export default plugin;

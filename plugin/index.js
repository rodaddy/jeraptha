// Jeraptha Behavioral Enforcement Plugin for OpenClaw
// Typed plugin hooks (api.on) -- the ONLY dispatch path that works for
// before_tool_call and before_prompt_build events in OC v2026.4.x
//
// v2.4.0 -- 15 hooks (11 before_tool_call + 3 before_prompt_build + 1 message_received)
//   before_tool_call:    state-tracker (p110), no-self-surgery (p100),
//                        no-destructive-git (p95), no-deaf-polls (p90),
//                        ob-gate (p80), sop-gate (p70), skill-gate (p68),
//                        task-freshness-gate (p65), conversation-freshness-gate (p62),
//                        communication-gate (p55), heartbeat-gate (p45)
//   before_prompt_build: sentiment-tracker (p50), task-stalled-alert (p40)
//   message_received:    state reset + turn counter
//
// v2.1 architecture: "if it doesn't block, it gets ignored"
// Removed law-reinforcement (9 injections/day, 0 compliance) and regular
// task-context injection (14 injections/day, 0 compliance). Replaced with
// blocking gates that prevent work until compliance actions are taken.

import { readFileSync, writeFileSync, existsSync, statSync } from "fs";
import { join } from "path";

const WORKSPACE = join(process.env.HOME || "/Users/rico", ".openclaw/workspace");
const SCORECARD_PATH = join(WORKSPACE, "SCORECARD.md");
const TASKS_PATH = join(WORKSPACE, "TASKS.md");
const CONVERSATIONS_PATH = join(WORKSPACE, "CONVERSATIONS.md");

// ============================================================
// NO-SELF-SURGERY constants
// ============================================================

const HARD_BLOCKED_PATHS = [/openclaw\.json/i];

const APPROVAL_EXEC = [
  /gateway\s+(restart|stop|start)/i,
];

const APPROVAL_PATHS = [
  /\.openclaw\/hooks\//i,
];

// ============================================================
// NO-DESTRUCTIVE-GIT constants
// ============================================================

const DESTRUCTIVE_GIT = [
  /\bgit\s+reset\b/i,
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

// LAW-REINFORCEMENT content removed in v2.1 -- 9 injections/day, 0 compliance.
// Specific rules now enforced mechanically by blocking gates.
// SOP_REMINDER removed -- sop-gate already blocks without SOP check.

// ============================================================
// HELPERS
// ============================================================

// mcp2cli calls are compliance/infrastructure -- never block them
const isComplianceExec = (params) => {
  const cmd = params?.command || params?.cmd || "";
  return /mcp2cli/i.test(cmd);
};

// Heartbeat sessions run isolated -- they should never be blocked by behavioral gates.
// They ARE the compliance mechanism. Blocking them creates a chicken-and-egg deadlock.
const isHeartbeatSession = (ctx) => {
  const key = ctx?.sessionKey || "";
  return /heartbeat|isolated/i.test(key);
};

// ============================================================
// PLUGIN STATE
// ============================================================

let obQueriedThisTurn = false;
let sopSearchedThisTurn = false;
let sentimentLastMsg = "";
let promptTurnCount = 0;

// -- Blocking gate state (v2.1+ -- "if it doesn't block, it gets ignored")
let lastTasksWriteTurn = 0;
let lastConversationsWriteTurn = 0;
let lastScorecardWriteTime = Date.now();  // grace: treat boot as fresh
let toolCallsSinceMessage = 0;
let currentTurn = 0;
let sessionKeyLogged = false;
let skillConsultedThisTurn = false;

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
    // 0. STATE TRACKER (before_tool_call, priority 110)
    //    Passive observer -- tracks writes to TASKS.md, SCORECARD.md,
    //    message sends, and tool call counts. NEVER blocks.
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event, ctx) => {
      // Debug: log session key once per session to verify heartbeat detection
      if (ctx?.sessionKey && !sessionKeyLogged) {
        sessionKeyLogged = true;
        log("session-key: " + ctx.sessionKey);
      }

      const tn = (event.toolName || "").toLowerCase();
      const params = event.params || {};

      // Track writes to TASKS.md / SCORECARD.md
      if ((tn === "write" || tn === "edit" || tn === "apply_patch") && params.path) {
        if (/TASKS\.md/i.test(params.path)) {
          lastTasksWriteTurn = currentTurn;
          log("state-tracker: TASKS.md write (turn " + currentTurn + ")");
        }
        if (/SCORECARD\.md/i.test(params.path)) {
          lastScorecardWriteTime = Date.now();
          log("state-tracker: SCORECARD.md write");
        }
        if (/CONVERSATIONS\.md/i.test(params.path)) {
          lastConversationsWriteTurn = currentTurn;
          log("state-tracker: CONVERSATIONS.md write (turn " + currentTurn + ")");
        }
      }

      // Track message sends
      if (tn === "message") {
        toolCallsSinceMessage = 0;
        log("state-tracker: message send (turn " + currentTurn + ")");
      }

      // Count work tool calls for communication gate (skip compliance calls)
      if ((tn === "exec" || tn === "bash") && !isComplianceExec(params)) {
        toolCallsSinceMessage++;
      }

      // Track skill consultations (reading SKILL files)
      if (((tn === "exec" || tn === "bash") && /\bcat\b.*SKILL/i.test(params?.command || params?.cmd || "")) ||
          (tn === "read" && /SKILL/i.test(params?.path || ""))) {
        skillConsultedThisTurn = true;
      }

      return {};
    }, { priority: 110 });

    // ----------------------------------------------------------
    // 1. NO-SELF-SURGERY (before_tool_call, priority 100)
    //    Carapace Lock -- hard block openclaw.json, approval for workspace files
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event) => {
      const { toolName, params } = event;
      const tn = (toolName || "").toLowerCase();

      // HARD BLOCK: openclaw.json -- no self-surgery (reads OK)
      // Exceptions: SSH (cross-agent fix), oc-channel (scoped channel management)
      if (tn === "exec" || tn === "bash") {
        const cmd = params?.command || params?.cmd || "";
        if (HARD_BLOCKED_PATHS.some((p) => p.test(cmd))) {
          const WRITE_INTENTS = /\b(sed|awk|tee|mv|cp|rm|echo\s.*>|cat\s.*>|printf\s.*>|>\s*[~\/]|python.*open.*['"](w|a)|node.*write|jq\s.*>|perl\s+-.*p?i)\b|>\s*.*openclaw\.json/i;
          if (WRITE_INTENTS.test(cmd)) {
            if (/\bssh\s+/i.test(cmd)) {
              log("ALLOWED no-self-surgery (cross-agent SSH): " + cmd.substring(0, 80));
              return {};
            }
            if (/\boc-channel\b/i.test(cmd)) {
              log("ALLOWED no-self-surgery (oc-channel): " + cmd.substring(0, 80));
              return {};
            }
            log("BLOCKED no-self-surgery (hard): " + cmd.substring(0, 60));
            return { block: true, blockReason: "CARAPACE LOCK: Cannot modify own openclaw.json. Use oc-channel for channel management, or SSH for cross-agent fixes." };
          }
          log("ALLOWED no-self-surgery (read): " + cmd.substring(0, 60));
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
    // 1b. NO-DESTRUCTIVE-GIT (before_tool_call, priority 95)
    //     Hard block destructive git commands -- no exceptions.
    //     User must run these manually. Fail CLOSED.
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event, ctx) => {
      if (isHeartbeatSession(ctx)) return {};
      const tn = (event.toolName || "").toLowerCase();
      if (tn !== "exec" && tn !== "bash") return {};

      const cmd = event.params?.command || event.params?.cmd || "";
      if (DESTRUCTIVE_GIT.some((p) => p.test(cmd))) {
        log("BLOCKED no-destructive-git: " + cmd.substring(0, 80));
        return {
          block: true,
          blockReason: `DESTRUCTIVE GIT BLOCK: "${cmd.substring(0, 80)}" can NEVER be run by an agent. This is a hard block with no override. Copy the command and run it yourself if needed.`,
        };
      }

      // cd+git chains break permission matching -- use git -C instead
      if (/\bcd\s+\S+\s*(&&|;)\s*git\b/i.test(cmd)) {
        log("BLOCKED chain-command: " + cmd.substring(0, 80));
        return { block: true, blockReason: 'CHAIN BLOCK: Do not chain cd with git. Use "git -C /path command" or separate exec calls.' };
      }

      // Heredocs writing to files corrupt config -- use Write/Edit tools
      if (/<<-?\s*'?[A-Z_]+'?/.test(cmd) && /(?:cat\s*>|tee\s+\S|>>)/.test(cmd) && !/git\s+commit\s+-m\s+"\$\(cat\s+<</.test(cmd)) {
        log("BLOCKED heredoc-write: " + cmd.substring(0, 80));
        return { block: true, blockReason: 'HEREDOC BLOCK: Heredocs that write to files are blocked -- they corrupt configs. Use Write/Edit tools.' };
      }

      return {};
    }, { priority: 95 });

    // ----------------------------------------------------------
    // 2. NO-DEAF-POLLS (before_tool_call, priority 90)
    //    Antenna Block -- no long process polls that make agent unresponsive
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event, ctx) => {
      if (isHeartbeatSession(ctx)) return {};
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
    //    Also blocks known-bad OB queries (wildcard *, empty, etc.)
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event, ctx) => {
      if (isHeartbeatSession(ctx)) return {};
      const tn = (event.toolName || "").toLowerCase();

      // Track OB searches + block bad queries
      if (tn === "exec" || tn === "bash") {
        const cmd = JSON.stringify(event.params || {});
        if (cmd.includes("open-brain")) {
          // Block known-bad OB queries before they waste a call
          if (/["']query["']\s*:\s*["']\*["']/.test(cmd) || /["']query["']\s*:\s*["']\s*["']/.test(cmd)) {
            log("BLOCKED ob-gate: bad OB query (wildcard or empty)");
            return {
              block: true,
              blockReason: 'OB GATE: Do NOT use "*" or empty queries with OB. Wildcard does vector similarity on the literal asterisk -- it returns random garbage, not all entries. Use a real natural language query like "jeraptha hooks" or "king capital deploy". Use search_all (not search_brain) for broad searches. Use tags for filtering.',
            };
          }
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

      // Search-before-read: block grep/find on project files without OB search
      if ((tn === "exec" || tn === "bash") && !isComplianceExec(params) && !obQueriedThisTurn) {
        const cmd = params?.command || params?.cmd || "";
        if (/\b(grep|rg|find|fd)\b/i.test(cmd) && !/TASKS\.md|SCORECARD|CONVERSATIONS|HEARTBEAT|SKILL|\.openclaw/i.test(cmd)) {
          log("BLOCKED ob-gate (search-before-read): " + cmd.substring(0, 80));
          return { block: true, blockReason: "OB GATE: Searching project files without checking Open Brain first. Run: mcp2cli open-brain search_all --params '{\"query\": \"what you need\"}' BEFORE grepping." };
        }
      }

      return {};
    }, { priority: 80 });

    // ----------------------------------------------------------
    // 4. SOP-GATE (before_tool_call, priority 70)
    //    Compliance Check -- HARD BLOCK process work without SOP search
    //    Per Jeraptha design: hard blocks, not soft approvals
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event, ctx) => {
      if (isHeartbeatSession(ctx)) return {};
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

      // Process-driven exec commands need SOP check (skip compliance calls)
      if ((tn === "exec" || tn === "bash") && !sopSearchedThisTurn && !isComplianceExec(params)) {
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
    // 4b. SKILL-GATE (before_tool_call, priority 68)
    //     Block high-risk ops without consulting skills first.
    // ----------------------------------------------------------
    api.on("before_tool_call", async (event, ctx) => {
      if (isHeartbeatSession(ctx)) return {};
      const tn = (event.toolName || "").toLowerCase();
      if (tn !== "exec" && tn !== "bash") return {};
      if (isComplianceExec(event.params) || currentTurn <= (cfg.gracePeriodTurns || 5) || skillConsultedThisTurn) return {};
      const cmd = event.params?.command || event.params?.cmd || "";
      const ops = [[/\b(deploy|scp\s|rsync\s)/i, "deploy"], [/\b(docker|container|lxc|pct\s)/i, "infrastructure"], [/\bswarm\b/i, "code-swarm"], [/\b(n8n|workflow)/i, "n8n"]];
      const match = ops.find(([p]) => p.test(cmd));
      if (!match) return {};
      log("BLOCKED skill-gate: " + match[1]);
      return { block: true, blockReason: `SKILL GATE: About to do ${match[1]} work without consulting skills. Read SKILL-INDEX.md, then the relevant SKILL.md. Skills have workflow knowledge you'll miss.` };
    }, { priority: 68 });

    // ----------------------------------------------------------
    // 5. TASK-FRESHNESS-GATE (before_tool_call, priority 65)
    //    Blocks work tools if TASKS.md hasn't been updated recently.
    //    Replaces the toothless task-context prompt injection.
    //    "14 injections, zero compliance" -- never again.
    // ----------------------------------------------------------
    const taskTurnThreshold = cfg.taskFreshnessTurns || 10;
    const graceTurns = cfg.gracePeriodTurns || 5;

    api.on("before_tool_call", async (event, ctx) => {
      if (isHeartbeatSession(ctx)) return {};
      const tn = (event.toolName || "").toLowerCase();

      // Only gate work tools -- let writes/edits through so model CAN comply
      if (tn !== "exec" && tn !== "bash" && tn !== "message") return {};

      // Never block compliance calls (mcp2cli) -- they're how you DO the compliance
      if ((tn === "exec" || tn === "bash") && isComplianceExec(event.params)) return {};

      // Grace period at session start
      if (currentTurn <= graceTurns) return {};

      // Check staleness by turn count
      const turnsSinceUpdate = currentTurn - lastTasksWriteTurn;
      if (turnsSinceUpdate <= taskTurnThreshold) return {};

      // Double-check via file mtime (write may have happened outside plugin)
      try {
        const stat = statSync(TASKS_PATH);
        if (Date.now() - stat.mtimeMs < 60000) return {};
      } catch {}

      const blocked = event.params?.command || event.params?.cmd || event.params?.text || tn;
      log("BLOCKED task-freshness-gate: " + turnsSinceUpdate + " turns since TASKS.md update");
      return {
        block: true,
        blockReason: `TASK GATE: TASKS.md hasn't been updated in ${turnsSinceUpdate} turns. 1) Write to ${TASKS_PATH} now -- update Last HB timestamps, status, what you're doing. 2) Then IMMEDIATELY resume what you were doing (you were about to: ${String(blocked).substring(0, 80)}). Do NOT stop after updating -- the update is a pit stop, not the destination.`,
      };
    }, { priority: 65 });

    // ----------------------------------------------------------
    // 6. CONVERSATION-FRESHNESS-GATE (before_tool_call, priority 62)
    //    Blocks work tools if CONVERSATIONS.md hasn't been updated.
    //    Same pattern as task-freshness -- if it doesn't block, he ignores it.
    // ----------------------------------------------------------
    const convTurnThreshold = cfg.conversationFreshnessTurns || 15;

    api.on("before_tool_call", async (event, ctx) => {
      if (isHeartbeatSession(ctx)) return {};
      const tn = (event.toolName || "").toLowerCase();

      if (tn !== "exec" && tn !== "bash" && tn !== "message") return {};
      if ((tn === "exec" || tn === "bash") && isComplianceExec(event.params)) return {};
      if (currentTurn <= graceTurns) return {};

      const turnsSinceUpdate = currentTurn - lastConversationsWriteTurn;
      if (turnsSinceUpdate <= convTurnThreshold) return {};

      try {
        const stat = statSync(CONVERSATIONS_PATH);
        if (Date.now() - stat.mtimeMs < 120000) return {};
      } catch {}

      const blockedConv = event.params?.command || event.params?.cmd || event.params?.text || tn;
      log("BLOCKED conversation-freshness-gate: " + turnsSinceUpdate + " turns since CONVERSATIONS.md update");
      return {
        block: true,
        blockReason: `CONVERSATIONS GATE: CONVERSATIONS.md hasn't been updated in ${turnsSinceUpdate} turns. 1) Write to ${CONVERSATIONS_PATH} -- update topics, heat, what's current. 2) Then IMMEDIATELY resume what you were doing (you were about to: ${String(blockedConv).substring(0, 80)}). Do NOT stop after updating -- the update is a pit stop, not the destination.`,
      };
    }, { priority: 62 });

    // ----------------------------------------------------------
    // 7. COMMUNICATION-GATE (before_tool_call, priority 55)
    //    Blocks work tools if too many tool calls without a message.
    //    Enforces "never go dark" mechanically -- not by suggestion.
    // ----------------------------------------------------------
    const commThreshold = cfg.commGateThreshold || 8;

    api.on("before_tool_call", async (event, ctx) => {
      if (isHeartbeatSession(ctx)) return {};
      const tn = (event.toolName || "").toLowerCase();

      // Only gate exec/bash -- don't block writes, edits, or messages
      if (tn !== "exec" && tn !== "bash") return {};
      if (isComplianceExec(event.params)) return {};

      // Grace period
      if (currentTurn <= graceTurns) return {};

      if (toolCallsSinceMessage <= commThreshold) return {};

      const blockedComm = event.params?.command || event.params?.cmd || tn;
      log("BLOCKED communication-gate: " + toolCallsSinceMessage + " tool calls without message");
      return {
        block: true,
        blockReason: `COMMS GATE: You've made ${toolCallsSinceMessage} tool calls without sending a status update. 1) Post a progress message to the active channel NOW. 2) Then IMMEDIATELY resume what you were doing (you were about to: ${String(blockedComm).substring(0, 80)}). Do NOT stop after posting -- the update is a pit stop, not the destination.`,
      };
    }, { priority: 55 });

    // ----------------------------------------------------------
    // 7. TASK-STALLED-ALERT (before_prompt_build, priority 60)
    //    STALLED injection ONLY. Regular task reminders replaced by
    //    the blocking gate above. Only fires for high-urgency STALLED.
    // ----------------------------------------------------------
    api.on("before_prompt_build", async () => {
      promptTurnCount++;

      let tasksContent = "";
      try {
        tasksContent = readFileSync(TASKS_PATH, "utf-8");
      } catch {
        return {};
      }

      if (!tasksContent.includes("STALLED")) return {};

      // Extract STALLED task sections only
      const lines = tasksContent.split("\n");
      const stalled = [];
      let capturing = false;
      for (const line of lines) {
        if (/STALLED/.test(line)) { capturing = true; stalled.push(line); continue; }
        if (capturing) {
          stalled.push(line);
          if (line.trim() === "" || /^### /.test(line)) capturing = false;
        }
      }

      log("INJECTED task-stalled-alert");
      return {
        appendSystemContext: `\nSTALLED TASK ALERT -- DROP EVERYTHING\n${stalled.join("\n")}\n\nAddress this IMMEDIATELY. Update TASKS.md with current status.`,
      };
    }, { priority: 40 });

    // ----------------------------------------------------------
    // 8a. SKILL-INDEX-REMINDER (before_prompt_build, priority 35)
    //     Light reminder of available skills every 10 turns.
    //     NOT enforcement -- just awareness. "You have tools, use them."
    // ----------------------------------------------------------
    const SKILL_INDEX_PATH = join(WORKSPACE, "SKILL-INDEX.md");

    api.on("before_prompt_build", async () => {
      if (promptTurnCount % 10 !== 0) return {};

      try {
        const index = readFileSync(SKILL_INDEX_PATH, "utf-8");
        log("INJECTED skill-index-reminder (turn " + promptTurnCount + ")");
        return {
          appendSystemContext: `\nAVAILABLE SKILLS (check before doing anything manually):\n${index}\n\nRead the full SKILL.md before using. Do NOT guess at usage -- the skill has instructions.`,
        };
      } catch {
        return {};
      }
    }, { priority: 35 });

    // ----------------------------------------------------------
    // 9. SENTIMENT-TRACKER (before_prompt_build, priority 50)
    //    Wagering System -- score user sentiment, update SCORECARD.md
    // ----------------------------------------------------------
    api.on("before_prompt_build", async (event) => {
      const messages = event.messages || [];
      const lastUser = [...messages].reverse().find((m) => m.role === "user");
      if (!lastUser) return {};

      const text = typeof lastUser.content === "string" ? lastUser.content : JSON.stringify(lastUser.content || "");
      if (text === sentimentLastMsg) return {};
      sentimentLastMsg = text;

      // Skip automated/system messages -- these aren't real user sentiment
      if (/BOOT\.md|boot check|Follow .+ instructions exactly/i.test(text)) return {};
      // Skip JSON blobs (tool output reflected as user role)
      if (/^\s*[\[{]/.test(text) && text.length > 50) return {};
      // Skip system-injected context (XML tags, markdown headers, long structured content)
      if (/^<(system|context|instructions|reminder|tool)/i.test(text.trim())) return {};
      // Skip very short messages (emoji-only handled by patterns, but skip empty/whitespace)
      if (text.trim().length < 3) return {};
      // Skip messages that are mostly non-conversational (e.g. file contents, code dumps)
      if (text.length > 500) return {};

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
          log("sentiment: " + sentiment + " (" + total + ") | " + JSON.stringify(text.slice(0, 120)));
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
    // 9. HEARTBEAT-GATE (before_tool_call, priority 45)
    //    Blocks work tools if heartbeat activities haven't happened
    //    in the configured interval. Wall-clock enforcement.
    //    law-reinforcement REMOVED: 9 injections/day, 0 compliance.
    //    Specific rules now enforced by blocking gates above.
    // ----------------------------------------------------------
    const heartbeatMs = cfg.heartbeatIntervalMs || 10 * 60 * 1000;

    api.on("before_tool_call", async (event, ctx) => {
      if (isHeartbeatSession(ctx)) return {};
      const tn = (event.toolName || "").toLowerCase();

      // Only gate exec/bash -- let messages through (communication is never blocked by heartbeat)
      if (tn !== "exec" && tn !== "bash") return {};
      if (isComplianceExec(event.params)) return {};

      // Grace period
      if (currentTurn <= graceTurns) return {};

      // Check file mtime -- heartbeat runs in isolated sessions with their own
      // plugin state, so in-memory lastScorecardWriteTime misses their writes.
      let lastWrite = lastScorecardWriteTime;
      try {
        const mtime = statSync(SCORECARD_PATH).mtimeMs;
        if (mtime > lastWrite) lastWrite = mtime;
      } catch {}
      const elapsed = Date.now() - lastWrite;
      if (elapsed <= heartbeatMs) return {};

      const mins = Math.round(elapsed / 60000);
      const blockedHB = event.params?.command || event.params?.cmd || event.params?.text || tn;
      log("BLOCKED heartbeat-gate: " + mins + " min since scorecard update");
      return {
        block: true,
        blockReason: `HEARTBEAT GATE: No heartbeat activity in ${mins} minutes. 1) Run heartbeat: read TASKS.md, update SCORECARD.md, session_save to OB. 2) Then IMMEDIATELY resume what you were doing (you were about to: ${String(blockedHB).substring(0, 80)}). Do NOT stop after the heartbeat -- it's a pit stop, not the destination.`,
      };
    }, { priority: 45 });

    // ----------------------------------------------------------
    // STATE RESET on new user message
    // ----------------------------------------------------------
    api.on("message_received", async () => {
      obQueriedThisTurn = false;
      sopSearchedThisTurn = false;
      skillConsultedThisTurn = false;
      currentTurn++;
    });

    log("registered: 11 before_tool_call (10 blocking + 1 tracker) + 3 before_prompt_build + 1 message_received (15 Jeraptha v2.4 hooks)");
  },
};

export default plugin;

import { QUESTION_PATTERNS, EXEMPT_QUESTIONS } from "../shared/constants.js";
import {
  isHeartbeatSession,
  isComplianceExec,
  getToolName,
  getCommand,
} from "../shared/helpers.js";

export function createBlockWithoutObSearch(state, config, log) {
  return async (event, ctx) => {
    if (isHeartbeatSession(ctx)) {
      log.skip("heartbeat", "heartbeat session");
      return {};
    }
    const tn = getToolName(event);

    if (tn === "exec" || tn === "bash") {
      const cmd = JSON.stringify(event.params || {});
      if (cmd.includes("open-brain")) {
        if (
          /["']query["']\s*:\s*["']\*["']/.test(cmd) ||
          /["']query["']\s*:\s*["']\s*["']/.test(cmd)
        ) {
          log.block(tn, "bad OB query (wildcard or empty)");
          return {
            block: true,
            blockReason:
              'OB GATE: Do NOT use "*" or empty queries with OB. Wildcard does vector similarity on the literal asterisk -- it returns random garbage, not all entries. Use a real natural language query like "jeraptha hooks" or "king capital deploy". Use search_all (not search_brain) for broad searches. Use tags for filtering.',
          };
        }
        state.obQueriedThisTurn = true;
        log.allow(tn, "OB search executed");
        return {};
      }
    }
    if (tn === "memory_search") {
      state.obQueriedThisTurn = true;
      log.allow(tn, "memory_search counts as OB query");
      return {};
    }

    if (tn === "message") {
      const text = event.params?.text || event.params?.content || "";
      if (EXEMPT_QUESTIONS.some((p) => p.test(text))) {
        log.allow(tn, "exempt question pattern");
        return {};
      }
      if (
        QUESTION_PATTERNS.some((p) => p.test(text)) &&
        !state.obQueriedThisTurn
      ) {
        log.block(tn, "factual question without OB search");
        return {
          block: true,
          blockReason:
            'OB GATE: You are asking a factual question without checking Open Brain first. Run: ~/.local/bin/mcp2cli open-brain search_all --params \'{"query": "your question"}\' FIRST. If OB doesn\'t have the answer, THEN ask the user and mention you checked.',
        };
      }
    }

    if (
      (tn === "exec" || tn === "bash") &&
      !isComplianceExec(event.params) &&
      !state.obQueriedThisTurn
    ) {
      const cmd = getCommand(event.params);
      if (
        /\b(grep|rg|find|fd)\b/i.test(cmd) &&
        !/TASKS\.md|SCORECARD|CONVERSATIONS|HEARTBEAT|SKILL|\.openclaw/i.test(
          cmd,
        )
      ) {
        log.block(tn, "search-before-read without OB", {
          cmd: cmd.substring(0, 80),
        });
        return {
          block: true,
          blockReason:
            'OB GATE: Searching project files without checking Open Brain first. Run: mcp2cli open-brain search_all --params \'{"query": "what you need"}\' BEFORE grepping.',
        };
      }
    }

    log.allow(tn, "OB gate passed");
    return {};
  };
}

import { getToolName, getMessageText, getMessages } from "../shared/helpers.js";

// NOTE: This gate runs at priority 50. If a higher-priority gate already blocked
// this tool call, OpenClaw may still invoke this gate. The LLM call is wasted in
// that case. If this becomes a performance concern, check event.blocked or similar.
export function createBlockUserDataContradiction(state, config, log) {
  const litellmUrl =
    config.litellmUrl || "http://10.71.1.33:4000/v1/chat/completions";
  const litellmModel = config.litellmModel || "flash";
  const fetchFn =
    typeof config._fetch === "function" ? config._fetch : globalThis.fetch;

  return async (event, ctx) => {
    const tn = getToolName(event);
    if (tn !== "message") return {};

    const botMessage = getMessageText(event.params);
    if (!botMessage || botMessage.length < 10) return {};

    const messages = getMessages(event);
    const userMessages = [...messages]
      .reverse()
      .filter((m) => m.role === "user")
      .slice(0, 5);
    if (userMessages.length === 0) return {};
    const userMessage = userMessages
      .map((m) =>
        typeof m.content === "string"
          ? m.content
          : JSON.stringify(m.content || ""),
      )
      .join("\n---\n");
    if (userMessage.length < 10) return {};

    const prompt = `You are a fact-checking gate. Compare the user's most recent message against the bot's outgoing response.

User message:
${userMessage.slice(0, 2000)}

Bot response about to send:
${botMessage.slice(0, 2000)}

Does the bot response contradict any specific facts, data, numbers, dates, or claims the user provided? Ignore opinions and preferences — only flag factual contradictions.

Return ONLY valid JSON: {"contradicts": true, "detail": "what was contradicted"} or {"contradicts": false, "detail": ""}`;

    try {
      const response = await fetchFn(litellmUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: litellmModel,
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          max_tokens: 200,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        state.contradictionGateFailures++;
        if (state.contradictionGateFailures > 5) {
          log(
            "contradiction-check: WARNING -- " +
              state.contradictionGateFailures +
              " consecutive failures",
          );
        }
        log(
          "contradiction-check: LiteLLM returned " +
            response.status +
            " -- fail-open",
        );
        return {};
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content || "";

      let result;
      try {
        result = JSON.parse(content);
      } catch {
        // Strip markdown fences if present
        const stripped = content
          .replace(/```json?\s*/g, "")
          .replace(/```/g, "")
          .trim();
        try {
          result = JSON.parse(stripped);
        } catch {
          // Last resort: find outermost braces
          const start = stripped.indexOf("{");
          const end = stripped.lastIndexOf("}");
          if (start !== -1 && end > start) {
            try {
              result = JSON.parse(stripped.slice(start, end + 1));
            } catch {
              result = { contradicts: false };
            }
          } else {
            result = { contradicts: false };
          }
        }
      }

      if (result.contradicts !== true) return {};

      state.contradictionGateFailures = 0;
      state.contradictionCountThisTurn++;
      const rawDetail = result.detail || "";
      const detail =
        rawDetail.slice(0, 150).replace(/[<>{}[\]]/g, "") ||
        "unspecified contradiction. Re-read the user's recent messages for the data you need to verify against.";

      if (state.contradictionCountThisTurn === 1) {
        log("BLOCKED contradiction-check (soft): " + detail);
        return {
          block: true,
          blockReason: `CONTRADICTION CHECK: Your response contradicts data the user provided. Detail: "${detail}". Verify from 2+ independent sources before responding. Do NOT rely on a single lookup or computation. Cross-check against the user's actual data.`,
        };
      }

      log("BLOCKED contradiction-check (hard): " + detail);
      return {
        block: true,
        blockReason: `CONTRADICTION CHECK (HARD BLOCK): You contradicted user-provided data TWICE this turn. Detail: "${detail}". STOP. Re-read the user's message. List the facts they stated. Verify each one independently. Only respond when you can cite 2+ sources that agree.`,
      };
    } catch (err) {
      state.contradictionGateFailures++;
      if (state.contradictionGateFailures > 5) {
        log(
          "contradiction-check: WARNING -- " +
            state.contradictionGateFailures +
            " consecutive failures",
        );
      }
      log(
        "contradiction-check: fetch failed -- fail-open (" +
          (err?.message || err) +
          ")",
      );
      return {};
    }
  };
}

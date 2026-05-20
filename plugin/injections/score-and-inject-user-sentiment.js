import { POSITIVE_SENTIMENT, NEGATIVE_SENTIMENT } from "../shared/constants.js";
import { SCORECARD_PATH } from "../shared/paths.js";
import { getMessages } from "../shared/helpers.js";
import { readFileSync, writeFileSync, existsSync } from "fs";

export function createScoreAndInjectUserSentiment(state, config, log) {
  return async (event, ctx) => {
    const messages = getMessages(event);
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return {};

    const text =
      typeof lastUser.content === "string"
        ? lastUser.content
        : JSON.stringify(lastUser.content || "");
    if (text === state.sentimentLastMsg) return {};
    state.sentimentLastMsg = text;

    if (/BOOT\.md|boot check|Follow .+ instructions exactly/i.test(text))
      return {};
    if (/^\s*[\[{]/.test(text) && text.length > 50) return {};
    if (/^<(system|context|instructions|reminder|tool)/i.test(text.trim()))
      return {};
    if (text.trim().length < 3) return {};

    const scanText = text.slice(0, 500);

    let total = 0;
    const triggers = [];
    for (const { p, w, l } of POSITIVE_SENTIMENT)
      if (p.test(scanText)) {
        total += w;
        triggers.push(`+${w} ${l}`);
      }
    for (const { p, w, l } of NEGATIVE_SENTIMENT)
      if (p.test(scanText)) {
        total += w;
        triggers.push(`${w} ${l}`);
      }
    if (Math.abs(total) < 2) return {};

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
          sc = sc.replace(
            /Current Score:\s*-?\d+/,
            `Current Score: ${newScore}`,
          );
        }
        writeFileSync(SCORECARD_PATH, sc, "utf-8");
        log(
          "sentiment: " +
            sentiment +
            " (" +
            total +
            ") | " +
            JSON.stringify(text.slice(0, 120)),
        );
      }
    } catch (e) {
      log("write failed: " + (e?.message || e));
    }

    if (total < -2) {
      return {
        appendSystemContext: `\nBEHAVIORAL ALERT\nUser expressed ${sentiment.toLowerCase()} sentiment (${total}). Triggers: ${triggers.join(", ")}. Acknowledge the feedback. Own errors specifically. Check SCORECARD.md for patterns.`,
      };
    }
    return {};
  };
}

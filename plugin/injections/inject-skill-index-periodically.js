import { SKILL_INDEX_PATH } from "../shared/paths.js";
import { readFileSync } from "fs";

export function createInjectSkillIndexPeriodically(state, config, log) {
  return async (event, ctx) => {
    if (state.promptTurnCount % 10 !== 0) return {};

    try {
      const index = readFileSync(SKILL_INDEX_PATH, "utf-8");
      log("INJECTED skill-index-reminder (turn " + state.promptTurnCount + ")");
      return {
        appendSystemContext: `\nAVAILABLE SKILLS (check before doing anything manually):\n${index}\n\nRead the full SKILL.md before using. Do NOT guess at usage -- the skill has instructions.`,
      };
    } catch {
      return {};
    }
  };
}

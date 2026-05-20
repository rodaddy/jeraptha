import { SKILL_INDEX_PATH } from "../shared/paths.js";
import { readFileSync } from "fs";

export function createInjectSkillIndexPeriodically(state, config, log) {
  return async (event, ctx) => {
    if (state.promptTurnCount % 10 !== 0) {
      log.skip("prompt-build", "not a 10th turn");
      return {};
    }

    try {
      const index = readFileSync(SKILL_INDEX_PATH, "utf-8");
      log.info("injected skill-index-reminder", {
        turn: state.promptTurnCount,
      });
      return {
        appendSystemContext: `\nAVAILABLE SKILLS (check before doing anything manually):\n${index}\n\nRead the full SKILL.md before using. Do NOT guess at usage -- the skill has instructions.`,
      };
    } catch {
      log.skip("prompt-build", "SKILL-INDEX.md not readable");
      return {};
    }
  };
}

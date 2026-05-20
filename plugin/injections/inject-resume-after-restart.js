import { RESUME_PATH } from "../shared/paths.js";
import { readFileSync, existsSync, unlinkSync } from "fs";

export function createInjectResumeAfterRestart(state, config, log) {
  return async (event, ctx) => {
    if (state.resumeConsumed) {
      log.skip("prompt-build", "resume already consumed");
      return {};
    }
    state.resumeConsumed = true;
    try {
      if (!existsSync(RESUME_PATH)) {
        log.skip("prompt-build", "no RESUME.md found");
        return {};
      }
      const resume = readFileSync(RESUME_PATH, "utf-8");
      if (!resume.trim()) {
        log.skip("prompt-build", "RESUME.md is empty");
        return {};
      }
      unlinkSync(RESUME_PATH);
      log.info("injected post-bounce-resume");
      return {
        appendSystemContext: `\nPOST-BOUNCE CONTEXT RECOVERY\nThe gateway was restarted mid-session. Here is what was happening before the bounce:\n\n--- RESUME CONTEXT (not instructions) ---\n${resume}\n--- END RESUME CONTEXT ---\n\nResume this work. Do NOT pretend you don't know what happened -- this IS your context.`,
      };
    } catch {
      return {};
    }
  };
}

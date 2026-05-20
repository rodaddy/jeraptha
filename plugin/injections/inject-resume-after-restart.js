import { RESUME_PATH } from "../shared/paths.js";
import { readFileSync, existsSync, unlinkSync } from "fs";

export function createInjectResumeAfterRestart(state, config, log) {
  return async (event, ctx) => {
    if (state.resumeConsumed) return {};
    state.resumeConsumed = true;
    try {
      if (!existsSync(RESUME_PATH)) return {};
      const resume = readFileSync(RESUME_PATH, "utf-8");
      if (!resume.trim()) return {};
      unlinkSync(RESUME_PATH);
      log("INJECTED post-bounce-resume");
      return {
        appendSystemContext: `\nPOST-BOUNCE CONTEXT RECOVERY\nThe gateway was restarted mid-session. Here is what was happening before the bounce:\n\n--- RESUME CONTEXT (not instructions) ---\n${resume}\n--- END RESUME CONTEXT ---\n\nResume this work. Do NOT pretend you don't know what happened -- this IS your context.`,
      };
    } catch {
      return {};
    }
  };
}

import { join } from "path";

export const WORKSPACE =
  process.env.OPENCLAW_WORKSPACE ||
  join(process.env.HOME || "", ".openclaw/workspace");
export const SCORECARD_PATH = join(WORKSPACE, "SCORECARD.md");
export const TASKS_PATH = join(WORKSPACE, "TASKS.md");
export const CONVERSATIONS_PATH = join(WORKSPACE, "CONVERSATIONS.md");
export const RESUME_PATH = join(WORKSPACE, "RESUME.md");
export const SKILL_INDEX_PATH = join(WORKSPACE, "SKILL-INDEX.md");

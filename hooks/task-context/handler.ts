// task-context hook -- inject TASKS.md into prompt every N turns
// Event: before_prompt_build
// Prevents cross-channel amnesia by keeping active tasks visible at all times
// STALLED tasks get injected EVERY turn (not every N) -- they're urgent

import { readFileSync } from "fs";
import { join } from "path";

const INJECT_EVERY = 3; // Normal tasks: every 3 turns
let turnCount = 0;

// Path to TASKS.md in the workspace
const TASKS_PATH = join(
  process.env.HOME || "/Users/rico",
  ".openclaw/workspace/TASKS.md"
);

const SOP_REMINDER = `
## ⚠️ SOP COMPLIANCE REMINDER
Before starting ANY process-driven work (deploy, git workflow, swarm, PR, agent spawn, schema change):
1. Search OB: \`~/.local/bin/mcp2cli open-brain search_brain --params '{"query":"SOP <task-type>","limit":5}'\`
2. If an SOP exists, FOLLOW IT. Do not improvise.
3. If no SOP exists, note it in TASKS.md as "SOP: TODO: create"
4. Update TASKS.md with what you are doing and why BEFORE you start doing it.
`;

const handler = async (event: any) => {
  turnCount++;

  let tasksContent = "";
  try {
    tasksContent = readFileSync(TASKS_PATH, "utf-8");
  } catch {
    // TASKS.md doesn't exist yet -- nudge to create it
    if (turnCount % INJECT_EVERY === 0) {
      return {
        prompt:
          (event.context?.prompt || "") +
          "\n\n📋 TASKS.md NOT FOUND. Create it immediately. Every task Rico gives you must be tracked in TASKS.md.",
      };
    }
    return undefined;
  }

  // Check if there are any STALLED tasks -- these get injected EVERY turn
  const hasStalled = tasksContent.includes("🚨 STALLED");

  // If no stalled tasks and not an injection turn, skip
  if (!hasStalled && turnCount % INJECT_EVERY !== 0) {
    return undefined;
  }

  // Extract active, pending, and infrastructure sections
  const lines = tasksContent.split("\n");
  const activeSection: string[] = [];
  let capturing = false;

  for (const line of lines) {
    // Start capturing at Active, Pending, or Infrastructure headers
    if (
      line.match(/^## 🔴 Active/) ||
      line.match(/^## 🟡 Pending/) ||
      line.match(/^## 🏗️ Infrastructure/)
    ) {
      capturing = true;
      activeSection.push(line);
      continue;
    }

    // Stop capturing at Completed or Template sections
    if (
      line.match(/^## ✅ Completed/) ||
      line.match(/^## 📋 Task Template/)
    ) {
      capturing = false;
      continue;
    }

    if (capturing) {
      activeSection.push(line);
    }
  }

  const activeContent = activeSection.join("\n").trim();

  if (!activeContent || activeContent.includes("_None right now")) {
    if (turnCount % INJECT_EVERY === 0) {
      return {
        prompt:
          (event.context?.prompt || "") +
          "\n\n📋 TASKS.md: No active tasks. If Rico has asked you to do something, ADD IT to TASKS.md." +
          SOP_REMINDER,
      };
    }
    return undefined;
  }

  // Build the injection -- STALLED tasks get extra emphasis
  let injection = "";

  if (hasStalled) {
    injection = `
## 🚨🚨🚨 STALLED TASK ALERT 🚨🚨🚨
**You have a STALLED task in TASKS.md. This is your TOP PRIORITY.**
**Drop what you are doing and address the stalled task IMMEDIATELY.**
**Send a message to the stalled task's channel and start working on it.**

${activeContent}

${SOP_REMINDER}
`;
  } else {
    injection = `
## 📋 ACTIVE TASKS (from TASKS.md -- cross-channel awareness)
${activeContent}

${SOP_REMINDER}
**Remember:** Update TASKS.md status as you work. If you finish something, mark it done with full detail. If you start something new, add it.
`;
  }

  return {
    prompt: (event.context?.prompt || "") + "\n\n" + injection,
  };
};

export default handler;

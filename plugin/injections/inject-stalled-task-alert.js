import { TASKS_PATH } from "../shared/paths.js";
import { readFileSync } from "fs";

export function createInjectStalledTaskAlert(state, config, log) {
  return async (event, ctx) => {
    let tasksContent = "";
    try {
      tasksContent = readFileSync(TASKS_PATH, "utf-8");
    } catch {
      return {};
    }

    if (!tasksContent.includes("STALLED")) return {};

    const lines = tasksContent.split("\n");
    const stalled = [];
    let capturing = false;
    for (const line of lines) {
      if (/STALLED/.test(line)) {
        capturing = true;
        stalled.push(line);
        continue;
      }
      if (capturing) {
        stalled.push(line);
        if (line.trim() === "" || /^### /.test(line)) capturing = false;
      }
    }

    log("INJECTED task-stalled-alert");
    return {
      appendSystemContext: `\nSTALLED TASK ALERT -- DROP EVERYTHING\n${stalled.join("\n")}\n\nAddress this IMMEDIATELY. Update TASKS.md with current status.`,
    };
  };
}

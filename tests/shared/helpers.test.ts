import { describe, test, expect } from "bun:test";
import {
  isComplianceExec,
  isHeartbeatSession,
  getToolName,
  getCommand,
  getMessageText,
  hasShellControl,
  isContextRecoveryCommand,
  isSkillConsultCommand,
  isWriteCommand,
  touchesTasksFile,
} from "../../plugin/shared/helpers.js";

describe("isComplianceExec", () => {
  test("returns true for mcp2cli commands", () => {
    expect(isComplianceExec({ command: "mcp2cli open-brain search_all" })).toBe(
      true,
    );
    expect(isComplianceExec({ cmd: "~/.local/bin/mcp2cli open-brain" })).toBe(
      true,
    );
  });

  test("returns false for non-compliance commands", () => {
    expect(isComplianceExec({ command: "git push origin main" })).toBe(false);
    expect(isComplianceExec({ command: "npm install" })).toBe(false);
    expect(isComplianceExec({})).toBe(false);
    expect(isComplianceExec(null)).toBe(false);
  });
});

describe("isHeartbeatSession", () => {
  test("returns true for heartbeat sessions", () => {
    expect(isHeartbeatSession({ sessionKey: "heartbeat-session-123" })).toBe(
      true,
    );
    expect(isHeartbeatSession({ sessionKey: "isolated-task-abc" })).toBe(true);
  });

  test("returns false for regular sessions", () => {
    expect(isHeartbeatSession({ sessionKey: "main-session" })).toBe(false);
    expect(isHeartbeatSession({ sessionKey: "" })).toBe(false);
    expect(isHeartbeatSession({})).toBe(false);
    expect(isHeartbeatSession(null)).toBe(false);
  });
});

describe("getToolName", () => {
  test("returns lowercase tool name", () => {
    expect(getToolName({ toolName: "Exec" })).toBe("exec");
    expect(getToolName({ toolName: "MESSAGE" })).toBe("message");
  });

  test("returns empty string for missing tool name", () => {
    expect(getToolName({})).toBe("");
    expect(getToolName({ toolName: "" })).toBe("");
  });
});

describe("getCommand", () => {
  test("extracts command from params", () => {
    expect(getCommand({ command: "git status" })).toBe("git status");
    expect(getCommand({ cmd: "ls -la" })).toBe("ls -la");
  });

  test("prefers command over cmd", () => {
    expect(getCommand({ command: "first", cmd: "second" })).toBe("first");
  });

  test("returns empty string for missing command", () => {
    expect(getCommand({})).toBe("");
    expect(getCommand(null)).toBe("");
  });
});

describe("getMessageText", () => {
  test("extracts text from params", () => {
    expect(getMessageText({ text: "hello" })).toBe("hello");
    expect(getMessageText({ content: "world" })).toBe("world");
  });

  test("prefers text over content", () => {
    expect(getMessageText({ text: "first", content: "second" })).toBe("first");
  });

  test("returns empty string for missing text", () => {
    expect(getMessageText({})).toBe("");
    expect(getMessageText(null)).toBe("");
  });
});

describe("context recovery helpers", () => {
  test("detects only workspace TASKS.md paths", () => {
    expect(touchesTasksFile("cat ~/.openclaw/workspace/TASKS.md")).toBe(true);
    expect(touchesTasksFile("cat /workspace/TASKS.md")).toBe(true);
    expect(touchesTasksFile("cat /tmp/TASKS.md")).toBe(false);
    expect(touchesTasksFile("cat README_TASKS.md")).toBe(false);
    expect(touchesTasksFile("# TASKS.md")).toBe(false);
  });

  test("does not treat quoted pipes as shell control", () => {
    expect(
      hasShellControl(
        "rg 'deploy|docker' ~/.openclaw/workspace/SKILL-INDEX.md",
      ),
    ).toBe(false);
  });

  test("detects dangerous shell control and substitutions", () => {
    expect(hasShellControl("cat TASKS.md && git push")).toBe(true);
    expect(hasShellControl("cat TASKS.md\ngit push")).toBe(true);
    expect(hasShellControl('printf "$(deploy-service app)" > TASKS.md')).toBe(
      true,
    );
    expect(hasShellControl("cat `deploy-service app` SKILL.md")).toBe(true);
  });

  test("requires context write targets, not just context mentions", () => {
    expect(
      isWriteCommand("printf '%s\\n' done > ~/.openclaw/workspace/TASKS.md"),
    ).toBe(true);
    expect(isWriteCommand("tee -a ~/.openclaw/workspace/TASKS.md")).toBe(true);
    expect(
      isWriteCommand("cat ~/.openclaw/workspace/TASKS.md > /dev/null"),
    ).toBe(false);
    expect(isWriteCommand("echo x > /tmp/out # TASKS.md")).toBe(false);
  });

  test("rejects mixed or subprocess-capable recovery commands", () => {
    expect(
      isContextRecoveryCommand(
        "deploy-service app && printf '%s\\n' done > ~/.openclaw/workspace/TASKS.md",
      ),
    ).toBe(false);
    expect(
      isSkillConsultCommand(
        "awk 'BEGIN{system(\"docker compose up -d\")}' ~/.openclaw/workspace/SKILL-INDEX.md",
      ),
    ).toBe(false);
    expect(
      isSkillConsultCommand(
        "find . -name SKILL.md -exec git push origin main {} +",
      ),
    ).toBe(false);
    expect(
      isSkillConsultCommand(
        "sed '1e docker compose up -d' ~/.openclaw/workspace/SKILL-INDEX.md",
      ),
    ).toBe(false);
    expect(
      isSkillConsultCommand("ls ~/.openclaw/workspace/SKILL-INDEX.md"),
    ).toBe(false);
    expect(
      isContextRecoveryCommand(
        "sed -i '1e git push origin main' ~/.openclaw/workspace/TASKS.md",
      ),
    ).toBe(false);
    expect(
      isContextRecoveryCommand(
        'node -e \'fs.writeFileSync("~/.openclaw/workspace/TASKS.md", "deploy")\'',
      ),
    ).toBe(false);
  });
});

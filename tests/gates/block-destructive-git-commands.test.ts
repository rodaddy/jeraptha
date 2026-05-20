import { describe, test, expect, beforeEach } from "bun:test";
import { createBlockDestructiveGitCommands } from "../../plugin/gates/block-destructive-git-commands.js";
import { createMockState } from "../_fixtures/create-mock-state.ts";
import { createMockLogger } from "../_fixtures/create-mock-logger.ts";
import {
  createToolCallEvent,
  createMockContext,
  createHeartbeatContext,
} from "../_fixtures/create-mock-event.ts";

describe("block-destructive-git-commands", () => {
  let state: any;
  let handler: any;
  let log: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    state = createMockState();
    log = createMockLogger();
    handler = createBlockDestructiveGitCommands(state, {}, log);
  });

  // --- Destructive git commands: blocked ---

  test("blocks git reset", async () => {
    const event = createToolCallEvent("exec", {
      command: "git reset --hard HEAD~1",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("DESTRUCTIVE GIT BLOCK");
  });

  test("blocks git clean -f", async () => {
    const event = createToolCallEvent("bash", { command: "git clean -fd" });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
  });

  test("blocks git checkout .", async () => {
    const event = createToolCallEvent("exec", { command: "git checkout . " });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
  });

  test("blocks git restore .", async () => {
    const event = createToolCallEvent("exec", { command: "git restore . " });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
  });

  test("blocks git push --force", async () => {
    const event = createToolCallEvent("exec", {
      command: "git push origin main --force",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
  });

  test("blocks git push -f", async () => {
    const event = createToolCallEvent("exec", {
      command: "git push origin main -f",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
  });

  test("blocks git branch -D", async () => {
    const event = createToolCallEvent("exec", {
      command: "git branch -D feature-branch",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
  });

  test("blocks git stash drop", async () => {
    const event = createToolCallEvent("exec", { command: "git stash drop" });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
  });

  test("blocks git stash clear", async () => {
    const event = createToolCallEvent("exec", { command: "git stash clear" });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
  });

  // --- cd+git chains: blocked ---

  test("blocks cd && git chains", async () => {
    const event = createToolCallEvent("exec", {
      command: "cd /project && git push origin main",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("CHAIN BLOCK");
  });

  test("blocks cd ; git chains", async () => {
    const event = createToolCallEvent("exec", {
      command: "cd /project ; git status",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("CHAIN BLOCK");
  });

  // --- Heredoc writes: blocked ---

  test("blocks heredoc file writes", async () => {
    const event = createToolCallEvent("exec", {
      command: "cat > /etc/config.yml <<EOF\nkey: value\nEOF",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("HEREDOC BLOCK");
  });

  test("allows heredoc in git commit message", async () => {
    const event = createToolCallEvent("exec", {
      command: 'git commit -m "$(cat <<EOF\ncommit message\nEOF\n)"',
    });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });

  // --- Heartbeat bypass ---

  test("allows all commands in heartbeat sessions", async () => {
    const event = createToolCallEvent("exec", {
      command: "git reset --hard HEAD",
    });
    const result = await handler(event, createHeartbeatContext());
    expect(result).toEqual({});
  });

  // --- Safe git commands: allowed ---

  test("allows safe git commands", async () => {
    const event = createToolCallEvent("exec", { command: "git status" });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });

  test("allows git commit", async () => {
    const event = createToolCallEvent("exec", {
      command: 'git commit -m "fix: update config"',
    });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });

  test("allows git push (non-force)", async () => {
    const event = createToolCallEvent("exec", {
      command: "git push origin feature-branch",
    });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });

  // --- Non-exec tools: allowed ---

  test("ignores non-exec tool calls", async () => {
    const event = createToolCallEvent("write", { path: "/some/file.txt" });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });
});

import { describe, test, expect, beforeEach } from "bun:test";
import { createBlockSedOnWorkspace } from "../../plugin/gates/block-sed-on-workspace.js";
import { createMockState } from "../_fixtures/create-mock-state.ts";
import {
  createToolCallEvent,
  createMockContext,
} from "../_fixtures/create-mock-event.ts";

describe("block-sed-on-workspace", () => {
  let state: any;
  let handler: any;
  const log = () => {};

  beforeEach(() => {
    state = createMockState();
    handler = createBlockSedOnWorkspace(state, {}, log);
  });

  // --- Allowed: sed on required workspace files (TASKS, CONVERSATIONS, SCORECARD) ---

  test("allows sed on TASKS.md (required by freshness gates)", async () => {
    const event = createToolCallEvent("exec", {
      command: "sed -i 's/IN_PROGRESS/DONE/' ~/.openclaw/workspace/TASKS.md",
    });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });

  test("allows sed on SCORECARD.md (required by heartbeat gate)", async () => {
    const event = createToolCallEvent("bash", {
      command: "sed 's/Score: 5/Score: 6/' ~/.openclaw/workspace/SCORECARD.md",
    });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });

  test("allows sed on CONVERSATIONS.md (required by freshness gates)", async () => {
    const event = createToolCallEvent("exec", {
      command:
        "sed -i '' 's/old/new/' /home/agent/.openclaw/workspace/CONVERSATIONS.md",
    });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });

  // --- Blocked: sed on OTHER workspace .md files ---

  test("blocks sed on workspace IDENTITY.md", async () => {
    const event = createToolCallEvent("exec", {
      command: "sed -i 's/old/new/' ~/.openclaw/workspace/IDENTITY.md",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("SED BLOCK");
  });

  test("blocks sed on workspace SOUL.md", async () => {
    const event = createToolCallEvent("exec", {
      command: "sed -i 's/old/new/' ~/.openclaw/workspace/SOUL.md",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
  });

  // --- Allowed: sed on non-workspace files ---

  test("allows sed on non-workspace files", async () => {
    const event = createToolCallEvent("exec", {
      command: "sed -i 's/old/new/' /home/agent/project/config.yml",
    });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });

  // --- Allowed: non-exec tools ---

  test("ignores write tool calls", async () => {
    const event = createToolCallEvent("write", {
      path: "~/.openclaw/workspace/TASKS.md",
    });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });
});

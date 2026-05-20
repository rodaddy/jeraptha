import { describe, test, expect, beforeEach } from "bun:test";
import { createBlockStaleConversationFile } from "../../plugin/gates/block-stale-conversation-file.js";
import { createMockState } from "../_fixtures/create-mock-state.ts";
import { createMockLogger } from "../_fixtures/create-mock-logger.ts";
import {
  createToolCallEvent,
  createMockContext,
  createHeartbeatContext,
} from "../_fixtures/create-mock-event.ts";

describe("block-stale-conversation-file", () => {
  let state: any, handler: any;
  let log: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    state = createMockState({ currentTurn: 25, lastConversationsWriteTurn: 0 });
    log = createMockLogger();
    handler = createBlockStaleConversationFile(
      state,
      { conversationFreshnessTurns: 15, gracePeriodTurns: 5 },
      log,
    );
  });

  test("blocks exec after threshold turns without conversation file update", async () => {
    const event = createToolCallEvent("exec", { command: "npm run build" });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("CONVERSATIONS GATE");
    expect(result.blockReason).toContain("25 turns");
  });

  test("blocks message after threshold turns without conversation file update", async () => {
    const event = createToolCallEvent("message", {
      text: "Done with the task",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("CONVERSATIONS GATE");
  });

  test("allows when within threshold", async () => {
    state.lastConversationsWriteTurn = 15; // only 10 turns ago, within 15 threshold
    const event = createToolCallEvent("exec", { command: "npm run build" });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("allows during grace period", async () => {
    state.currentTurn = 4;
    const event = createToolCallEvent("exec", { command: "npm run build" });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("allows compliance exec even when stale", async () => {
    const event = createToolCallEvent("exec", {
      command: "mcp2cli open-brain search_all",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("ignores non-exec/message tool types", async () => {
    const event = createToolCallEvent("memory_search", { query: "test" });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("bypasses all checks for heartbeat sessions", async () => {
    const event = createToolCallEvent("exec", { command: "npm run build" });
    const result = await handler(event, createHeartbeatContext());
    expect(result.block).toBeUndefined();
  });

  test("includes blocked action in the block message", async () => {
    const event = createToolCallEvent("bash", { command: "git status" });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("git status");
  });
});

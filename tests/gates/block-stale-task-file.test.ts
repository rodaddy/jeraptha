import { describe, test, expect, beforeEach } from "bun:test";
import { createBlockStaleTaskFile } from "../../plugin/gates/block-stale-task-file.js";
import { createMockState } from "../_fixtures/create-mock-state.ts";
import {
  createToolCallEvent,
  createMockContext,
  createHeartbeatContext,
} from "../_fixtures/create-mock-event.ts";

describe("block-stale-task-file", () => {
  let state: any, handler: any;
  const log = () => {};

  beforeEach(() => {
    state = createMockState({ currentTurn: 20, lastTasksWriteTurn: 0 });
    handler = createBlockStaleTaskFile(
      state,
      { taskFreshnessTurns: 10, gracePeriodTurns: 5 },
      log,
    );
  });

  test("blocks exec after threshold turns without task file update", async () => {
    const event = createToolCallEvent("exec", { command: "npm run build" });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("TASK GATE");
    expect(result.blockReason).toContain("20 turns");
  });

  test("blocks message after threshold turns without task file update", async () => {
    const event = createToolCallEvent("message", {
      text: "Here is the result",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("TASK GATE");
  });

  test("allows when within threshold", async () => {
    state.lastTasksWriteTurn = 15; // only 5 turns ago, within 10 threshold
    const event = createToolCallEvent("exec", { command: "npm run build" });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("allows during grace period", async () => {
    state.currentTurn = 3;
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
    const event = createToolCallEvent("exec", {
      command: "bun run test:integration",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("bun run test:integration");
  });
});

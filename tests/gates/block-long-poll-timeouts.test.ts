import { describe, test, expect, beforeEach } from "bun:test";
import { createBlockLongPollTimeouts } from "../../plugin/gates/block-long-poll-timeouts.js";
import { createMockState } from "../_fixtures/create-mock-state.ts";
import { createMockLogger } from "../_fixtures/create-mock-logger.ts";
import {
  createToolCallEvent,
  createMockContext,
  createHeartbeatContext,
} from "../_fixtures/create-mock-event.ts";

describe("block-long-poll-timeouts", () => {
  let state: any;
  let handler: any;
  let log: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    state = createMockState();
    log = createMockLogger();
    handler = createBlockLongPollTimeouts(state, {}, log);
  });

  // --- Blocked: long poll timeouts ---

  test("blocks process poll with timeout > 10s (timeout field)", async () => {
    const event = createToolCallEvent("process", {
      action: "poll",
      timeout: 30000,
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("DEAF POLL BLOCKED");
    expect(result.blockReason).toContain("30000ms");
    expect(result.blockReason).toContain("30s");
  });

  test("blocks process poll with timeoutMs > 10s", async () => {
    const event = createToolCallEvent("process", {
      action: "poll",
      timeoutMs: 60000,
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("60000ms");
  });

  test("blocks process poll at boundary (10001ms)", async () => {
    const event = createToolCallEvent("process", {
      action: "poll",
      timeout: 10001,
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
  });

  // --- Allowed: short poll timeouts ---

  test("allows process poll with timeout <= 10s", async () => {
    const event = createToolCallEvent("process", {
      action: "poll",
      timeout: 10000,
    });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });

  test("allows process poll with timeout = 5000ms", async () => {
    const event = createToolCallEvent("process", {
      action: "poll",
      timeout: 5000,
    });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });

  test("allows process poll with no timeout specified", async () => {
    const event = createToolCallEvent("process", { action: "poll" });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });

  // --- Allowed: non-poll process actions ---

  test("allows process actions other than poll", async () => {
    const event = createToolCallEvent("process", {
      action: "start",
      timeout: 60000,
    });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });

  // --- Allowed: non-process tools ---

  test("ignores non-process tool calls", async () => {
    const event = createToolCallEvent("exec", { command: "sleep 30" });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });

  // --- Heartbeat bypass ---

  test("allows long polls in heartbeat sessions", async () => {
    const event = createToolCallEvent("process", {
      action: "poll",
      timeout: 60000,
    });
    const result = await handler(event, createHeartbeatContext());
    expect(result).toEqual({});
  });

  // --- Edge case: non-numeric timeout ---

  test("allows process poll with non-numeric timeout", async () => {
    const event = createToolCallEvent("process", {
      action: "poll",
      timeout: "30000",
    });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });
});

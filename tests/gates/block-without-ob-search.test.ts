import { describe, test, expect, beforeEach } from "bun:test";
import { createBlockWithoutObSearch } from "../../plugin/gates/block-without-ob-search.js";
import { createMockState } from "../_fixtures/create-mock-state.ts";
import { createMockLogger } from "../_fixtures/create-mock-logger.ts";
import {
  createToolCallEvent,
  createMockContext,
  createHeartbeatContext,
} from "../_fixtures/create-mock-event.ts";

describe("block-without-ob-search", () => {
  let state: any, handler: any;
  let log: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    state = createMockState();
    log = createMockLogger();
    handler = createBlockWithoutObSearch(state, {}, log);
  });

  test("blocks factual question without OB search", async () => {
    const event = createToolCallEvent("message", {
      text: "What is the IP of the database server?",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("OB GATE");
  });

  test("allows factual question after OB search", async () => {
    // Simulate OB search first
    const obEvent = createToolCallEvent("exec", {
      command:
        'mcp2cli open-brain search_all --params \'{"query": "database IP"}\'',
    });
    await handler(obEvent, createMockContext());
    expect(state.obQueriedThisTurn).toBe(true);

    // Now the question should pass
    const event = createToolCallEvent("message", {
      text: "What is the IP of the database server?",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("allows exempt questions without OB search", async () => {
    const event = createToolCallEvent("message", {
      text: "Should I proceed with the deployment?",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("blocks wildcard OB query", async () => {
    // The gate does JSON.stringify(event.params) and regex-tests the result.
    // Params must produce "query":"*" in the stringified output.
    const event = createToolCallEvent("exec", {
      command: "open-brain",
      query: "*",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("Do NOT use");
  });

  test("blocks empty OB query", async () => {
    const event = createToolCallEvent("exec", {
      command: "open-brain",
      query: " ",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("Do NOT use");
  });

  test("blocks grep without OB search when factual question detected", async () => {
    state.factualQuestionThisTurn = true;
    const event = createToolCallEvent("exec", {
      command: "grep -r 'database' src/",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("OB GATE");
  });

  test("allows grep without OB search when no factual question", async () => {
    state.factualQuestionThisTurn = false;
    const event = createToolCallEvent("exec", {
      command: "grep -r 'database' src/",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("allows compliance exec (mcp2cli) without OB search", async () => {
    const event = createToolCallEvent("exec", {
      command: "mcp2cli some-service some-tool",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("allows grep targeting exempt paths without OB search", async () => {
    const event = createToolCallEvent("exec", {
      command: "grep 'status' TASKS.md",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("bypasses all checks for heartbeat sessions", async () => {
    const event = createToolCallEvent("message", {
      text: "What is the IP of the server?",
    });
    const result = await handler(event, createHeartbeatContext());
    expect(result.block).toBeUndefined();
  });

  test("sets obQueriedThisTurn on memory_search", async () => {
    const event = createToolCallEvent("memory_search", {
      query: "database config",
    });
    await handler(event, createMockContext());
    expect(state.obQueriedThisTurn).toBe(true);
  });
});

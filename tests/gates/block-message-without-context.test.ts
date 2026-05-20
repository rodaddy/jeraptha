import { describe, test, expect, beforeEach } from "bun:test";
import { createBlockMessageWithoutContext } from "../../plugin/gates/block-message-without-context.js";
import {
  createMockState,
  createActiveSessionState,
} from "../_fixtures/create-mock-state";
import { createMockLogger } from "../_fixtures/create-mock-logger.ts";
import {
  createToolCallEvent,
  createMockContext,
  createHeartbeatContext,
} from "../_fixtures/create-mock-event";

describe("block-message-without-context", () => {
  let state: ReturnType<typeof createMockState>;
  let config: Record<string, any>;
  let log: ReturnType<typeof createMockLogger>;
  let gate: ReturnType<typeof createBlockMessageWithoutContext>;

  beforeEach(() => {
    state = createMockState({ currentTurn: 10 });
    config = { gracePeriodTurns: 5, commGateThreshold: 8 };
    log = createMockLogger();
    gate = createBlockMessageWithoutContext(state, config, log);
  });

  test("blocks message send when context not loaded", async () => {
    state.tasksReadThisSession = false;
    state.conversationsReadThisSession = false;
    state.obContextLoadedThisSession = false;

    const event = createToolCallEvent("message", { text: "hello" });
    const result = await gate(event, createMockContext());

    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("CONTEXT GATE");
  });

  test("allows when all context loaded", async () => {
    state.tasksReadThisSession = true;
    state.conversationsReadThisSession = true;
    state.obContextLoadedThisSession = true;

    const event = createToolCallEvent("message", { text: "hello" });
    const result = await gate(event, createMockContext());

    expect(result.block).toBeUndefined();
  });

  test("allows during grace period", async () => {
    state.currentTurn = 3;
    state.tasksReadThisSession = false;
    state.conversationsReadThisSession = false;
    state.obContextLoadedThisSession = false;

    const event = createToolCallEvent("message", { text: "hello" });
    const result = await gate(event, createMockContext());

    expect(result.block).toBeUndefined();
  });

  test("shows which context is missing in block reason", async () => {
    state.tasksReadThisSession = true;
    state.conversationsReadThisSession = false;
    state.obContextLoadedThisSession = false;

    const event = createToolCallEvent("message", { text: "hello" });
    const result = await gate(event, createMockContext());

    expect(result.block).toBe(true);
    expect(result.blockReason).toContain(
      "Missing: CONVERSATIONS.md, OB context",
    );
    expect(result.blockReason).not.toContain("Missing: TASKS.md");
  });

  test("bypasses for heartbeat sessions", async () => {
    state.tasksReadThisSession = false;
    state.conversationsReadThisSession = false;
    state.obContextLoadedThisSession = false;

    const event = createToolCallEvent("message", { text: "hello" });
    const result = await gate(event, createHeartbeatContext());

    expect(result.block).toBeUndefined();
  });

  test("does not gate non-message tools", async () => {
    state.tasksReadThisSession = false;

    const event = createToolCallEvent("exec", { command: "ls" });
    const result = await gate(event, createMockContext());

    expect(result.block).toBeUndefined();
  });

  test("allows message when toolCallsSinceMessage exceeds commGateThreshold", async () => {
    state.tasksReadThisSession = false;
    state.conversationsReadThisSession = false;
    state.obContextLoadedThisSession = false;
    state.toolCallsSinceMessage = 10;

    const event = createToolCallEvent("message", { text: "hello" });
    const result = await gate(event, createMockContext());

    expect(result.block).toBeUndefined();
  });
});

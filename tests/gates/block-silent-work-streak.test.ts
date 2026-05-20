import { describe, test, expect, beforeEach } from "bun:test";
import { createBlockSilentWorkStreak } from "../../plugin/gates/block-silent-work-streak.js";
import { createMockState } from "../_fixtures/create-mock-state";
import {
  createToolCallEvent,
  createMockContext,
  createHeartbeatContext,
} from "../_fixtures/create-mock-event";

describe("block-silent-work-streak", () => {
  let state: ReturnType<typeof createMockState>;
  let config: Record<string, any>;
  let logs: string[];
  let log: (msg: string) => void;
  let gate: ReturnType<typeof createBlockSilentWorkStreak>;

  beforeEach(() => {
    state = createMockState({ currentTurn: 10, toolCallsSinceMessage: 12 });
    config = { gracePeriodTurns: 5, commGateThreshold: 8 };
    logs = [];
    log = (msg: string) => logs.push(msg);
    gate = createBlockSilentWorkStreak(state, config, log);
  });

  test("blocks after N tool calls without message", async () => {
    const event = createToolCallEvent("exec", { command: "npm run build" });
    const result = await gate(event, createMockContext());

    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("COMMS GATE");
    expect(result.blockReason).toContain("12 tool calls");
  });

  test("allows within threshold", async () => {
    state.toolCallsSinceMessage = 5;

    const event = createToolCallEvent("exec", { command: "npm run build" });
    const result = await gate(event, createMockContext());

    expect(result.block).toBeUndefined();
  });

  test("grace period bypass", async () => {
    state.currentTurn = 3;

    const event = createToolCallEvent("exec", { command: "npm run build" });
    const result = await gate(event, createMockContext());

    expect(result.block).toBeUndefined();
  });

  test("compliance exec bypass", async () => {
    const event = createToolCallEvent("exec", {
      command: "mcp2cli open-brain search",
    });
    const result = await gate(event, createMockContext());

    expect(result.block).toBeUndefined();
  });

  test("only gates exec/bash, not write or edit", async () => {
    const writeEvent = createToolCallEvent("write", {
      path: "/tmp/test.md",
      content: "hello",
    });
    const editEvent = createToolCallEvent("edit", { path: "/tmp/test.md" });

    const writeResult = await gate(writeEvent, createMockContext());
    const editResult = await gate(editEvent, createMockContext());

    expect(writeResult.block).toBeUndefined();
    expect(editResult.block).toBeUndefined();
  });

  test("heartbeat session bypass", async () => {
    const event = createToolCallEvent("exec", { command: "npm run build" });
    const result = await gate(event, createHeartbeatContext());

    expect(result.block).toBeUndefined();
  });

  test("includes blocked command in reason", async () => {
    const event = createToolCallEvent("bash", {
      command: "docker compose up -d",
    });
    const result = await gate(event, createMockContext());

    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("docker compose up -d");
  });
});

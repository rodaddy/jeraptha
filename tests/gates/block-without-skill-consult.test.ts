import { describe, test, expect, beforeEach } from "bun:test";
import { createBlockWithoutSkillConsult } from "../../plugin/gates/block-without-skill-consult.js";
import { createMockState } from "../_fixtures/create-mock-state.ts";
import {
  createToolCallEvent,
  createMockContext,
  createHeartbeatContext,
} from "../_fixtures/create-mock-event.ts";

describe("block-without-skill-consult", () => {
  let state: any, handler: any;
  const log = () => {};

  beforeEach(() => {
    state = createMockState({ currentTurn: 10 });
    handler = createBlockWithoutSkillConsult(
      state,
      { gracePeriodTurns: 5 },
      log,
    );
  });

  test("blocks deploy command without skill consult", async () => {
    const event = createToolCallEvent("exec", {
      command: "deploy-service my-app",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("SKILL GATE");
    expect(result.blockReason).toContain("deploy");
  });

  test("blocks infrastructure command without skill consult", async () => {
    const event = createToolCallEvent("bash", {
      command: "docker compose up -d",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("infrastructure");
  });

  test("blocks swarm command without skill consult", async () => {
    const event = createToolCallEvent("exec", { command: "run-swarm review" });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("code-swarm");
  });

  test("allows after skill consult", async () => {
    state.skillConsultedThisTurn = true;
    const event = createToolCallEvent("exec", {
      command: "deploy-service my-app",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("allows during grace period", async () => {
    state.currentTurn = 3;
    const event = createToolCallEvent("exec", {
      command: "deploy-service my-app",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("allows non-ops commands", async () => {
    const event = createToolCallEvent("exec", { command: "cat src/index.ts" });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("allows compliance exec", async () => {
    const event = createToolCallEvent("exec", {
      command: "mcp2cli deploy-tool check-status",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("ignores non-exec tool types", async () => {
    const event = createToolCallEvent("message", {
      text: "let me deploy this",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("bypasses all checks for heartbeat sessions", async () => {
    const event = createToolCallEvent("exec", {
      command: "deploy-service my-app",
    });
    const result = await handler(event, createHeartbeatContext());
    expect(result.block).toBeUndefined();
  });
});

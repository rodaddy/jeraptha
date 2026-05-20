import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockState } from "../_fixtures/create-mock-state";
import { createMockLogger } from "../_fixtures/create-mock-logger.ts";
import {
  createToolCallEvent,
  createMockContext,
  createHeartbeatContext,
} from "../_fixtures/create-mock-event";

// Mock fs before importing the gate
const mockStatSync = mock(() => ({ mtimeMs: 0 }));
const mockWriteFileSync = mock(() => {});

mock.module("fs", () => ({
  statSync: mockStatSync,
  writeFileSync: mockWriteFileSync,
  readFileSync: mock(() => ""),
  existsSync: mock(() => true),
  unlinkSync: mock(() => {}),
}));

const { createBlockStaleScorecard } =
  await import("../../plugin/gates/block-stale-scorecard.js");

describe("block-stale-scorecard", () => {
  let state: ReturnType<typeof createMockState>;
  let config: Record<string, any>;
  let log: ReturnType<typeof createMockLogger>;
  let gate: ReturnType<typeof createBlockStaleScorecard>;

  beforeEach(() => {
    state = createMockState({
      currentTurn: 10,
      lastScorecardWriteTime: Date.now() - 20 * 60 * 1000, // 20 min ago
      lastMessageReceivedTime: Date.now() - 10 * 60 * 1000, // 10 min ago
    });
    config = {
      gracePeriodTurns: 5,
      heartbeatIntervalMs: 10 * 60 * 1000,
      activeConversationMs: 5 * 60 * 1000,
    };
    log = createMockLogger();

    // statSync returns stale mtime by default
    mockStatSync.mockImplementation(() => ({
      mtimeMs: Date.now() - 20 * 60 * 1000,
    }));
    mockWriteFileSync.mockImplementation(() => {});

    gate = createBlockStaleScorecard(state, config, log);
  });

  test("blocks when scorecard is stale", async () => {
    const event = createToolCallEvent("exec", { command: "npm run build" });
    const result = await gate(event, createMockContext());

    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("HEARTBEAT GATE");
    expect(result.blockReason).toContain("minutes");
  });

  test("allows when scorecard is fresh", async () => {
    state.lastScorecardWriteTime = Date.now();
    mockStatSync.mockImplementation(() => ({ mtimeMs: Date.now() }));

    gate = createBlockStaleScorecard(state, config, log);
    const event = createToolCallEvent("exec", { command: "npm run build" });
    const result = await gate(event, createMockContext());

    expect(result.block).toBeUndefined();
  });

  test("skips during active conversation", async () => {
    state.lastMessageReceivedTime = Date.now(); // Just received a message

    gate = createBlockStaleScorecard(state, config, log);
    const event = createToolCallEvent("exec", { command: "npm run build" });
    const result = await gate(event, createMockContext());

    expect(result.block).toBeUndefined();
    expect(
      log.entries.some(
        (e) => e.action === "skip" && e.reason?.includes("active conversation"),
      ),
    ).toBe(true);
  });

  test("grace period bypass", async () => {
    state.currentTurn = 3;

    gate = createBlockStaleScorecard(state, config, log);
    const event = createToolCallEvent("exec", { command: "npm run build" });
    const result = await gate(event, createMockContext());

    expect(result.block).toBeUndefined();
  });

  test("heartbeat session bypass", async () => {
    const event = createToolCallEvent("exec", { command: "npm run build" });
    const result = await gate(event, createHeartbeatContext());

    expect(result.block).toBeUndefined();
  });

  test("writes RESUME.md breadcrumb on block", async () => {
    const event = createToolCallEvent("exec", { command: "npm run build" });
    await gate(event, createMockContext());

    expect(mockWriteFileSync).toHaveBeenCalled();
    const writeCall = mockWriteFileSync.mock.calls[0];
    expect(writeCall[1]).toContain("Resume Point");
    expect(writeCall[1]).toContain("heartbeat gate");
  });

  test("does not gate non-exec tools", async () => {
    const event = createToolCallEvent("write", { path: "/tmp/test.md" });
    const result = await gate(event, createMockContext());

    expect(result.block).toBeUndefined();
  });
});

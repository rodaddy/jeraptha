import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockState } from "../_fixtures/create-mock-state";
import { createMockLogger } from "../_fixtures/create-mock-logger.ts";
import {
  createPromptBuildEvent,
  createMockContext,
} from "../_fixtures/create-mock-event";

const mockReadFileSync = mock(() => "");

mock.module("fs", () => ({
  readFileSync: mockReadFileSync,
  existsSync: mock(() => true),
  writeFileSync: mock(() => {}),
  statSync: mock(() => ({ mtimeMs: 0 })),
  unlinkSync: mock(() => {}),
}));

const { createInjectStalledTaskAlert } =
  await import("../../plugin/injections/inject-stalled-task-alert.js");

describe("inject-stalled-task-alert", () => {
  let state: ReturnType<typeof createMockState>;
  let config: Record<string, any>;
  let log: ReturnType<typeof createMockLogger>;
  let injection: ReturnType<typeof createInjectStalledTaskAlert>;

  beforeEach(() => {
    state = createMockState({ promptTurnCount: 0 });
    config = {};
    log = createMockLogger();
    injection = createInjectStalledTaskAlert(state, config, log);
  });

  test("returns empty when no STALLED tasks", async () => {
    mockReadFileSync.mockImplementation(
      () => "# Tasks\n\n### Deploy API\nStatus: IN_PROGRESS\n",
    );

    const event = createPromptBuildEvent();
    const result = await injection(event, createMockContext());

    expect(result.appendSystemContext).toBeUndefined();
  });

  test("extracts STALLED section correctly", async () => {
    mockReadFileSync.mockImplementation(
      () =>
        "# Tasks\n\n### Deploy API\nStatus: STALLED -- waiting on DNS\nBlocked since 2h ago\n\n### Other Task\nStatus: DONE\n",
    );

    const event = createPromptBuildEvent();
    const result = await injection(event, createMockContext());

    expect(result.appendSystemContext).toContain("STALLED TASK ALERT");
    expect(result.appendSystemContext).toContain("STALLED -- waiting on DNS");
    expect(result.appendSystemContext).toContain("Blocked since 2h ago");
  });

  test("does not increment promptTurnCount (moved to reset-per-turn-state)", async () => {
    mockReadFileSync.mockImplementation(() => "# Tasks\n");
    expect(state.promptTurnCount).toBe(0);

    const event = createPromptBuildEvent();
    await injection(event, createMockContext());

    expect(state.promptTurnCount).toBe(0);
  });

  test("returns empty when TASKS.md cannot be read", async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    const event = createPromptBuildEvent();
    const result = await injection(event, createMockContext());

    expect(result.appendSystemContext).toBeUndefined();
  });

  test("handles multiple STALLED sections", async () => {
    mockReadFileSync.mockImplementation(
      () =>
        "### Task A\nStatus: STALLED -- DNS\n\n### Task B\nStatus: STALLED -- creds\n\n### Task C\nDone\n",
    );

    const event = createPromptBuildEvent();
    const result = await injection(event, createMockContext());

    expect(result.appendSystemContext).toContain("STALLED -- DNS");
    expect(result.appendSystemContext).toContain("STALLED -- creds");
  });
});

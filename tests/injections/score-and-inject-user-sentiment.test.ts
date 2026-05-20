import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockState } from "../_fixtures/create-mock-state";
import {
  createPromptBuildEvent,
  createMockContext,
} from "../_fixtures/create-mock-event";

const mockExistsSync = mock(() => false);
const mockReadFileSync = mock(() => "");
const mockWriteFileSync = mock(() => {});

mock.module("fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  statSync: mock(() => ({ mtimeMs: 0 })),
  unlinkSync: mock(() => {}),
}));

const { createScoreAndInjectUserSentiment } =
  await import("../../plugin/injections/score-and-inject-user-sentiment.js");

describe("score-and-inject-user-sentiment", () => {
  let state: ReturnType<typeof createMockState>;
  let config: Record<string, any>;
  let logs: string[];
  let log: (msg: string) => void;
  let injection: ReturnType<typeof createScoreAndInjectUserSentiment>;

  beforeEach(() => {
    state = createMockState();
    config = {};
    logs = [];
    log = (msg: string) => logs.push(msg);
    mockExistsSync.mockImplementation(() => false);
    mockReadFileSync.mockImplementation(() => "");
    mockWriteFileSync.mockImplementation(() => {});
    injection = createScoreAndInjectUserSentiment(state, config, log);
  });

  test("detects positive sentiment (praise, gratitude)", async () => {
    mockExistsSync.mockImplementation(() => true);
    mockReadFileSync.mockImplementation(
      () => "# Scorecard\nCurrent Score: 10\n## Recent Feedback\n",
    );

    const event = createPromptBuildEvent("", [
      { role: "user", content: "awesome, great job nailed it" },
    ]);
    const result = await injection(event, createMockContext());

    // Score is +2 (praise:awesome) +2 (praise:great) +2 (praise:nailed it) = +6, > 2 threshold
    expect(result.appendSystemContext).toBeUndefined(); // positive doesn't inject alert
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  test("detects negative sentiment (anger, criticism)", async () => {
    mockExistsSync.mockImplementation(() => true);
    mockReadFileSync.mockImplementation(
      () => "# Scorecard\nCurrent Score: 10\n## Recent Feedback\n",
    );

    const event = createPromptBuildEvent("", [
      { role: "user", content: "wtf this is broken again" },
    ]);
    const result = await injection(event, createMockContext());

    // wtf = -3 (anger), broken = -2 (criticism), again = -3 (repeated-failure) = -8
    expect(result.appendSystemContext).toContain("BEHAVIORAL ALERT");
    expect(result.appendSystemContext).toContain("negative");
  });

  test("detects positive emoji sentiment", async () => {
    mockExistsSync.mockImplementation(() => true);
    mockReadFileSync.mockImplementation(
      () => "# Scorecard\nCurrent Score: 5\n## Recent Feedback\n",
    );

    const event = createPromptBuildEvent("", [
      { role: "user", content: "nice work! thanks" },
    ]);
    const result = await injection(event, createMockContext());

    // nice = +2, thanks = +1 => +3 total, above threshold
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  test("skips duplicate messages (sentimentLastMsg)", async () => {
    const event = createPromptBuildEvent("", [
      { role: "user", content: "this is terrible and broken" },
    ]);

    mockExistsSync.mockImplementation(() => true);
    mockReadFileSync.mockImplementation(
      () => "# Scorecard\nCurrent Score: 10\n## Recent Feedback\n",
    );

    // First call processes
    await injection(event, createMockContext());
    const callCount = mockWriteFileSync.mock.calls.length;

    // Second call with same message skips
    await injection(event, createMockContext());
    expect(mockWriteFileSync.mock.calls.length).toBe(callCount);
  });

  test("skips system/bot messages", async () => {
    const event = createPromptBuildEvent("", [
      {
        role: "user",
        content: "<system>Follow BOOT.md instructions exactly</system>",
      },
    ]);

    const result = await injection(event, createMockContext());
    expect(result.appendSystemContext).toBeUndefined();
  });

  test("skips JSON blobs", async () => {
    const event = createPromptBuildEvent("", [
      {
        role: "user",
        content:
          '{"type": "tool_result", "content": "something broken and terrible again wtf"}',
      },
    ]);

    const result = await injection(event, createMockContext());
    expect(result.appendSystemContext).toBeUndefined();
  });

  test("skips short messages under threshold", async () => {
    const event = createPromptBuildEvent("", [{ role: "user", content: "ok" }]);

    const result = await injection(event, createMockContext());
    expect(result.appendSystemContext).toBeUndefined();
  });

  test("skips long messages over 500 chars", async () => {
    const longContent = "broken ".repeat(100); // 700 chars
    const event = createPromptBuildEvent("", [
      { role: "user", content: longContent },
    ]);

    const result = await injection(event, createMockContext());
    expect(result.appendSystemContext).toBeUndefined();
  });

  test("injects behavioral alert on strong negative (< -2)", async () => {
    mockExistsSync.mockImplementation(() => true);
    mockReadFileSync.mockImplementation(
      () => "# Scorecard\nCurrent Score: 10\n## Recent Feedback\n",
    );

    const event = createPromptBuildEvent("", [
      { role: "user", content: "wtf are you serious this is broken" },
    ]);
    const result = await injection(event, createMockContext());

    expect(result.appendSystemContext).toContain("BEHAVIORAL ALERT");
    expect(result.appendSystemContext).toContain("Acknowledge the feedback");
  });

  test("does not inject alert on mild negative (-1 to -2)", async () => {
    const event = createPromptBuildEvent("", [
      { role: "user", content: "no stop" },
    ]);
    // "no" = -1, "stop" = -1, total = -2, not < -2
    const result = await injection(event, createMockContext());
    expect(result.appendSystemContext).toBeUndefined();
  });

  test("returns empty when no user message", async () => {
    const event = createPromptBuildEvent("", [
      { role: "assistant", content: "hello" },
    ]);
    const result = await injection(event, createMockContext());
    expect(result.appendSystemContext).toBeUndefined();
  });

  test("skips boot check messages", async () => {
    const event = createPromptBuildEvent("", [
      {
        role: "user",
        content: "Follow these instructions exactly and load BOOT.md",
      },
    ]);
    const result = await injection(event, createMockContext());
    expect(result.appendSystemContext).toBeUndefined();
  });
});

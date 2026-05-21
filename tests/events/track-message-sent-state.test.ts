import { describe, test, expect, beforeEach } from "bun:test";
import { createTrackMessageSentState } from "../../plugin/events/track-message-sent-state.js";
import { createMockState } from "../_fixtures/create-mock-state.ts";
import { createMockLogger } from "../_fixtures/create-mock-logger.ts";
import { createMockContext } from "../_fixtures/create-mock-event.ts";

describe("track-message-sent-state", () => {
  let state: any;
  let handler: any;
  let log: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    state = createMockState({ currentTurn: 12, toolCallsSinceMessage: 15 });
    log = createMockLogger();
    handler = createTrackMessageSentState(state, {}, log);
  });

  test("resets toolCallsSinceMessage only after successful delivery", async () => {
    const result = await handler(
      { content: "status update", success: true },
      createMockContext(),
    );

    expect(result).toEqual({});
    expect(state.toolCallsSinceMessage).toBe(0);
    expect(log.entries.at(-1)).toMatchObject({
      level: "INFO",
      msg: "message delivered",
      turn: 12,
    });
  });

  test("does not reset toolCallsSinceMessage after failed delivery", async () => {
    const result = await handler(
      { content: "status update", success: false, error: "timeout" },
      createMockContext(),
    );

    expect(result).toEqual({});
    expect(state.toolCallsSinceMessage).toBe(15);
    expect(log.entries.at(-1)).toMatchObject({
      level: "WARN",
      msg: "message delivery failed; silent-work counter preserved",
      error: "timeout",
    });
  });
});

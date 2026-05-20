import { describe, it, expect } from "bun:test";
import { createBreakBotToBotLoop } from "../../plugin/events/break-bot-to-bot-loop.js";
import { createMockState } from "../_fixtures/create-mock-state";
import {
  createMessageSendingEvent,
  createMockContext,
} from "../_fixtures/create-mock-event";
import { BOT_BANTER_HOSTILE_MESSAGES } from "../../plugin/shared/constants.js";

const logs: string[] = [];
const log = (msg: string) => logs.push(msg);

function setup(stateOverrides?: Record<string, any>) {
  logs.length = 0;
  const state = createMockState(stateOverrides);
  const config = {};
  const handler = createBreakBotToBotLoop(state, config, log);
  return { state, handler };
}

describe("break-bot-to-bot-loop", () => {
  // -------------------------------------------------------
  // 1. Allows when under limit
  // -------------------------------------------------------
  it("allows messages when banter count is under the limit", async () => {
    const { state, handler } = setup({ inboundIsBot: true });

    state.botBanterState.set("ch1", {
      count: 3,
      windowStart: Date.now(),
      hostileSent: false,
    });

    const event = createMessageSendingEvent("Here is some work output.");
    const result = await handler(
      event,
      createMockContext({ channelId: "ch1" }),
    );

    expect(result.block).toBeUndefined();
    expect(result.cancel).toBeUndefined();
    expect(result.content).toBeUndefined();
  });

  it("allows messages at exactly the limit (not over)", async () => {
    const { state, handler } = setup({ inboundIsBot: true });

    state.botBanterState.set("ch1", {
      count: 5, // exactly at limit, not over
      windowStart: Date.now(),
      hostileSent: false,
    });

    const event = createMessageSendingEvent("Still under.");
    const result = await handler(
      event,
      createMockContext({ channelId: "ch1" }),
    );

    expect(result.cancel).toBeUndefined();
    expect(result.content).toBeUndefined();
  });

  // -------------------------------------------------------
  // 2. Sends hostile message on first over-limit
  // -------------------------------------------------------
  it("sends hostile message on first over-limit exchange", async () => {
    const { state, handler } = setup({ inboundIsBot: true });

    state.botBanterState.set("ch1", {
      count: 6,
      windowStart: Date.now(),
      hostileSent: false,
    });

    const event = createMessageSendingEvent("More banter.");
    const result = await handler(
      event,
      createMockContext({ channelId: "ch1" }),
    );

    expect(result.content).toBeDefined();
    expect(result.content).toContain("6"); // count is interpolated
    expect(result.cancel).toBeUndefined();

    // Verify hostileSent is now set
    const banter = state.botBanterState.get("ch1");
    expect(banter!.hostileSent).toBe(true);
  });

  it("hostile message is from the known hostile messages list", async () => {
    const { state, handler } = setup({ inboundIsBot: true });

    state.botBanterState.set("ch1", {
      count: 7,
      windowStart: Date.now(),
      hostileSent: false,
    });

    const event = createMessageSendingEvent("Banter.");
    const result = await handler(
      event,
      createMockContext({ channelId: "ch1" }),
    );

    // The hostile message should match one of the templates (with {count} replaced)
    const matched = BOT_BANTER_HOSTILE_MESSAGES.some((template) => {
      const expected = template.replace("{count}", "7");
      return result.content === expected;
    });
    expect(matched).toBe(true);
  });

  // -------------------------------------------------------
  // 3. Silently cancels subsequent messages
  // -------------------------------------------------------
  it("silently cancels messages after hostile was already sent", async () => {
    const { state, handler } = setup({ inboundIsBot: true });

    state.botBanterState.set("ch1", {
      count: 8,
      windowStart: Date.now(),
      hostileSent: true, // already sent hostile
    });

    const event = createMessageSendingEvent("More stuff.");
    const result = await handler(
      event,
      createMockContext({ channelId: "ch1" }),
    );

    expect(result.cancel).toBe(true);
    expect(result.content).toBeUndefined();
  });

  // -------------------------------------------------------
  // 4. Human message (inboundIsBot=false) passes through
  // -------------------------------------------------------
  it("passes through when inboundIsBot is false", async () => {
    const { state, handler } = setup({ inboundIsBot: false });

    // Even with high banter count, human messages pass
    state.botBanterState.set("ch1", {
      count: 100,
      windowStart: Date.now(),
      hostileSent: true,
    });

    const event = createMessageSendingEvent("I'm a human response.");
    const result = await handler(
      event,
      createMockContext({ channelId: "ch1" }),
    );

    expect(result.cancel).toBeUndefined();
    expect(result.content).toBeUndefined();
  });

  // -------------------------------------------------------
  // Edge: no banter state for channel
  // -------------------------------------------------------
  it("passes through when no banter state exists for channel", async () => {
    const { handler } = setup({ inboundIsBot: true });

    const event = createMessageSendingEvent("First message ever.");
    const result = await handler(
      event,
      createMockContext({ channelId: "new-channel" }),
    );

    expect(result.cancel).toBeUndefined();
    expect(result.content).toBeUndefined();
  });

  // -------------------------------------------------------
  // Edge: fallback channel key
  // -------------------------------------------------------
  it("uses conversationId as fallback channel key", async () => {
    const { state, handler } = setup({ inboundIsBot: true });

    state.botBanterState.set("conv-456", {
      count: 10,
      windowStart: Date.now(),
      hostileSent: false,
    });

    const event = createMessageSendingEvent("Banter.");
    const result = await handler(
      event,
      createMockContext({
        channelId: undefined,
        conversationId: "conv-456",
      }),
    );

    expect(result.content).toBeDefined();
  });
});

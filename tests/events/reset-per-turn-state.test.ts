import { describe, it, expect } from "bun:test";
import { createResetPerTurnState } from "../../plugin/events/reset-per-turn-state.js";
import { createMockState } from "../_fixtures/create-mock-state";
import { createMockLogger } from "../_fixtures/create-mock-logger.ts";
import {
  createMessageReceivedEvent,
  createMockContext,
} from "../_fixtures/create-mock-event";

function setup(stateOverrides?: Record<string, any>) {
  const log = createMockLogger();
  const state = createMockState(stateOverrides);
  const config = {};
  const handler = createResetPerTurnState(state, config, log);
  return { state, handler, log };
}

describe("reset-per-turn-state", () => {
  // -------------------------------------------------------
  // 1. Resets all per-turn flags
  // -------------------------------------------------------
  it("resets per-turn flags on new message", async () => {
    const { state, handler } = setup({
      obQueriedThisTurn: true,
      sopSearchedThisTurn: true,
      skillConsultedThisTurn: true,
      contradictionCountThisTurn: 3,
      reviewPromisedThisTurn: true,
      reviewAgentSpawned: true,
      prReviewContext: true,
    });

    const event = createMessageReceivedEvent("hello", false);
    await handler(event, createMockContext());

    expect(state.obQueriedThisTurn).toBe(false);
    expect(state.sopSearchedThisTurn).toBe(false);
    expect(state.skillConsultedThisTurn).toBe(false);
    expect(state.contradictionCountThisTurn).toBe(0);
    expect(state.reviewPromisedThisTurn).toBe(false);
    expect(state.reviewAgentSpawned).toBe(true);
    expect(state.prReviewContext).toBe(false);
    expect(state.recentUserMessages).toBe("");
    expect(state.factualQuestionThisTurn).toBe(false);
  });

  // -------------------------------------------------------
  // 2. Increments currentTurn and promptTurnCount
  // -------------------------------------------------------
  it("increments currentTurn on each message", async () => {
    const { state, handler } = setup({ currentTurn: 5 });

    const event = createMessageReceivedEvent("turn 1", false);
    await handler(event, createMockContext());
    expect(state.currentTurn).toBe(6);

    await handler(event, createMockContext());
    expect(state.currentTurn).toBe(7);
  });

  it("increments promptTurnCount on each message", async () => {
    const { state, handler } = setup({ promptTurnCount: 0 });

    const event = createMessageReceivedEvent("turn 1", false);
    await handler(event, createMockContext());
    expect(state.promptTurnCount).toBe(1);

    await handler(event, createMockContext());
    expect(state.promptTurnCount).toBe(2);
  });

  // -------------------------------------------------------
  // 3. Detects bot sender and tracks banter count
  // -------------------------------------------------------
  it("detects bot sender and increments banter count", async () => {
    const { state, handler } = setup();

    const event = createMessageReceivedEvent("beep boop", true);
    const ctx = createMockContext({ channelId: "bot-channel" });

    await handler(event, ctx);

    expect(state.inboundIsBot).toBe(true);
    const banter = state.botBanterState.get("bot-channel");
    expect(banter).toBeDefined();
    expect(banter!.count).toBe(1);
  });

  it("increments banter count on consecutive bot messages", async () => {
    const { state, handler } = setup();

    const event = createMessageReceivedEvent("beep", true);
    const ctx = createMockContext({ channelId: "ch1" });

    await handler(event, ctx);
    await handler(event, ctx);
    await handler(event, ctx);

    const banter = state.botBanterState.get("ch1");
    expect(banter!.count).toBe(3);
  });

  // -------------------------------------------------------
  // 4. Human message clears all banter counters
  // -------------------------------------------------------
  it("clears all banter counters on human message", async () => {
    const { state, handler } = setup();

    // Build up bot banter first
    const botEvent = createMessageReceivedEvent("bot msg", true);
    const ctx = createMockContext({ channelId: "ch1" });
    await handler(botEvent, ctx);
    await handler(botEvent, ctx);
    expect(state.botBanterState.size).toBe(1);

    // Human message resets everything
    const humanEvent = createMessageReceivedEvent("human here", false);
    await handler(humanEvent, ctx);

    expect(state.botBanterState.size).toBe(0);
    expect(state.inboundIsBot).toBe(false);
  });

  // -------------------------------------------------------
  // 5. Window expiry resets banter count
  // -------------------------------------------------------
  it("resets banter count when window expires", async () => {
    const { state, handler } = setup();
    const ctx = createMockContext({ channelId: "ch1" });

    // Seed an old banter entry (expired window)
    state.botBanterState.set("ch1", {
      count: 10,
      windowStart: Date.now() - 31 * 60 * 1000, // 31 min ago, past the 30 min window
      hostileSent: true,
    });

    const event = createMessageReceivedEvent("new bot msg", true);
    await handler(event, ctx);

    const banter = state.botBanterState.get("ch1");
    expect(banter!.count).toBe(1); // Reset to 1 (this message)
    expect(banter!.hostileSent).toBe(false); // Reset
  });

  // -------------------------------------------------------
  // Edge: updates lastMessageReceivedTime
  // -------------------------------------------------------
  it("updates lastMessageReceivedTime", async () => {
    const { state, handler } = setup({ lastMessageReceivedTime: 0 });

    const before = Date.now();
    const event = createMessageReceivedEvent("hello", false);
    await handler(event, createMockContext());

    expect(state.lastMessageReceivedTime).toBeGreaterThanOrEqual(before);
  });

  // -------------------------------------------------------
  // Edge: uses conversationId as fallback channel key
  // -------------------------------------------------------
  it("falls back to conversationId when channelId is missing", async () => {
    const { state, handler } = setup();

    const event = createMessageReceivedEvent("bot msg", true);
    const ctx = createMockContext({
      channelId: undefined,
      conversationId: "conv-123",
    });

    await handler(event, ctx);

    expect(state.botBanterState.has("conv-123")).toBe(true);
  });

  it("falls back to 'global' when both channelId and conversationId are missing", async () => {
    const { state, handler } = setup();

    const event = createMessageReceivedEvent("bot msg", true);
    const ctx = createMockContext({
      channelId: undefined,
      conversationId: undefined,
    });

    await handler(event, ctx);

    expect(state.botBanterState.has("global")).toBe(true);
  });
});

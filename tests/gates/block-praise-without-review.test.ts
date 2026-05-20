import { describe, it, expect } from "bun:test";
import { createBlockPraiseWithoutReview } from "../../plugin/gates/block-praise-without-review.js";
import { createMockState } from "../_fixtures/create-mock-state";
import { createMockLogger } from "../_fixtures/create-mock-logger.ts";
import {
  createToolCallEvent,
  createMockContext,
} from "../_fixtures/create-mock-event";

function setup(stateOverrides?: Record<string, any>) {
  const log = createMockLogger();
  const state = createMockState(stateOverrides);
  const config = {};
  const handler = createBlockPraiseWithoutReview(state, config, log);
  return { state, handler, log };
}

function msgEvent(botText: string) {
  return createToolCallEvent("message", { text: botText });
}

describe("block-praise-without-review", () => {
  // -------------------------------------------------------
  // 1. Praise + commitment = allowed (PR context set by injection)
  // -------------------------------------------------------
  it("allows praise with a review commitment", async () => {
    const { state, handler } = setup({ prReviewContext: true });

    const event = msgEvent(
      "Looks solid, let me dig into the code and check the changes.",
    );

    const result = await handler(event, createMockContext());

    expect(result.block).toBeUndefined();
    expect(state.reviewPromisedThisTurn).toBe(true);
  });

  // -------------------------------------------------------
  // 2. Praise without commitment = blocked
  // -------------------------------------------------------
  it("blocks praise without a review commitment in PR context", async () => {
    const { handler } = setup({ prReviewContext: true });

    const event = msgEvent("Looks great! Ship it!");

    const result = await handler(event, createMockContext());

    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("PRAISE GATE");
    expect(result.blockReason).toContain("sycophancy");
  });

  // -------------------------------------------------------
  // 3. Second message without review agent = hard blocked
  // -------------------------------------------------------
  it("hard blocks when review was promised but no agent spawned", async () => {
    const { handler } = setup({
      prReviewContext: true,
      reviewPromisedThisTurn: true,
      reviewAgentSpawned: false,
    });

    const event = msgEvent(
      "Yeah I think the approach is right, it handles edge cases well.",
    );

    const result = await handler(event, createMockContext());

    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("HARD BLOCK");
    expect(result.blockReason).toContain("haven't spawned a review agent");
  });

  // -------------------------------------------------------
  // 4. Second message after review agent = allowed
  // -------------------------------------------------------
  it("allows messages after review agent has been spawned", async () => {
    const { handler, log } = setup({
      prReviewContext: true,
      reviewPromisedThisTurn: true,
      reviewAgentSpawned: true,
    });

    const event = msgEvent(
      "The review found a couple of issues -- here's what I found.",
    );

    const result = await handler(event, createMockContext());

    expect(result.block).toBeUndefined();
    expect(
      log.entries.some(
        (e) => e.action === "allow" && e.reason === "review agent confirmed",
      ),
    ).toBe(true);
  });

  // -------------------------------------------------------
  // 5. No PR context = skip
  // -------------------------------------------------------
  it("passes everything through when not in PR context", async () => {
    const { handler } = setup();

    const event = msgEvent("Looks great! Ship it!");

    const result = await handler(event, createMockContext());

    expect(result.block).toBeUndefined();
  });

  it("ignores non-message tools even in PR context", async () => {
    const { handler } = setup({ prReviewContext: true });

    const event = createToolCallEvent("exec", { command: "ls" });

    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  // -------------------------------------------------------
  // 6. Clarifying question = allowed
  // -------------------------------------------------------
  it("allows non-praise responses in PR context (clarifying questions)", async () => {
    const { handler } = setup({ prReviewContext: true });

    const event = msgEvent(
      "What was the motivation for changing the retry logic here?",
    );

    const result = await handler(event, createMockContext());

    expect(result.block).toBeUndefined();
  });

  // -------------------------------------------------------
  // Two-step flow: promise then hard block
  // -------------------------------------------------------
  it("exercises actual two-step flow: promise then hard block", async () => {
    const { state, handler } = setup({ prReviewContext: true });

    // Step 1: praise + commitment -- should allow and set reviewPromisedThisTurn
    const first = await handler(
      msgEvent("Looks great, let me check the code and review the changes."),
      createMockContext(),
    );

    expect(first.block).toBeUndefined();
    expect(state.reviewPromisedThisTurn).toBe(true);

    // Step 2: more praise without spawning a review agent -- should hard block
    const second = await handler(
      msgEvent("Yeah this looks solid, nice work on the error handling."),
      createMockContext(),
    );

    expect(second.block).toBe(true);
    expect(second.blockReason).toContain("HARD BLOCK");
    expect(second.blockReason).toContain("haven't spawned a review agent");
  });

  // -------------------------------------------------------
  // reviewAgentSpawned persists across turns
  // -------------------------------------------------------
  it("reviewAgentSpawned persists across turns (session-scoped)", async () => {
    const { handler } = setup({
      prReviewContext: true,
      reviewPromisedThisTurn: true,
      reviewAgentSpawned: true,
    });

    const result = await handler(
      msgEvent("Here are the review findings."),
      createMockContext(),
    );

    expect(result.block).toBeUndefined();
  });

  // -------------------------------------------------------
  // Edge: empty bot message passes
  // -------------------------------------------------------
  it("allows empty bot messages", async () => {
    const { handler } = setup({ prReviewContext: true });

    const event = createToolCallEvent("message", { text: "" });

    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });
});

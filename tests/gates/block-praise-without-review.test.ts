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

function prEvent(botText: string, userText: string) {
  return createToolCallEvent(
    "message",
    { text: botText },
    {
      messages: [{ role: "user", content: userText }],
    },
  );
}

describe("block-praise-without-review", () => {
  // -------------------------------------------------------
  // 1. Praise + commitment = allowed
  // -------------------------------------------------------
  it("allows praise with a review commitment", async () => {
    const { state, handler } = setup();

    const event = prEvent(
      "Looks solid, let me dig into the code and check the changes.",
      "Review this PR: https://github.com/org/repo/pull/42",
    );

    const result = await handler(event, createMockContext());

    expect(result.block).toBeUndefined();
    expect(state.reviewPromisedThisTurn).toBe(true);
    expect(state.prReviewContext).toBe(true);
  });

  // -------------------------------------------------------
  // 2. Praise without commitment = blocked
  // -------------------------------------------------------
  it("blocks praise without a review commitment in PR context", async () => {
    const { handler } = setup();

    const event = prEvent(
      "Looks great! Ship it!",
      "Check this PR please: https://github.com/org/repo/pull/99",
    );

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

    const event = prEvent(
      "Yeah I think the approach is right, it handles edge cases well.",
      "Review this code review please",
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

    const event = prEvent(
      "The review found a couple of issues -- here's what I found.",
      "Review this code review please",
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

    const event = prEvent("Looks great! Ship it!", "How is the weather today?");

    const result = await handler(event, createMockContext());

    expect(result.block).toBeUndefined();
  });

  it("ignores non-message tools even in PR context", async () => {
    const { handler } = setup({ prReviewContext: true });

    const event = createToolCallEvent(
      "exec",
      { command: "ls" },
      {
        messages: [{ role: "user", content: "Review this PR #42" }],
      },
    );

    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  // -------------------------------------------------------
  // 6. Clarifying question = allowed
  // -------------------------------------------------------
  it("allows non-praise responses in PR context (clarifying questions)", async () => {
    const { handler } = setup();

    const event = prEvent(
      "What was the motivation for changing the retry logic here?",
      "Review this PR: https://github.com/org/repo/pull/42",
    );

    const result = await handler(event, createMockContext());

    expect(result.block).toBeUndefined();
  });

  // -------------------------------------------------------
  // Edge: PR context detected from various patterns
  // -------------------------------------------------------
  it("detects PR context from 'code review' mention", async () => {
    const { state, handler } = setup();

    const event = prEvent(
      "What changes are included?",
      "I need a code review on the auth module",
    );

    await handler(event, createMockContext());
    expect(state.prReviewContext).toBe(true);
  });

  it("detects PR context from PR number pattern", async () => {
    const { state, handler } = setup();

    const event = prEvent(
      "What does this change?",
      "Check PR #123 when you get a chance",
    );

    await handler(event, createMockContext());
    expect(state.prReviewContext).toBe(true);
  });

  // -------------------------------------------------------
  // Two-step flow: promise then hard block
  // -------------------------------------------------------
  it("exercises actual two-step flow: promise then hard block", async () => {
    const { state, handler } = setup();

    // Step 1: praise + commitment in PR context -- should allow and set reviewPromisedThisTurn
    const firstEvent = prEvent(
      "Looks great, let me check the code and review the changes.",
      "Review this PR: https://github.com/org/repo/pull/55",
    );

    const first = await handler(firstEvent, createMockContext());
    expect(first.block).toBeUndefined();
    expect(state.reviewPromisedThisTurn).toBe(true);
    expect(state.prReviewContext).toBe(true);

    // Step 2: more praise without spawning a review agent -- should hard block
    const secondEvent = prEvent(
      "Yeah this looks solid, nice work on the error handling.",
      "Review this PR: https://github.com/org/repo/pull/55",
    );

    const second = await handler(secondEvent, createMockContext());
    expect(second.block).toBe(true);
    expect(second.blockReason).toContain("HARD BLOCK");
    expect(second.blockReason).toContain("haven't spawned a review agent");
  });

  // -------------------------------------------------------
  // Edge: empty bot message passes
  // -------------------------------------------------------
  it("allows empty bot messages", async () => {
    const { handler } = setup({ prReviewContext: true });

    const event = createToolCallEvent(
      "message",
      { text: "" },
      {
        messages: [{ role: "user", content: "Review this PR #1" }],
      },
    );

    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });
});

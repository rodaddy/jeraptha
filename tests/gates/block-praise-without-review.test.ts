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
  it("allows praise with a review commitment", async () => {
    const { state, handler } = setup({ prReviewContext: true });

    const result = await handler(
      msgEvent("Looks solid, let me dig into the code and check the changes."),
      createMockContext(),
    );

    expect(result.block).toBeUndefined();
    expect(state.reviewPromisedThisTurn).toBe(true);
  });

  it("blocks praise without commitment and mentions pr-investigator", async () => {
    const { handler } = setup({ prReviewContext: true });

    const result = await handler(
      msgEvent("Looks great! Ship it!"),
      createMockContext(),
    );

    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("PRAISE GATE");
    expect(result.blockReason).toContain("pr-investigator");
    expect(result.blockReason).toContain("subagent");
  });

  it("hard blocks when review promised but no pr-investigator used", async () => {
    const { handler } = setup({
      prReviewContext: true,
      reviewPromisedThisTurn: true,
      prDetectedIds: new Set(["pr #42"]),
      prInvestigatedIds: new Set(),
    });

    const result = await handler(
      msgEvent("Yeah the approach looks right."),
      createMockContext(),
    );

    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("HARD BLOCK");
    expect(result.blockReason).toContain("1 PR(s)");
  });

  it("allows after all PRs investigated", async () => {
    const { handler, log } = setup({
      prReviewContext: true,
      reviewPromisedThisTurn: true,
      prDetectedIds: new Set(["pr #42", "pr #43"]),
      prInvestigatedIds: new Set(["pr #42", "pr #43"]),
    });

    const result = await handler(
      msgEvent("Here are the findings from both PRs."),
      createMockContext(),
    );

    expect(result.block).toBeUndefined();
    expect(
      log.entries.some(
        (e) => e.action === "allow" && e.reason === "all PRs investigated",
      ),
    ).toBe(true);
  });

  it("blocks when only some PRs investigated", async () => {
    const { handler } = setup({
      prReviewContext: true,
      reviewPromisedThisTurn: true,
      prDetectedIds: new Set(["pr #42", "pr #43", "pr #44"]),
      prInvestigatedIds: new Set(["pr #42"]),
    });

    const result = await handler(
      msgEvent("Everything looks great!"),
      createMockContext(),
    );

    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("2 PR(s)");
  });

  it("falls back to reviewAgentSpawned when no PR IDs tracked", async () => {
    const { handler, log } = setup({
      prReviewContext: true,
      reviewPromisedThisTurn: true,
      prDetectedIds: new Set(["pr #42"]),
      prInvestigatedIds: new Set(),
      reviewAgentSpawned: true,
    });

    const result = await handler(
      msgEvent("Here are the review findings."),
      createMockContext(),
    );

    expect(result.block).toBeUndefined();
    expect(
      log.entries.some(
        (e) =>
          e.action === "allow" &&
          e.reason === "review agent spawned (pr-investigator preferred)",
      ),
    ).toBe(true);
  });

  it("passes through when not in PR context", async () => {
    const { handler } = setup();

    const result = await handler(
      msgEvent("Looks great! Ship it!"),
      createMockContext(),
    );

    expect(result.block).toBeUndefined();
  });

  it("ignores non-message tools in PR context", async () => {
    const { handler } = setup({ prReviewContext: true });

    const result = await handler(
      createToolCallEvent("exec", { command: "ls" }),
      createMockContext(),
    );

    expect(result.block).toBeUndefined();
  });

  it("allows non-praise responses in PR context", async () => {
    const { handler } = setup({ prReviewContext: true });

    const result = await handler(
      msgEvent("What was the motivation for changing the retry logic?"),
      createMockContext(),
    );

    expect(result.block).toBeUndefined();
  });

  it("allows empty bot messages", async () => {
    const { handler } = setup({ prReviewContext: true });

    const result = await handler(
      createToolCallEvent("message", { text: "" }),
      createMockContext(),
    );

    expect(result.block).toBeUndefined();
  });
});

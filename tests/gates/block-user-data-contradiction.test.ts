import { describe, it, expect } from "bun:test";
import { createBlockUserDataContradiction } from "../../plugin/gates/block-user-data-contradiction.js";
import { createMockState } from "../_fixtures/create-mock-state";
import { createMockLogger } from "../_fixtures/create-mock-logger.ts";
import {
  createToolCallEvent,
  createMockContext,
} from "../_fixtures/create-mock-event";

function makeFetch(result: { contradicts: boolean; detail: string }) {
  return async (_url: string, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(result) } }],
    }),
  });
}

function makeFailingFetch(errorMsg = "network down") {
  return async () => {
    throw new Error(errorMsg);
  };
}

function makeNonOkFetch(status = 500) {
  return async () => ({
    ok: false,
    status,
    json: async () => ({}),
  });
}

describe("block-user-data-contradiction", () => {
  function setup(fetchFn: any, stateOverrides?: Record<string, any>) {
    const log = createMockLogger();
    const state = createMockState(stateOverrides);
    const config = { _fetch: fetchFn };
    const handler = createBlockUserDataContradiction(state, config, log);
    return { state, handler, log };
  }

  function msgEvent(botText: string) {
    return createToolCallEvent("message", { text: botText });
  }

  // -------------------------------------------------------
  // 1. Mushroom incident replay
  // -------------------------------------------------------
  it("blocks when bot contradicts user-provided data (mushroom incident)", async () => {
    const { handler } = setup(
      makeFetch({
        contradicts: true,
        detail: "User says May 16 is Friday, bot says Saturday",
      }),
      {
        recentUserMessages:
          "May 16 | Fri | STILL MISSING -- the file has no row for this date",
      },
    );

    const event = msgEvent(
      "May 16th is a Saturday -- no trading data exists for that day.",
    );

    const result = await handler(event, createMockContext());

    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("CONTRADICTION CHECK");
    expect(result.blockReason).toContain(
      "User says May 16 is Friday, bot says Saturday",
    );
  });

  // -------------------------------------------------------
  // 2. Clean message passes
  // -------------------------------------------------------
  it("allows messages with no contradiction", async () => {
    const { handler } = setup(makeFetch({ contradicts: false, detail: "" }), {
      recentUserMessages: "Can you show me the data for May 16?",
    });

    const event = msgEvent("Here is the data you requested for May 16.");

    const result = await handler(event, createMockContext());

    expect(result.block).toBeUndefined();
    expect(result.blockReason).toBeUndefined();
  });

  // -------------------------------------------------------
  // 3. Escalation: soft then hard block
  // -------------------------------------------------------
  it("escalates from soft block to hard block on second contradiction", async () => {
    const { state, handler } = setup(
      makeFetch({ contradicts: true, detail: "date mismatch" }),
      {
        recentUserMessages: "The schedule shows May 16 as Friday.",
      },
    );

    const event = msgEvent("That date is definitely a Saturday, not Friday.");

    const first = await handler(event, createMockContext());
    expect(first.block).toBe(true);
    expect(first.blockReason).toContain("CONTRADICTION CHECK:");
    expect(first.blockReason).not.toContain("HARD BLOCK");
    expect(state.contradictionCountThisTurn).toBe(1);

    const second = await handler(event, createMockContext());
    expect(second.block).toBe(true);
    expect(second.blockReason).toContain("HARD BLOCK");
    expect(state.contradictionCountThisTurn).toBe(2);
  });

  // -------------------------------------------------------
  // 4. LiteLLM failure = fail-open
  // -------------------------------------------------------
  it("fails open when fetch throws an error", async () => {
    const { handler, log } = setup(makeFailingFetch("ECONNREFUSED"), {
      recentUserMessages: "The report shows 42 items were processed on Monday.",
    });

    const event = msgEvent(
      "Here is some potentially contradictory information about the data.",
    );

    const result = await handler(event, createMockContext());

    expect(result.block).toBeUndefined();
    expect(
      log.entries.some(
        (e) => e.level === "WARN" && e.msg?.includes("fail-open"),
      ),
    ).toBe(true);
  });

  it("fails open when LiteLLM returns non-OK status", async () => {
    const { handler, log } = setup(makeNonOkFetch(503), {
      recentUserMessages: "The quarterly numbers show a 15% increase.",
    });

    const event = msgEvent("Here is some analysis of the data you shared.");

    const result = await handler(event, createMockContext());

    expect(result.block).toBeUndefined();
    expect(
      log.entries.some((e) => e.level === "WARN" && e.status === 503),
    ).toBe(true);
  });

  // -------------------------------------------------------
  // 5. Short messages skip
  // -------------------------------------------------------
  it("skips short bot messages (under 10 chars)", async () => {
    const { handler } = setup(makeFetch({ contradicts: true, detail: "x" }), {
      recentUserMessages: "This is a normal user message with enough content.",
    });

    const event = msgEvent("OK");

    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  it("skips when no user messages in state", async () => {
    const { handler } = setup(makeFetch({ contradicts: true, detail: "x" }), {
      recentUserMessages: "",
    });

    const event = msgEvent(
      "Here is an analysis of the data with some detailed content.",
    );

    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  it("skips short user messages in state (under 10 chars)", async () => {
    const { handler } = setup(makeFetch({ contradicts: true, detail: "x" }), {
      recentUserMessages: "hi",
    });

    const event = msgEvent(
      "Here is an analysis of the data with some detailed content.",
    );

    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  // -------------------------------------------------------
  // Edge: non-message tool calls pass through
  // -------------------------------------------------------
  it("ignores non-message tool calls", async () => {
    const { handler } = setup(makeFetch({ contradicts: true, detail: "x" }));

    const event = createToolCallEvent("exec", { command: "ls" });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  // -------------------------------------------------------
  // Edge: malformed JSON from LiteLLM
  // -------------------------------------------------------
  it("handles malformed JSON from LiteLLM gracefully (no contradiction)", async () => {
    const malformedFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                'Sure, here is the result: {"contradicts": false, "detail": ""}',
            },
          },
        ],
      }),
    });

    const { handler } = setup(malformedFetch, {
      recentUserMessages: "The report clearly shows 100 items.",
    });

    const event = msgEvent("Here is a detailed response about the data.");

    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  it("extracts contradiction from malformed JSON with text preamble", async () => {
    const malformedFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                'Here is my analysis: {"contradicts": true, "detail": "dates mismatch"}',
            },
          },
        ],
      }),
    });

    const { handler } = setup(malformedFetch, {
      recentUserMessages: "Our meeting was on Wednesday, March 12th.",
    });

    const event = msgEvent("The meeting was on Thursday, March 12th.");

    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("dates mismatch");
  });

  // -------------------------------------------------------
  // Circuit breaker
  // -------------------------------------------------------
  it("trips circuit breaker after 10 consecutive failures", async () => {
    const { state, handler, log } = setup(makeFailingFetch("timeout"), {
      contradictionGateFailures: 10,
      recentUserMessages: "Important user data here.",
    });

    const event = msgEvent("Some bot response.");

    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
    expect(state.contradictionCircuitBreakerUntil).toBeGreaterThan(Date.now());
    expect(
      log.entries.some(
        (e) => e.level === "WARN" && e.msg?.includes("circuit breaker"),
      ),
    ).toBe(true);
  });

  it("skips while circuit breaker is active", async () => {
    const { handler, log } = setup(
      makeFetch({ contradicts: true, detail: "should not fire" }),
      {
        contradictionGateFailures: 10,
        contradictionCircuitBreakerUntil: Date.now() + 300000,
        recentUserMessages: "Important user data.",
      },
    );

    const event = msgEvent("Some bot response.");

    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
    expect(
      log.entries.some(
        (e) => e.action === "skip" && e.reason === "circuit breaker active",
      ),
    ).toBe(true);
  });

  it("resets circuit breaker after cooldown expires", async () => {
    const { state, handler } = setup(
      makeFetch({ contradicts: true, detail: "now it fires" }),
      {
        contradictionGateFailures: 10,
        contradictionCircuitBreakerUntil: Date.now() - 1000,
        recentUserMessages: "User provided specific data.",
      },
    );

    const event = msgEvent("Bot response that contradicts.");

    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(state.contradictionGateFailures).toBe(0);
    expect(state.contradictionCircuitBreakerUntil).toBeNull();
  });
});

import { describe, it, expect } from "bun:test";
import { createBlockUserDataContradiction } from "../../plugin/gates/block-user-data-contradiction.js";
import { createMockState } from "../_fixtures/create-mock-state";
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

const logs: string[] = [];
const log = (msg: string) => logs.push(msg);

describe("block-user-data-contradiction", () => {
  function setup(fetchFn: any, stateOverrides?: Record<string, any>) {
    logs.length = 0;
    const state = createMockState(stateOverrides);
    const config = { _fetch: fetchFn };
    const handler = createBlockUserDataContradiction(state, config, log);
    return { state, handler };
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
    );

    const event = createToolCallEvent(
      "message",
      {
        text: "May 16th is a Saturday -- no trading data exists for that day.",
      },
      {
        messages: [
          {
            role: "user",
            content:
              "May 16 | Fri | STILL MISSING -- the file has no row for this date",
          },
        ],
      },
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
    const { handler } = setup(makeFetch({ contradicts: false, detail: "" }));

    const event = createToolCallEvent(
      "message",
      {
        text: "Here is the data you requested for May 16.",
      },
      {
        messages: [
          { role: "user", content: "Can you show me the data for May 16?" },
        ],
      },
    );

    const result = await handler(event, createMockContext());

    expect(result.block).toBeUndefined();
    expect(result.blockReason).toBeUndefined();
  });

  // -------------------------------------------------------
  // 3. Escalation: soft then hard block
  // -------------------------------------------------------
  it("escalates from soft block to hard block on second contradiction", async () => {
    const { state, handler } = setup(
      makeFetch({
        contradicts: true,
        detail: "date mismatch",
      }),
    );

    const event = createToolCallEvent(
      "message",
      {
        text: "That date is definitely a Saturday, not Friday.",
      },
      {
        messages: [
          { role: "user", content: "The schedule shows May 16 as Friday." },
        ],
      },
    );

    // First contradiction -- soft block
    const first = await handler(event, createMockContext());
    expect(first.block).toBe(true);
    expect(first.blockReason).toContain("CONTRADICTION CHECK:");
    expect(first.blockReason).not.toContain("HARD BLOCK");
    expect(state.contradictionCountThisTurn).toBe(1);

    // Second contradiction -- hard block
    const second = await handler(event, createMockContext());
    expect(second.block).toBe(true);
    expect(second.blockReason).toContain("HARD BLOCK");
    expect(state.contradictionCountThisTurn).toBe(2);
  });

  // -------------------------------------------------------
  // 4. LiteLLM failure = fail-open
  // -------------------------------------------------------
  it("fails open when fetch throws an error", async () => {
    const { handler } = setup(makeFailingFetch("ECONNREFUSED"));

    const event = createToolCallEvent(
      "message",
      {
        text: "Here is some potentially contradictory information about the data.",
      },
      {
        messages: [
          {
            role: "user",
            content: "The report shows 42 items were processed on Monday.",
          },
        ],
      },
    );

    const result = await handler(event, createMockContext());

    expect(result.block).toBeUndefined();
    expect(logs.some((l) => l.includes("fail-open"))).toBe(true);
  });

  it("fails open when LiteLLM returns non-OK status", async () => {
    const { handler } = setup(makeNonOkFetch(503));

    const event = createToolCallEvent(
      "message",
      {
        text: "Here is some analysis of the data you shared.",
      },
      {
        messages: [
          {
            role: "user",
            content: "The quarterly numbers show a 15% increase.",
          },
        ],
      },
    );

    const result = await handler(event, createMockContext());

    expect(result.block).toBeUndefined();
    expect(logs.some((l) => l.includes("503"))).toBe(true);
  });

  // -------------------------------------------------------
  // 5. Short messages skip
  // -------------------------------------------------------
  it("skips short bot messages (under 10 chars)", async () => {
    const { handler } = setup(makeFetch({ contradicts: true, detail: "x" }));

    const event = createToolCallEvent(
      "message",
      {
        text: "OK",
      },
      {
        messages: [
          {
            role: "user",
            content: "This is a normal user message with enough content.",
          },
        ],
      },
    );

    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  it("skips short user messages (under 10 chars)", async () => {
    const { handler } = setup(makeFetch({ contradicts: true, detail: "x" }));

    const event = createToolCallEvent(
      "message",
      {
        text: "Here is an analysis of the data with some detailed content.",
      },
      {
        messages: [{ role: "user", content: "hi" }],
      },
    );

    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  // -------------------------------------------------------
  // 6. No user message = skip
  // -------------------------------------------------------
  it("skips when there are no user messages in history", async () => {
    const { handler } = setup(makeFetch({ contradicts: true, detail: "x" }));

    const event = createToolCallEvent(
      "message",
      {
        text: "Here is a long enough bot message to process.",
      },
      {
        messages: [{ role: "system", content: "You are a helpful assistant." }],
      },
    );

    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  it("skips when messages array is empty", async () => {
    const { handler } = setup(makeFetch({ contradicts: true, detail: "x" }));

    const event = createToolCallEvent(
      "message",
      {
        text: "Here is a long enough bot message to process.",
      },
      { messages: [] },
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

    const { handler } = setup(malformedFetch);

    const event = createToolCallEvent(
      "message",
      {
        text: "Here is a detailed response about the data.",
      },
      {
        messages: [
          { role: "user", content: "The report clearly shows 100 items." },
        ],
      },
    );

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

    const { handler } = setup(malformedFetch);

    const event = createToolCallEvent(
      "message",
      {
        text: "The meeting was on Thursday, March 12th.",
      },
      {
        messages: [
          {
            role: "user",
            content: "Our meeting was on Wednesday, March 12th.",
          },
        ],
      },
    );

    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("dates mismatch");
  });
});

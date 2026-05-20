import { describe, test, expect, beforeEach } from "bun:test";
import { createScanMessageContext } from "../../plugin/injections/scan-message-context.js";
import { createMockState } from "../_fixtures/create-mock-state.ts";
import { createMockLogger } from "../_fixtures/create-mock-logger.ts";
import {
  createPromptBuildEvent,
  createMockContext,
} from "../_fixtures/create-mock-event.ts";

describe("scan-message-context", () => {
  let state: any, handler: any, log: any;

  beforeEach(() => {
    state = createMockState();
    log = createMockLogger();
    handler = createScanMessageContext(state, {}, log);
  });

  test("stores recent user messages in state", async () => {
    const event = createPromptBuildEvent("hello", [
      { role: "user", content: "What is the IP of the server?" },
      { role: "assistant", content: "Let me check." },
      { role: "user", content: "Also check the port." },
    ]);

    await handler(event, createMockContext());

    expect(state.recentUserMessages).toContain("Also check the port.");
    expect(state.recentUserMessages).toContain("What is the IP of the server?");
  });

  test("detects PR context from GitHub URL", async () => {
    const event = createPromptBuildEvent("", [
      {
        role: "user",
        content: "Review this: https://github.com/org/repo/pull/42",
      },
    ]);

    await handler(event, createMockContext());

    expect(state.prReviewContext).toBe(true);
  });

  test("detects PR context from PR number pattern", async () => {
    const event = createPromptBuildEvent("", [
      { role: "user", content: "Check PR #123 when you get a chance" },
    ]);

    await handler(event, createMockContext());

    expect(state.prReviewContext).toBe(true);
  });

  test("detects PR context from 'code review' mention", async () => {
    const event = createPromptBuildEvent("", [
      { role: "user", content: "I need a code review on the auth module" },
    ]);

    await handler(event, createMockContext());

    expect(state.prReviewContext).toBe(true);
  });

  test("detects factual question from user message", async () => {
    const event = createPromptBuildEvent("", [
      { role: "user", content: "What is the IP of the database server?" },
    ]);

    await handler(event, createMockContext());

    expect(state.factualQuestionThisTurn).toBe(true);
  });

  test("does not set factualQuestionThisTurn for non-factual messages", async () => {
    const event = createPromptBuildEvent("", [
      { role: "user", content: "Let's refactor the auth module" },
    ]);

    await handler(event, createMockContext());

    expect(state.factualQuestionThisTurn).toBe(false);
  });

  test("does not set prReviewContext for non-PR messages", async () => {
    const event = createPromptBuildEvent("", [
      { role: "user", content: "How is the weather today?" },
    ]);

    await handler(event, createMockContext());

    expect(state.prReviewContext).toBe(false);
  });

  test("handles empty messages array", async () => {
    const event = createPromptBuildEvent("", []);

    await handler(event, createMockContext());

    expect(state.recentUserMessages).toBe("");
    expect(state.prReviewContext).toBe(false);
    expect(state.factualQuestionThisTurn).toBe(false);
  });

  test("handles no user messages (only system/assistant)", async () => {
    const event = createPromptBuildEvent("", [
      { role: "system", content: "You are a helpful assistant." },
      { role: "assistant", content: "How can I help?" },
    ]);

    await handler(event, createMockContext());

    expect(state.recentUserMessages).toBe("");
  });

  test("uses most recent user message for context detection", async () => {
    const event = createPromptBuildEvent("", [
      {
        role: "user",
        content: "Review this PR: https://github.com/org/repo/pull/1",
      },
      { role: "assistant", content: "Looking at it now." },
      {
        role: "user",
        content: "Actually never mind, let's work on something else",
      },
    ]);

    await handler(event, createMockContext());

    expect(state.prReviewContext).toBe(false);
  });

  test("limits to last 5 user messages", async () => {
    const messages = [];
    for (let i = 0; i < 10; i++) {
      messages.push({ role: "user" as const, content: `User message ${i}` });
      messages.push({ role: "assistant" as const, content: `Reply ${i}` });
    }
    const event = createPromptBuildEvent("", messages);

    await handler(event, createMockContext());

    expect(state.recentUserMessages).toContain("User message 9");
    expect(state.recentUserMessages).toContain("User message 5");
    expect(state.recentUserMessages).not.toContain("User message 4");
  });

  test("returns empty object (no context injection)", async () => {
    const event = createPromptBuildEvent("", [
      { role: "user", content: "Hello world" },
    ]);

    const result = await handler(event, createMockContext());

    expect(result).toEqual({});
  });
});

import { describe, test, expect, beforeEach } from "bun:test";
import { createObserveToolCallState } from "../../plugin/gates/observe-tool-call-state.js";
import { createMockState } from "../_fixtures/create-mock-state.ts";
import { createMockLogger } from "../_fixtures/create-mock-logger.ts";
import {
  createToolCallEvent,
  createMockContext,
} from "../_fixtures/create-mock-event.ts";

describe("observe-tool-call-state", () => {
  let state: any;
  let handler: any;
  let log: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    state = createMockState();
    log = createMockLogger();
    handler = createObserveToolCallState(state, {}, log);
  });

  test("never blocks -- always returns empty object", async () => {
    const event = createToolCallEvent("exec", { command: "ls -la" });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
    expect(result.block).toBeUndefined();
  });

  test("tracks TASKS.md write and updates turn + session flag", async () => {
    state.currentTurn = 7;
    const event = createToolCallEvent("write", { path: "/workspace/TASKS.md" });
    await handler(event, createMockContext());
    expect(state.lastTasksWriteTurn).toBe(7);
    expect(state.tasksReadThisSession).toBe(true);
  });

  test("tracks SCORECARD.md write and updates timestamp", async () => {
    const before = Date.now();
    const event = createToolCallEvent("edit", {
      path: "/workspace/SCORECARD.md",
    });
    await handler(event, createMockContext());
    expect(state.lastScorecardWriteTime).toBeGreaterThanOrEqual(before);
  });

  test("tracks CONVERSATIONS.md write via apply_patch", async () => {
    state.currentTurn = 3;
    const event = createToolCallEvent("apply_patch", {
      path: "/home/agent/.openclaw/workspace/CONVERSATIONS.md",
    });
    await handler(event, createMockContext());
    expect(state.lastConversationsWriteTurn).toBe(3);
    expect(state.conversationsReadThisSession).toBe(true);
  });

  test("resets toolCallsSinceMessage on message send", async () => {
    state.toolCallsSinceMessage = 15;
    const event = createToolCallEvent("message", { text: "status update" });
    await handler(event, createMockContext());
    expect(state.toolCallsSinceMessage).toBe(0);
  });

  test("increments toolCallsSinceMessage for non-compliance exec", async () => {
    state.toolCallsSinceMessage = 3;
    const event = createToolCallEvent("exec", { command: "git status" });
    await handler(event, createMockContext());
    expect(state.toolCallsSinceMessage).toBe(4);
  });

  test("does NOT increment toolCallsSinceMessage for compliance exec (mcp2cli)", async () => {
    state.toolCallsSinceMessage = 3;
    const event = createToolCallEvent("bash", {
      command: "mcp2cli open-brain search_all",
    });
    await handler(event, createMockContext());
    expect(state.toolCallsSinceMessage).toBe(3);
  });

  test("tracks skill consultation via read tool", async () => {
    expect(state.skillConsultedThisTurn).toBe(false);
    const event = createToolCallEvent("read", {
      path: "/workspace/SKILL-INDEX.md",
    });
    await handler(event, createMockContext());
    expect(state.skillConsultedThisTurn).toBe(true);
  });

  test("tracks skill consultation via cat command", async () => {
    expect(state.skillConsultedThisTurn).toBe(false);
    const event = createToolCallEvent("exec", {
      command: "cat /workspace/SKILL.md",
    });
    await handler(event, createMockContext());
    expect(state.skillConsultedThisTurn).toBe(true);
  });

  test("tracks skill consultation via nl command", async () => {
    expect(state.skillConsultedThisTurn).toBe(false);
    const event = createToolCallEvent("exec", {
      command: "nl -ba /workspace/SKILL-INDEX.md",
    });
    await handler(event, createMockContext());
    expect(state.skillConsultedThisTurn).toBe(true);
  });

  test("tracks OB context load via session_load command", async () => {
    expect(state.obContextLoadedThisSession).toBe(false);
    const event = createToolCallEvent("exec", {
      command:
        'mcp2cli open-brain session_load --params \'{"project":"main"}\'',
    });
    await handler(event, createMockContext());
    expect(state.obContextLoadedThisSession).toBe(true);
  });

  test("tracks TASKS.md read via read tool", async () => {
    expect(state.tasksReadThisSession).toBe(false);
    const event = createToolCallEvent("read", { path: "/workspace/TASKS.md" });
    await handler(event, createMockContext());
    expect(state.tasksReadThisSession).toBe(true);
  });

  test("tracks TASKS.md read via cat command", async () => {
    expect(state.tasksReadThisSession).toBe(false);
    state.lastTasksWriteTurn = 2;
    const event = createToolCallEvent("exec", {
      command: "cat ~/.openclaw/workspace/TASKS.md",
    });
    await handler(event, createMockContext());
    expect(state.tasksReadThisSession).toBe(true);
    expect(state.lastTasksWriteTurn).toBe(2);
  });

  test("tracks CONVERSATIONS.md read via nl command", async () => {
    expect(state.conversationsReadThisSession).toBe(false);
    state.lastConversationsWriteTurn = 3;
    const event = createToolCallEvent("exec", {
      command: "nl -ba ~/.openclaw/workspace/CONVERSATIONS.md",
    });
    await handler(event, createMockContext());
    expect(state.conversationsReadThisSession).toBe(true);
    expect(state.lastConversationsWriteTurn).toBe(3);
  });

  test("does not track mixed skill read and ops command as skill consult", async () => {
    expect(state.skillConsultedThisTurn).toBe(false);
    const event = createToolCallEvent("exec", {
      command:
        "cat ~/.openclaw/workspace/SKILL-INDEX.md && docker compose up -d",
    });
    await handler(event, createMockContext());
    expect(state.skillConsultedThisTurn).toBe(false);
  });

  test("does not mark TASKS.md shell write before execution succeeds", async () => {
    state.currentTurn = 11;
    state.lastTasksWriteTurn = 4;
    const event = createToolCallEvent("exec", {
      command: "printf '%s\\n' 'status' > ~/.openclaw/workspace/TASKS.md",
    });
    await handler(event, createMockContext());
    expect(state.lastTasksWriteTurn).toBe(4);
    expect(state.tasksReadThisSession).toBe(false);
  });

  test("does not track read redirected away as TASKS.md write", async () => {
    state.currentTurn = 11;
    state.lastTasksWriteTurn = 4;
    const event = createToolCallEvent("exec", {
      command: "cat ~/.openclaw/workspace/TASKS.md > /dev/null",
    });
    await handler(event, createMockContext());
    expect(state.lastTasksWriteTurn).toBe(4);
  });

  test("does not track non-workspace TASKS.md mention as context write", async () => {
    state.currentTurn = 11;
    state.lastTasksWriteTurn = 4;
    const event = createToolCallEvent("exec", {
      command: "echo x > /tmp/out # TASKS.md",
    });
    await handler(event, createMockContext());
    expect(state.lastTasksWriteTurn).toBe(4);
    expect(state.tasksReadThisSession).toBe(false);
  });

  test("does not mark CONVERSATIONS.md shell write before execution succeeds", async () => {
    state.currentTurn = 12;
    state.lastConversationsWriteTurn = 5;
    const event = createToolCallEvent("bash", {
      command: "tee ~/.openclaw/workspace/CONVERSATIONS.md",
    });
    await handler(event, createMockContext());
    expect(state.lastConversationsWriteTurn).toBe(5);
    expect(state.conversationsReadThisSession).toBe(false);
  });

  test("does not mark CONVERSATIONS.md shell append before execution succeeds", async () => {
    state.currentTurn = 13;
    state.lastConversationsWriteTurn = 5;
    const event = createToolCallEvent("bash", {
      command: "tee -a ~/.openclaw/workspace/CONVERSATIONS.md",
    });
    await handler(event, createMockContext());
    expect(state.lastConversationsWriteTurn).toBe(5);
    expect(state.conversationsReadThisSession).toBe(false);
  });

  test("tracks review agent spawn when PR context is active", async () => {
    state.prReviewContext = true;
    const event = createToolCallEvent("sessions_spawn", {});
    await handler(event, createMockContext());
    expect(state.reviewAgentSpawned).toBe(true);
  });

  test("does NOT track review agent spawn without PR context", async () => {
    state.prReviewContext = false;
    const event = createToolCallEvent("sessions_spawn", {});
    await handler(event, createMockContext());
    expect(state.reviewAgentSpawned).toBe(false);
  });
});

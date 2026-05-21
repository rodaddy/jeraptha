import { describe, test, expect, beforeEach } from "bun:test";
import { createBlockWithoutSopSearch } from "../../plugin/gates/block-without-sop-search.js";
import { createMockState } from "../_fixtures/create-mock-state.ts";
import { createMockLogger } from "../_fixtures/create-mock-logger.ts";
import {
  createToolCallEvent,
  createMockContext,
  createHeartbeatContext,
} from "../_fixtures/create-mock-event.ts";

describe("block-without-sop-search", () => {
  let state: any, handler: any;
  let log: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    state = createMockState();
    log = createMockLogger();
    handler = createBlockWithoutSopSearch(state, {}, log);
  });

  test("blocks agent spawn without SOP search", async () => {
    const event = createToolCallEvent("sessions_spawn", {
      task: "review code",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("SOP GATE");
    expect(result.blockReason).toContain("Spawning agent");
  });

  test("blocks deploy command without SOP search", async () => {
    const event = createToolCallEvent("exec", {
      command: "deploy-service my-app",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("deployment");
  });

  test("allows context file recovery command even when text mentions deploy", async () => {
    const event = createToolCallEvent("exec", {
      command:
        "printf '%s\\n' 'checking deploy gate loop' > ~/.openclaw/workspace/CONVERSATIONS.md",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("allows heredoc context recovery write even when body mentions deployment", async () => {
    const event = createToolCallEvent("exec", {
      command:
        "cat > ~/.openclaw/workspace/CONVERSATIONS.md <<'EOF'\nDeployment notes from current turn.\nEOF",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("blocks process command that only mentions TASKS.md", async () => {
    const event = createToolCallEvent("exec", {
      command: "git push origin main # TASKS.md",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("git workflow");
  });

  test("blocks mixed process and context update command", async () => {
    const event = createToolCallEvent("exec", {
      command:
        "deploy-service app && printf '%s\\n' done > ~/.openclaw/workspace/CONVERSATIONS.md",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("deployment");
  });

  test("blocks command substitution in apparent context update", async () => {
    const event = createToolCallEvent("exec", {
      command:
        'printf "$(deploy-service app)" > ~/.openclaw/workspace/CONVERSATIONS.md',
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("deployment");
  });

  test("blocks git push without SOP search", async () => {
    const event = createToolCallEvent("exec", {
      command: "git push origin main",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("git workflow");
  });

  test("blocks PR creation without SOP search", async () => {
    const event = createToolCallEvent("bash", {
      command: "gh pr create --title 'feat'",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("PR creation");
  });

  test("allows after SOP search via mcp2cli", async () => {
    // Simulate SOP search
    const sopEvent = createToolCallEvent("exec", {
      command:
        'mcp2cli open-brain search_brain --params \'{"query":"SOP deploy"}\'',
    });
    await handler(sopEvent, createMockContext());
    expect(state.sopSearchedThisTurn).toBe(true);

    // Now deploy should pass
    const event = createToolCallEvent("exec", {
      command: "deploy-service my-app",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("allows after SOP search via memory_search", async () => {
    const sopEvent = createToolCallEvent("memory_search", {
      query: "SOP for deployment",
    });
    await handler(sopEvent, createMockContext());
    expect(state.sopSearchedThisTurn).toBe(true);

    const event = createToolCallEvent("exec", {
      command: "deploy-service my-app",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("allows compliance exec without SOP search", async () => {
    const event = createToolCallEvent("exec", {
      command: "mcp2cli some-service some-tool",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("allows non-process commands without SOP search", async () => {
    const event = createToolCallEvent("exec", { command: "ls -la src/" });
    const result = await handler(event, createMockContext());
    expect(result.block).toBeUndefined();
  });

  test("bypasses all checks for heartbeat sessions", async () => {
    const event = createToolCallEvent("sessions_spawn", {
      task: "review code",
    });
    const result = await handler(event, createHeartbeatContext());
    expect(result.block).toBeUndefined();
  });
});

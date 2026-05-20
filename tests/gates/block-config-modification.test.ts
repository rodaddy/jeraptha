import { describe, test, expect, beforeEach } from "bun:test";
import { createBlockConfigModification } from "../../plugin/gates/block-config-modification.js";
import { createMockState } from "../_fixtures/create-mock-state.ts";
import {
  createToolCallEvent,
  createMockContext,
} from "../_fixtures/create-mock-event.ts";

describe("block-config-modification", () => {
  let state: any;
  let handler: any;
  const log = () => {};

  beforeEach(() => {
    state = createMockState();
    handler = createBlockConfigModification(state, {}, log);
  });

  // --- Hard blocks: openclaw.json ---

  test("blocks write to openclaw.json via sed command", async () => {
    const event = createToolCallEvent("exec", {
      command: "sed -i 's/old/new/' ~/.openclaw/openclaw.json",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("CARAPACE LOCK");
  });

  test("blocks edit tool targeting openclaw.json", async () => {
    const event = createToolCallEvent("edit", {
      path: "/home/agent/.openclaw/openclaw.json",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("CARAPACE LOCK");
  });

  test("blocks write tool targeting openclaw.json", async () => {
    const event = createToolCallEvent("write", {
      path: "/home/agent/.openclaw/openclaw.json",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("CARAPACE LOCK");
  });

  test("blocks apply_patch targeting openclaw.json", async () => {
    const event = createToolCallEvent("apply_patch", {
      path: "/config/openclaw.json",
    });
    const result = await handler(event, createMockContext());
    expect(result.block).toBe(true);
    expect(result.blockReason).toContain("CARAPACE LOCK");
  });

  // --- Allowed: reads of openclaw.json ---

  test("allows reading openclaw.json via cat", async () => {
    const event = createToolCallEvent("exec", {
      command: "cat ~/.openclaw/openclaw.json",
    });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });

  // --- Exemptions: SSH and oc-channel ---

  test("allows SSH commands that touch openclaw.json (cross-agent fix)", async () => {
    const event = createToolCallEvent("exec", {
      command: "ssh agent@10.0.0.1 sed -i 's/x/y/' openclaw.json",
    });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });

  test("allows oc-channel commands that reference openclaw.json", async () => {
    const event = createToolCallEvent("exec", {
      command: "oc-channel add --config openclaw.json --name test",
    });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });

  // --- Approval required: gateway operations ---

  test("requires approval for gateway restart", async () => {
    const event = createToolCallEvent("exec", { command: "gateway restart" });
    const result = await handler(event, createMockContext());
    expect(result.requireApproval).toBeDefined();
    expect(result.requireApproval.title).toBe("Protected Operation");
    expect(result.requireApproval.severity).toBe("warning");
  });

  test("requires approval for gateway stop", async () => {
    const event = createToolCallEvent("bash", { command: "gateway stop" });
    const result = await handler(event, createMockContext());
    expect(result.requireApproval).toBeDefined();
  });

  // --- Approval required: hook file edits ---

  test("requires approval for editing hook files", async () => {
    const event = createToolCallEvent("write", {
      path: "/home/agent/.openclaw/hooks/my-hook.js",
    });
    const result = await handler(event, createMockContext());
    expect(result.requireApproval).toBeDefined();
    expect(result.requireApproval.title).toBe("Protected File Edit");
  });

  // --- Allowed: unrelated commands ---

  test("allows unrelated exec commands", async () => {
    const event = createToolCallEvent("exec", { command: "git status" });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });

  test("allows unrelated file writes", async () => {
    const event = createToolCallEvent("write", {
      path: "/home/agent/project/README.md",
    });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });

  test("allows non-exec/write tool calls", async () => {
    const event = createToolCallEvent("read", { path: "/some/file.txt" });
    const result = await handler(event, createMockContext());
    expect(result).toEqual({});
  });
});

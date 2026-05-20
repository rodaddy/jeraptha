import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockState } from "../_fixtures/create-mock-state";
import {
  createPromptBuildEvent,
  createMockContext,
} from "../_fixtures/create-mock-event";

const mockReadFileSync = mock(() => "");

mock.module("fs", () => ({
  readFileSync: mockReadFileSync,
  existsSync: mock(() => true),
  writeFileSync: mock(() => {}),
  statSync: mock(() => ({ mtimeMs: 0 })),
  unlinkSync: mock(() => {}),
}));

const { createInjectSkillIndexPeriodically } =
  await import("../../plugin/injections/inject-skill-index-periodically.js");

describe("inject-skill-index-periodically", () => {
  let state: ReturnType<typeof createMockState>;
  let config: Record<string, any>;
  let logs: string[];
  let log: (msg: string) => void;
  let injection: ReturnType<typeof createInjectSkillIndexPeriodically>;

  beforeEach(() => {
    state = createMockState({ promptTurnCount: 0 });
    config = {};
    logs = [];
    log = (msg: string) => logs.push(msg);
    injection = createInjectSkillIndexPeriodically(state, config, log);
  });

  test("only fires every 10 turns", async () => {
    const skillContent = "# Skills\n- deploy\n- swarm\n";
    mockReadFileSync.mockImplementation(() => skillContent);

    const event = createPromptBuildEvent();

    // Turn 1 -- should not fire
    state.promptTurnCount = 1;
    const r1 = await injection(event, createMockContext());
    expect(r1.appendSystemContext).toBeUndefined();

    // Turn 5 -- should not fire
    state.promptTurnCount = 5;
    const r5 = await injection(event, createMockContext());
    expect(r5.appendSystemContext).toBeUndefined();

    // Turn 10 -- should fire
    state.promptTurnCount = 10;
    const r10 = await injection(event, createMockContext());
    expect(r10.appendSystemContext).toContain("AVAILABLE SKILLS");
    expect(r10.appendSystemContext).toContain("deploy");

    // Turn 20 -- should fire
    state.promptTurnCount = 20;
    const r20 = await injection(event, createMockContext());
    expect(r20.appendSystemContext).toContain("AVAILABLE SKILLS");
  });

  test("returns skill index content", async () => {
    const skillContent =
      "# Skill Index\n\n- deploy: Deploy services\n- swarm: Code review swarm\n- n8n: Workflow management\n";
    mockReadFileSync.mockImplementation(() => skillContent);

    state.promptTurnCount = 10;
    const event = createPromptBuildEvent();
    const result = await injection(event, createMockContext());

    expect(result.appendSystemContext).toContain("deploy: Deploy services");
    expect(result.appendSystemContext).toContain("Do NOT guess at usage");
  });

  test("returns empty when SKILL-INDEX.md cannot be read", async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    state.promptTurnCount = 10;
    const event = createPromptBuildEvent();
    const result = await injection(event, createMockContext());

    expect(result.appendSystemContext).toBeUndefined();
  });

  test("fires at turn 0 (modulo 10)", async () => {
    const skillContent = "# Skills\n";
    mockReadFileSync.mockImplementation(() => skillContent);

    state.promptTurnCount = 0;
    const event = createPromptBuildEvent();
    const result = await injection(event, createMockContext());

    expect(result.appendSystemContext).toContain("AVAILABLE SKILLS");
  });
});

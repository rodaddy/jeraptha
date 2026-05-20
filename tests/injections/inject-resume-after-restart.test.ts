import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockState } from "../_fixtures/create-mock-state";
import {
  createPromptBuildEvent,
  createMockContext,
} from "../_fixtures/create-mock-event";

const mockExistsSync = mock(() => false);
const mockReadFileSync = mock(() => "");
const mockUnlinkSync = mock(() => {});

mock.module("fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  unlinkSync: mockUnlinkSync,
  statSync: mock(() => ({ mtimeMs: 0 })),
  writeFileSync: mock(() => {}),
}));

const { createInjectResumeAfterRestart } =
  await import("../../plugin/injections/inject-resume-after-restart.js");

describe("inject-resume-after-restart", () => {
  let state: ReturnType<typeof createMockState>;
  let config: Record<string, any>;
  let logs: string[];
  let log: (msg: string) => void;
  let injection: ReturnType<typeof createInjectResumeAfterRestart>;

  beforeEach(() => {
    state = createMockState();
    config = {};
    logs = [];
    log = (msg: string) => logs.push(msg);
    mockExistsSync.mockImplementation(() => false);
    mockReadFileSync.mockImplementation(() => "");
    mockUnlinkSync.mockImplementation(() => {});
    injection = createInjectResumeAfterRestart(state, config, log);
  });

  test("returns empty when no RESUME.md exists", async () => {
    mockExistsSync.mockImplementation(() => false);

    const event = createPromptBuildEvent();
    const result = await injection(event, createMockContext());

    expect(result.appendSystemContext).toBeUndefined();
  });

  test("returns appendSystemContext with resume content when file exists", async () => {
    const resumeContent =
      "# Resume Point\n\n**Was about to run:** `npm test`\n";
    mockExistsSync.mockImplementation(() => true);
    mockReadFileSync.mockImplementation(() => resumeContent);

    injection = createInjectResumeAfterRestart(state, config, log);
    const event = createPromptBuildEvent();
    const result = await injection(event, createMockContext());

    expect(result.appendSystemContext).toContain(
      "POST-BOUNCE CONTEXT RECOVERY",
    );
    expect(result.appendSystemContext).toContain("npm test");
    expect(mockUnlinkSync).toHaveBeenCalled();
  });

  test("only fires once (resumeConsumed flag)", async () => {
    const resumeContent =
      "# Resume Point\n\n**Was about to run:** `npm test`\n";
    mockExistsSync.mockImplementation(() => true);
    mockReadFileSync.mockImplementation(() => resumeContent);

    injection = createInjectResumeAfterRestart(state, config, log);
    const event = createPromptBuildEvent();

    const result1 = await injection(event, createMockContext());
    expect(result1.appendSystemContext).toBeDefined();

    // Second call should return empty
    const result2 = await injection(event, createMockContext());
    expect(result2.appendSystemContext).toBeUndefined();
  });

  test("returns empty when RESUME.md exists but is empty", async () => {
    mockExistsSync.mockImplementation(() => true);
    mockReadFileSync.mockImplementation(() => "   \n  ");

    injection = createInjectResumeAfterRestart(state, config, log);
    const event = createPromptBuildEvent();
    const result = await injection(event, createMockContext());

    expect(result.appendSystemContext).toBeUndefined();
  });
});

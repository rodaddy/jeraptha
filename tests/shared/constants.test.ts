import { describe, test, expect } from "bun:test";
import {
  DESTRUCTIVE_GIT,
  QUESTION_PATTERNS,
  EXEMPT_QUESTIONS,
  PROCESS_PATTERNS,
  POSITIVE_SENTIMENT,
  NEGATIVE_SENTIMENT,
  PR_CONTEXT_PATTERNS,
  PRAISE_WITHOUT_REVIEW,
  REVIEW_COMMITMENT,
  WRITE_INTENTS,
} from "../../plugin/shared/constants.js";

describe("DESTRUCTIVE_GIT patterns", () => {
  const matches = (cmd: string) =>
    DESTRUCTIVE_GIT.some((p: RegExp) => p.test(cmd));

  test("blocks git reset", () => {
    expect(matches("git reset --hard HEAD~1")).toBe(true);
    expect(matches("git reset --soft HEAD")).toBe(true);
  });

  test("blocks git force push", () => {
    expect(matches("git push --force origin main")).toBe(true);
    expect(matches("git push origin main -f")).toBe(true);
  });

  test("blocks git clean -f", () => {
    expect(matches("git clean -fd")).toBe(true);
  });

  test("blocks git checkout .", () => {
    expect(matches("git checkout . ")).toBe(true);
  });

  test("blocks git branch -D", () => {
    expect(matches("git branch -D feature")).toBe(true);
  });

  test("blocks git stash drop/clear", () => {
    expect(matches("git stash drop")).toBe(true);
    expect(matches("git stash clear")).toBe(true);
  });

  test("allows safe git commands", () => {
    expect(matches("git status")).toBe(false);
    expect(matches("git commit -m 'test'")).toBe(false);
    expect(matches("git push origin main")).toBe(false);
    expect(matches("git pull")).toBe(false);
    expect(matches("git log --oneline")).toBe(false);
    expect(matches("git branch feature")).toBe(false);
  });
});

describe("QUESTION_PATTERNS", () => {
  const matches = (text: string) =>
    QUESTION_PATTERNS.some((p: RegExp) => p.test(text));

  test("matches factual questions", () => {
    expect(matches("what's the IP for the server?")).toBe(true);
    expect(matches("where is the config file?")).toBe(true);
    expect(matches("how do I deploy this?")).toBe(true);
    expect(matches("which version is running?")).toBe(true);
  });

  test("does not match non-questions", () => {
    expect(matches("deploy to production")).toBe(false);
    expect(matches("fix the bug")).toBe(false);
  });
});

describe("EXEMPT_QUESTIONS", () => {
  const matches = (text: string) =>
    EXEMPT_QUESTIONS.some((p: RegExp) => p.test(text));

  test("exempts preference/opinion questions", () => {
    expect(matches("should I use Redis?")).toBe(true);
    expect(matches("do you want me to proceed?")).toBe(true);
    expect(matches("what do you think?")).toBe(true);
    expect(matches("sound good?")).toBe(true);
  });
});

describe("PROCESS_PATTERNS", () => {
  const matches = (cmd: string) =>
    PROCESS_PATTERNS.some((p: RegExp) => p.test(cmd));

  test("matches process-driven commands", () => {
    expect(matches("git push origin main")).toBe(true);
    expect(matches("gh pr create")).toBe(true);
    expect(matches("deploy to production")).toBe(true);
    expect(matches("drizzle push")).toBe(true);
    expect(matches("run the swarm")).toBe(true);
  });

  test("does not match regular commands", () => {
    expect(matches("git status")).toBe(false);
    expect(matches("cat README.md")).toBe(false);
  });
});

describe("SENTIMENT patterns", () => {
  test("positive patterns detect praise", () => {
    const match = POSITIVE_SENTIMENT.find((s: any) => s.p.test("great job!"));
    expect(match).toBeDefined();
    expect(match!.w).toBeGreaterThan(0);
  });

  test("negative patterns detect anger", () => {
    const match = NEGATIVE_SENTIMENT.find((s: any) =>
      s.p.test("what the hell"),
    );
    expect(match).toBeDefined();
    expect(match!.w).toBeLessThan(0);
  });

  test("negative emoji patterns work", () => {
    const match = NEGATIVE_SENTIMENT.find((s: any) => s.p.test("🤦"));
    expect(match).toBeDefined();
  });
});

describe("PR_CONTEXT_PATTERNS", () => {
  const matches = (text: string) =>
    PR_CONTEXT_PATTERNS.some((p: RegExp) => p.test(text));

  test("matches PR links and references", () => {
    expect(matches("check this PR: https://github.com/org/repo/pull/42")).toBe(
      true,
    );
    expect(matches("PR #123 is ready")).toBe(true);
    expect(matches("please review this pull request")).toBe(true);
    expect(matches("code review the changes")).toBe(true);
    expect(matches("review my code")).toBe(true);
  });

  test("does not match unrelated messages", () => {
    expect(matches("the weather is nice")).toBe(false);
    expect(matches("deploy to prod")).toBe(false);
  });
});

describe("PRAISE_WITHOUT_REVIEW", () => {
  const matches = (text: string) =>
    PRAISE_WITHOUT_REVIEW.some((p: RegExp) => p.test(text));

  test("matches sycophantic praise", () => {
    expect(matches("looks great!")).toBe(true);
    expect(matches("ship it!")).toBe(true);
    expect(matches("lgtm")).toBe(true);
    expect(matches("awesome work")).toBe(true);
  });
});

describe("REVIEW_COMMITMENT", () => {
  const matches = (text: string) =>
    REVIEW_COMMITMENT.some((p: RegExp) => p.test(text));

  test("matches review commitments", () => {
    expect(matches("let me check the code")).toBe(true);
    expect(matches("I'll review the changes")).toBe(true);
    expect(matches("examining the diff now")).toBe(true);
    expect(matches("spawning a review agent")).toBe(true);
  });

  test("does not match vague responses", () => {
    expect(matches("cool!")).toBe(false);
    expect(matches("nice")).toBe(false);
  });
});

describe("WRITE_INTENTS", () => {
  test("matches write operations", () => {
    expect(WRITE_INTENTS.test("sed -i 's/foo/bar/' file.json")).toBe(true);
    expect(WRITE_INTENTS.test("echo 'data' > openclaw.json")).toBe(true);
    expect(WRITE_INTENTS.test("tee output.txt")).toBe(true);
  });

  test("does not match read operations", () => {
    expect(WRITE_INTENTS.test("cat openclaw.json")).toBe(false);
    expect(WRITE_INTENTS.test("grep pattern file")).toBe(false);
  });
});

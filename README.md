# Jeraptha v4

Rulings enforced as tested hooks, not as prose.

Jeraptha is a set of Claude Code hooks that turn an operator's standing
rulings ("never write to /tmp", "every agent commit says which model made
it", "one visible worker per lane") into refusals, rewrites and loaded text.
Each rule is a small TypeScript module with its own tests. When a rule
refuses a call, it names the command to run instead.

It also ships the benchmark the author used to decide which model and effort
each kind of worker lane gets (`bench/`).

## Why it exists

Agents read rules, agree with them, and break them an hour later, usually in
a one-line reflex such as `> /tmp/out.txt`. Longer prompt files made it worse,
not better. What held was moving each rule that kept failing out of prose and
into a hook:

- **Deterministic first.** If a script can decide it, the hook decides it.
  Prose is kept for judgment calls, and even those are loaded into every turn
  by a hook (`rulings`) instead of living in a file nobody opens.
- **Refuse with the fix.** A refusal that says only "no" makes the agent try
  variants. Each refusal here names the right command.
- **Every rule has a test.** A rule that cannot fail a test is not a rule.
- **Not a security boundary.** These hooks read shell text and can be evaded
  on purpose. They catch mistakes. Safety gates (destructive deletes,
  secrets) belong in your harness's permission settings, which still run
  beneath every call these hooks pass on.

## What is in it

`hooks/` is a Claude Code plugin (a "mod" of function hooks). Twelve rules:

| Rule | What it does |
|---|---|
| worktree | Denies `git worktree` in any spelling and the worktree tools; names the `wt` (worktrunk) command instead. |
| literal-word | Rewrites `X=git; $X status` to the literal command so later gates judge what actually runs. |
| identity | Adds `Agent: claude-code · <model> · <seat>` to commits and refuses an agent commit without it. |
| cluster | `kubectl`/`helm` reads stay open everywhere; changes only from the configured infra checkouts. |
| model-gate | Denies `claude -p` headless runs and an opt-in-only model unless an env flag is set. |
| visible-lanes | One agent per Workflow call, so every worker is its own visible row; no hidden background agents. |
| no-tmp | Denies writes, redirects, `mktemp` and `cd` into `/tmp` and friends, including through symlinks. Reads stay open. |
| pr-bar | Denies opening a forge PR except through your PR-opener script. |
| lane-budget | Denies polling loops: `ScheduleWakeup` under 30 minutes and crons more often than every 30 minutes. |
| rulings | Loads your one-line judgment rulings into the system prompt every turn. |
| compact-save | Before a compaction, writes a handoff file (your verbatim asks plus a model summary) and can roll over to a fresh session instead. |
| worktree-reaper | Removes linked worktrees whose branch is pushed and that hold nothing unsaved. |

`hooks/SPEC.md` is the full behaviour of each rule. `hooks/bin/rule-check.ts`
exposes the no-tmp decision as a CLI for Codex and Pi hooks.

## Running it

Needs Claude Code with plugin hooks (built and tested on 2.1.296), and Node 24
for the no-tmp CLI and its tests (they run `.ts` files through Node's native
type stripping). The benchmark in `bench/` is plain `.mjs` and needs Node 22
or later (see `bench/README.md`).

1. Clone this repo.
2. Edit `hooks/hooks/config.ts`: set `DEV_ROOT` and `TMP_ROOT` to your
   workspace and scratch roots, the infra checkouts and the port-forward
   namespaces (`PORT_FORWARD_NAMESPACES`, default the author's
   `browser-pool`) for `cluster`, your PR opener for `pr-bar`, and your own
   `RULINGS`. Rules apply only when a
   session's cwd is under one of the roots (the worktree rule applies
   everywhere).
3. Add the `hooks/` folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of
   your Claude Code settings. It hot-reloads on save.

Check and test from `hooks/`:

```sh
claude plugin validate .
claude plugin test .
node --test bin/rule-check.spec.ts
```

At release: 859 of 864 plugin tests pass under `claude plugin test .`, and
all 47 CLI tests pass under `node --test bin/rule-check.spec.ts`. The plugin
count needs Claude Code's plugin engine; plain Node cannot run those tests.
The CLI count needs only Node 24. The 5 plugin failures are in compact-save
(see CHANGELOG, known issues).

## What is production-proven and what is not

- Proven: the twelve rules have run in the author's Claude Code sessions on
  his own machine since early October 2026, under his own paths.
- Not proven: this public build. Paths, the infra seat list, the PR-opener
  name and the rulings text moved into `config.ts` for release; the tests pass
  against its defaults, but nobody else has run it yet.
- The rulings, deny messages and examples are the author's (dated, some name
  him). Replace them with your own.

## What it does not do

- It is not a sandbox and not a security control. See "Not a security
  boundary" above.
- It does not work in other harnesses except the no-tmp CLI.
- It does not score or reward the agent. v3 did; v4 dropped it.
- It does not ship the author's private rules that only make sense inside his
  fleet (a forge admin-token gate, a forge API wrapper gate, an LSP-memory
  handover). They are listed in `hooks/SPEC.md`.

## bench/

The worker-model benchmark: replay finished tasks from a frozen commit, give
every model the same frozen brief, and score each run with hidden checks it
never sees. The 2026-10-03 round (6 tasks, 6 settings, 2 rounds) is in
`bench/results/`. Its task repo is private, so the harness ships with an
example task instead. See `bench/README.md`.

## History

v1 to v3 were an OpenClaw plugin for a single long-running agent: 21 gates, a
behavioral scorecard and a heartbeat. v4 is a rewrite for Claude Code and many
short-lived agents. See `CHANGELOG.md`.

The name is from the Expeditionary Force books: the Jeraptha run a
compliance office and bet on every outcome.

## License

MIT. See `LICENSE`.

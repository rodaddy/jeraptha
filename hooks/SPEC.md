# dev-rules: an operator's rulings as hooks

A Claude Code mod (plugin of function hooks). It turns rulings that prose
kept failing to hold into refusals, rewrites and loaded text. The rulings are the
author's (dated inline); swap in your own.

## How it runs

- Loads in every Claude Code session from this folder, named in
  `CLAUDE_CODE_PLUGIN_DIRS` (env block of `~/.claude/settings.json`). Claude
  Code only: Claudex, Codex and Pi sessions are other harnesses with their
  own rules.
- Its `tool.call` hooks run ABOVE the settings permission gates. It can deny,
  rewrite, or answer a call; the settings gates still run beneath every call
  it passes on and stay the final authority. A rule that cannot read a line
  calls `next(e)` and lets the gates decide.
- Hooks see worker (subagent) calls too: `e.agentId` is set inside one.
- Best-effort above the gates: a hook that throws, runs past its 10 s budget
  or answers a wrong shape is skipped and the call goes on (d.ts 3834-3837,
  4929). A rule that reads files catches its own errors and calls `next(e)`.
- Loaded from `CLAUDE_CODE_PLUGIN_DIRS` and hot-reloaded on save: no install,
  uninstall or `/reload-plugins`.
- Scope: rules apply when the session's cwd (`$.session.cwd()`) is under
  `DEV_ROOT` or `TMP_ROOT` (both set in `hooks/config.ts`), unless a rule says
  otherwise. Exception: the worktree rule is global (Rico ruling
  2026-10-03): `git worktree` and the worktree tools are denied in any cwd.

## Layout

- `hooks/register.ts`: wires each rule. Nothing else. Order: compactSave,
  literalWord, worktree, identity, cluster, modelGate, visibleLanes, rulings,
  noTmp, prBar, laneBudget, worktreeReaper. compactSave is first so its
  tool-call recorder sees every call, including ones a later gate refuses (it
  only observes and passes the call on); literalWord is next, so every gate
  after it judges the rewritten line.
- `hooks/core/<rule>.ts`: a rule's harness-free decision (see Shared core).
- `bin/rule-check.ts`: the core as a CLI for Codex and Pi.
- `hooks/lib/shell.ts`: a small Bash reader (`commands(line)` -> argv, head,
  isDynamic; `gitSubcommand(argv)`). Not the gates' parser, which a mod may
  not import.
- `hooks/rules/<rule>.ts` exports `<rule>(on: On)`; `hooks/rules/<rule>.test.ts`
  tests it with `claude-code/testing`. Pattern: `rules/worktree.ts` and its test.
- Check: `claude plugin validate .` and `claude plugin test .` from this folder.

## Rules

### worktree (built)
`git worktree` in any spelling (git options before the subcommand, wrappers,
`sh -c` payloads) and the `EnterWorktree`/`ExitWorktree` tools: deny, naming
the `wt` command for create, switch, remove and list.

### literal-word
Rewrites a command word given as a variable that the same line assigned a
literal value, so the agent's command runs as written instead of being
refused by the gates . Rule C8 (2026-09-29) removed this
substitution from the gates' READING; here the line itself is rewritten
before the gates read it, so the gates judge the literal command that runs.
- Applies only when: a standalone assignment `NAME=value` or `export
  NAME=value` appears earlier in the same line; `value` has no `$`, backtick,
  `$(`, glob or unquoted space; NAME is not assigned again before the use;
  the use is the command word (`$NAME` or `${NAME}` as argv[0] of a simple
  command).
- Rewrites that command word to the value, leaves the assignment in place,
  passes the rewritten line on with `next`, and returns `context` telling the
  agent: "rewrote $NAME to <value>: write literal command words".
- Anything else: `next(e)` unchanged.

### cluster
`kubectl` and `helm` (after wrappers): reads stay open everywhere; changes
only from the infra seat.
- kubectl reads: get, describe, logs, top, explain, api-resources,
  api-versions, version, cluster-info, events, `config view|get-contexts|current-context`,
  `auth can-i|whoami`, diff.
- `kubectl port-forward` is a read only with exactly one namespace
  listed in `PORT_FORWARD_NAMESPACES`, and every `--address` on loopback.
- helm reads: list, ls, status, get, history, show, template, search, version,
  env, lint, `repo list`, `dependency list`.
- Any other verb is a change. The infra seat is a session whose cwd is under
  `<DEV_ROOT>/infra` or
  `<DEV_ROOT>/k3s-deploy`. Elsewhere: deny,
  `CLUSTER_DENY` from `hooks/config.ts`.

### identity
Every agent commit says which harness, model and agent made it ; no session link.
- `attribution.text` kind `commit`: `Agent: claude-code · <model> · <seat>`,
  where `<model>` is the session's model id and `<seat>` is `<cwd basename>
  head`. Kind `pr`: empty (PR bodies already open with the `**agent:**` line).
- `tool.call` Bash with a `git commit` carrying `-m`/`--message` or `-F`/`--file`:
  read the message (the `-F` file through `$.fs`); deny when it has no line
  starting `Agent: ` (say the exact line to add) or when it has a
  `Claude-Session:` line (say to remove it). `--amend --no-edit`, `-C`/`-c`
  reuse and a commit with no message flag: `next(e)`.

### model-gate
`claude -p` is never run and Fable runs only when Rico selects it (Rico
rulings 2026-10-05).
- `tool.call` Bash: `claude` or `claudex` in print mode (`-p`, `--print`, or
  a short-option cluster holding `p` such as `-cp`, before any `--`), at any
  depth the shell reader unwraps, is denied: "claude -p is never run ...:
  local work runs as Workflow agents".
- `tool.call` Workflow (the `scriptPath` file when given; unreadable allows)
  where an `agent()` options object, or a `routeWorkflowWorker()` route (its
  first argument), has a `model:` naming `fable` or `claude-fable*`, and
  `tool.call` Agent with such a `model`, are denied (a `model:` elsewhere,
  such as the router's route table, does not count): "Fable runs only when Rico selects
  it". `DEV_RULES_ALLOW_FABLE=1` (set by Rico when he launches a Fable
  session) allows both.

### visible-lanes
Rico must see every worker (ruling 2026-10-02, restated 2026-10-03).
- `tool.call` Workflow (the `scriptPath` file when given; unreadable or a
  named workflow allows): denied when the script may start more than one
  agent: "one lane per Workflow call, so each lane is its own visible row;
  launch the others as separate Workflow calls (at most 6 at once)". That is
  more than one `agent(` call site in code (comments and string text blanked,
  `x.agent(` and `fooagent(` not counted), or one call site inside code that
  repeats: the arguments of `.map(`, `.forEach(`, `parallel(` or `pipeline(`,
  or the body of a `for`, `while` or `do` loop. The word "agent" in prompt
  text is not a call.
- `tool.call` Bash: a `claude`, `claudex`, `codex` or `pi` command with `-p`,
  `--print` or `exec` (or `codex e`) is denied when it runs with
  `run_in_background: true` or sits in a command list a single `&` sends to
  the background (`(claude -p x) &` included; `&&`, `&>`, `>&`, `<&` and `|&`
  are not background operators; heredoc bodies, quotes and comments are
  skipped): "a hidden background agent; run it as a Workflow lane".
- Both: headless sessions (`$.session.surfaces()` empty) are exempt.

### no-tmp
Never /tmp (standing rule). The decision is the shared core
(`hooks/core/no-tmp.ts`, below); `rules/no-tmp.ts` is its Claude adapter.
- `Write`, `Edit`, `NotebookEdit`: a path under `/tmp`, `/private/tmp` or
  `/private/var/folders`, by spelling or by where its links really land, is
  denied, naming the scratch root `<TMP_ROOT>/<project>/<repo>/`.
  A link that leads nowhere (dangling) is denied: where it writes is unknown.
- Bash: an output redirect, `tee`, or the destination of `cp`/`mv`/`install`
  under those roots is denied the same way; a relative target is judged
  against the cwd and any literal `cd`/`pushd` in the line; `sh -c` and
  `watch` payloads are read as their own line; `$TMPDIR` is the session's
  own TMPDIR, `~` is HOME. Heredoc bodies are data. Reads stay open.
- Bash (D3.1): `mktemp` without a `-p DIR`/`--tmpdir=DIR` folder or a
  template that names its place (or with `-t`) is denied whatever TMPDIR is;
  a literal `cd`/`pushd` into those roots is denied on its own; a TMPDIR value
  under them (`TMPDIR=x cmd`, `env TMPDIR=x`, `export`/`declare` operands) is
  denied. 

### pr-bar
Sessions do not open poor PRs (Rico ruling 2026-10-05). The PR opener (`PR_OPENER` in `hooks/config.ts`)
applies the intake bar; this rule denies the other ways a session opens a
Forge PR: `tea pr create` (`pr`/`pull`/`pulls`, `create`/`c`), a curl POST
(explicit `-X`, else data flags) to `/repos/<o>/<r>/pulls`, and an AGit
`git push` (a refspec to `refs/for/<base>`, or `-o`/`--push-option` with
`title=` or `description=`, on the line or as `-c remote.<r>.push=...refs/for/...` /
`-c push.pushOption=title=...`), and a `git config` that persists either.
Config already persisted before the session cannot be seen by the hook; refusing
that AGit push is a server-side job. Merges, reviews and
comments on a PR are untouched.

### lane-budget
No watch loops (Rico ruling 2026-10-05), inside the configured roots only:
`ScheduleWakeup` under 30 minutes and a `CronCreate` firing more often than
every 30 minutes are denied; a cron it cannot read is allowed.
Lane counts (per day, per PR) were tried and removed 2026-10-05: they belong
to a review service's budget, not to the local machine.

### rulings (prompt.compose)
Adds one `session` section to the system prompt, so the rulings that are
judgment calls are loaded every turn instead of living in a file nobody opens.
It states the harness, worked out from the environment (Claude Code native:
"Claudex is Claudex, Claude is Claude, Codex is Codex, Pi is Pi; rules for
other harnesses do not apply here"), then the one-line rulings listed in `RULINGS` in
`hooks/config.ts` (the author's, shipped as an example).

### compact-save
Work keeps going through a compaction (Rico, 2026-10-03).
- `session.compact` of the main conversation (not `precompute`, no `agentId`),
  in scope: `$.model.fork` writes a 10-section handoff (auto-handoff's prompt)
  to `<TMP_ROOT>/<project>/<repo>/_handoff/handoff-<stamp>.md`,
  headed as model-written and unverified, and points `_handoff/LATEST.md` at it.
  A cwd in a lane worktree (`_tmp/_worktrees/<harness>/<project>/<repo>/<purpose>/...`)
  maps to that project and repo; a cwd it cannot place goes to
  `<TMP_ROOT>/_handoff/<name>`, never a new top-level
  `_tmp/<name>/` folder ().
- The handoff opens with Rico's ask, verbatim, copied by the hook (never by
  the model): his first prompt that is not a bare "continue", then his last
  three. After an `auto` compaction it ends with the plugin's own record of
  the main thread's tool calls since the last turn start (the turn the
  compaction cut), which the fork cannot see.
- After a compaction that stands, one user-role note tells the model to read
  that file and check its claims. An unanswered fork is logged; a compaction
  is never blocked. Never writes the repo or a `.gitignore`.
- Trigger `auto` rolls over to a fresh session instead (Rico, 2026-10-04):
  once the handoff is written and reads back non-empty, the compaction is
  vetoed (`compact-save: handoff written to <path>; starting a fresh
  session`), `$.clock.after(300)` runs `/clear` and then submits "Read <path>
  first ..." as the fresh session's first prompt, and one `$.ui.log` line
  names the old session id and the path. No handoff (fork unanswered, write
  failed, any error): no veto, it compacts as above. `manual`, `plugin` and
  subagents compact in place, as above. A second auto compaction within 5
  minutes of this process's last rollover compacts instead, so a fresh
  session that starts over the threshold cannot loop. The guard is a module
  variable, not `$.store`: `/clear` keeps the process and the module, and
  `$.store` is shared by every session, so one session's rollover would turn
  another's into a compaction. The rollover ends the running main turn first
  (`$.turn.abort`), then runs the worktree reaper (below) just before `/clear`.
- The third rollover in a chain pauses (Rico, 2026-10-08): it still writes the
  handoff and runs `/clear` but submits nothing, toasting, logging and
  appending as a user note `compact-save: paused after 3 handoffs ...`. Only a
  rollover whose `/clear` succeeded counts. While paused, a prompt of any
  other origin (peer, plugin, notification) is dropped with that text. Rico's
  next own prompt (composer, bridge, sdk) is the approval: it enters prefixed
  with "Read <path> first ...", and only once it is accepted (not dropped,
  not thrown) does the pause clear and the count reset; a slash command or an
  empty prompt passes through and keeps the pause. His prompt in a session he
  started also resets the count.
- The cap pause then asks a menu (Rico, 2026-10-12) through `$.ui.ask`, header
  `Rollover`, naming the count and the handoff path: `Full handover`,
  `Run 2 more`, `Run 3 more`, `Run 4 more`. The ask is started detached, so
  the rollover ends as before. An answer acts only if the same pause still
  holds (a prompt from Rico already resumed it otherwise): `Run N more`
  clears the pause and submits the "Read <path> first ..." prompt, and the
  chain now pauses at the current count plus N (back to 3 wherever the count
  resets); `Full handover` clears the pause, resets the count and submits a
  prompt that has the fresh session read the handoff, not continue its work,
  and run the `handover-author` skill with its full drain, ending on the
  kickoff paste for a brand new session. Free text, a dismissed menu (or
  `-p`), or a caller with no `ask` binding (another rule calling `rollOver`) stays paused, logged
  once; a refused submit is logged with the path and the pause stands as it
  was. The idle pause asks the same menu (Rico, 2026-10-12), naming the idle
  reason instead of the count; its `Run N more` pauses at the current count
  plus N.
- An idle large session rolls over before its prompt cache expires (Rico,
  2026-10-08, "Roll over before expiry"). Each main `turn.complete` (matched
  by a RegExp on every `reason`; the unmatched one is the reaper's) arms one
  `$.clock.after` for `DEVRULES_CACHE_TTL_S - DEVRULES_CACHE_MARGIN_S` seconds
  (defaults 3600 and 600, read once). A generation counter, bumped by every
  turn start, prompt, compaction and rollover, voids a pending timer. When it
  fires with nothing since, no turn running, no rollover in flight, nothing
  paused, the cwd in scope and `$.session.usage().context.tokens` at least
  `DEVRULES_CACHE_ROLL_MIN_TOKENS` (default 150000), it writes the handoff
  (the same prompt plus "sat idle for <n> minutes and its prompt cache is
  about to expire"), runs `/clear` and pauses as the cap does, with the text
  `compact-save: paused, idle near cache expiry ...` and the menu; Rico's
  next prompt resumes the same way. It neither counts toward the cap nor resets the
  count. An unreadable context size does nothing (logged once); so does an
  empty record of Rico's asks (logged once) and a subagent still pending,
  running or waiting (`$.agent.list()`). The idle rollover cannot see
  background shells or monitors. A TTL that is not above 0, a margin not
  between 0 and the TTL, or a minimum under 1000 tokens falls back to the
  defaults, logged once. Just before `/clear` it checks again: a prompt or
  turn since it fired cancels it (`compact-save: idle rollover cancelled:
  activity`), the handoff stays on disk and nothing pauses. The timer is armed
  in a `finally`, so a throwing hook below `turn.complete` cannot leave the
  turn marked running.
- One rollover at a time: every path (auto compaction, `rollOver` for other
  rules, the idle timer) holds an in-flight flag from the start of its
  handoff's writing to the end of its rollover; while it holds, a compaction
  compacts without a handoff, `rollOver` throws and the idle timer does
  nothing.

### worktree-reaper
Done is done, remove it (Rico, 2026-10-04). A linked worktree goes as soon
as its branch is pushed and it holds nothing unsaved; the branch stays on
Forge (`wt switch` reopens it for review fixes).
- Reapable when ALL hold, per worktree, each a plain read: (1) a linked
  worktree of the session's repo on a branch, not the main checkout or a
  detached head (`wt -C <root> list --format=json`, `worktree.main`), and
  under `<TMP_ROOT>/_worktrees`; (2) `upstream` set and
  `ahead == 0`; (3) `git -C <path> status --porcelain=v1
  --untracked-files=all` exits 0 and is empty or only untracked
  `node_modules` (the wt pre-start symlink); `--untracked-files=all`
  overrides `status.showUntrackedFiles=no`; ignored files are not read
  (no `--ignored`), so a worktree holding only ignored files is reapable;
  (4) no `n` line of `lsof -a -d cwd -Fn`, and not the session's cwd, is at
  or under it; (5) nothing loads from it: `CLAUDE_CODE_PLUGIN_DIRS`, the
  symlink targets in `~/.claude/dev-mods/*/*` and `~/.pi/agent/extensions/*`,
  and any mention in `~/.codex/hooks.json`; (6) its folder mtime and its last
  commit are both over 10 minutes old.
- Action: `wt -C <root> remove --no-delete-branch --force --yes --foreground
  <branch>`; when `git -C <root> branch -r --merged origin/<default>` lists
  `origin/<branch>`, `-D` instead (local branch deleted too). Never a remote
  delete. `--force` only for the untracked symlink. One `$.ui.log` line per
  removal (`worktree-reaper: removed <branch> (<reason>)`) and one toast with
  the count; nothing reapable is silent.
- When: `turn.complete` of the main agent (no `agentId`), in scope, at most
  once every 5 minutes (`$.store`), not awaited by the turn; and from
  compact-save's rollover before `/clear`, unthrottled. A plugin's `$` cannot
  cross an import (the engine's load check refuses it), so compact-save binds
  the reaper's engine calls (`ReaperIo`) at that one call site. The root is
  wt's `main` item, so a session inside a linked worktree reaps from the main
  checkout and rule 4 keeps its own worktree.
- Every process call has a 5 s timeout; a failure skips that worktree (wt,
  git rev-parse or lsof failing skips them all) and never breaks the turn.

## Shared core (Codex and Pi)

The core and its Claude adapter are on main; the CLI and the Pi
extension are WRITTEN, not wired: the head applies the wiring below.

- **In the core:** no-tmp only (`hooks/core/no-tmp.ts`, a pure function: no
  `claude-code` import, no engine `$`). Input `{ tool, command?, path?, cwd,
  tmpdir?, home?, realpath? }` with `tool` one of `bash`, `write`, `edit`,
  `notebook`; output `{ deny } | null`. `realpath` returns the real path,
  `''` (or throws) when nothing is there, and `null` for a link that leads
  nowhere, which denies. `rules/no-tmp.ts` is the Claude adapter: it resolves
  links with `$.fs.stat` for the paths `realpathQueries` names, then hands
  the core a sync lookup. The core lives inside `hooks/` so the mod loader
  import question does not arise.
- **CLI:** `/opt/homebrew/opt/node@24/bin/node bin/rule-check.ts --harness codex|pi`,
  one hook payload JSON on stdin. It passes the core `TMPDIR`, `HOME`, and a
  `realpath` over `realpathSync` that maps a throw on a path `lstat` still
  finds (a dangling link) to `null`, so it denies as the Claude hook does.
  - `codex`: a PreToolUse payload (`tool_name`, `tool_input`, `cwd`).
    `Bash`/`Shell`/`exec_command` read `command` or `cmd`: a string, or an
    argv. A shell argv (`bash`, `sh`, `zsh`, `dash`, `ksh`, any path) with
    a `-c`-style flag yields its script; any other argv is read as quoted
    words, never re-parsed as shell. A `workdir` is the base for relative
    targets (read as a leading `cd`; the session `cwd` still sets scope).
    The patch an executed `apply_patch`/`applypatch` carries (argv, argument
    or heredoc) is read too. `apply_patch` reads its `*** Add File: `,
    `*** Update File: `, `*** Delete File: ` and `*** Move to: ` lines;
    `Write`/`Edit`/`NotebookEdit` read the path field. Deny:
    `{"decision":"block","reason":...}` on stdout, exit 0 (the shape of the
    existing Codex guard hooks).
  - `pi`: `{ toolName, input, cwd }` from the `tool_call` event (`bash` reads
    `input.command`, `write`/`edit` read `input.path`, with a leading `@`
    dropped and a `file://` URL read as its path). Deny: the reason on stdout,
    exit 2.
- **Fail open:** malformed input, an unknown tool or any exception exits 0
  with one `rule-check: ... (allowed)` line on stderr. A style rule, not a
  safety gate; your settings permission gates stay the fail-closed safety lane.
- **Tests:** `node --test bin/rule-check.spec.ts` from this folder (`.spec.ts`: `claude plugin test` loads every `*.test.ts` as a hooks module).

### Wiring it into Codex and Pi

Codex: one more entry in `~/.codex/hooks.json` `hooks.PreToolUse`:

```json
{
  "matcher": "Bash|Shell|exec_command|functions\\.exec_command|apply_patch|functions\\.apply_patch|Write|Edit|NotebookEdit",
  "hooks": [
    {
      "type": "command",
      "command": "node <path-to-jeraptha>/hooks/bin/rule-check.ts --harness codex",
      "timeout": 5
    }
  ]
}
```

Pi: a small extension that spawns the CLI for `bash`/`write`/`edit` and
returns `{ block: true, reason }` on exit 2 (2 s timeout, fail open). The
author's extension is not part of this repo.

## Not in this mod

- Safety gates (destructive deletes, secrets, protected config) belong in the
  harness's settings-level permission gate, which stays the final authority.
- Rules that only make sense inside the author's fleet were left out of the
  public release: a gate on one forge's admin token (it names a password-vault
  item), a gate routing raw forge API calls through a private CLI, and an
  LSP-memory handover that needs a private launchd watcher.

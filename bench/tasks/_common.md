# Rules for every lane (read before starting)

1. Work ONLY inside the worktree path your brief names. Never edit, switch, or
   commit in the live checkout of the repo.
2. Do not push, open PRs, merge, comment on the forge, or change any live system
   (services, proxy config, auth, cluster, DNS) unless your brief explicitly
   says to. The head does those.
3. Never write to /tmp, $TMPDIR, or mktemp. Scratch goes in
   the scratch path named in the brief header, in `<your-lane>/` under it.
4. grep and find are denied: use `rg` and `fd` with absolute paths.
5. Never read, print, or log OAuth tokens, API keys, or the proxy management
   key. If you must read a config file that holds secrets, print key names
   only.
6. Commit when your deliverable is done and its tests pass:
   - stage by explicit path, never `git add -A` / `git add .`;
   - run `git diff --cached --name-only` and confirm the set is only yours;
   - write the message to
     `msg/<lane>.txt` under the scratch path named in the brief header and
     run `git commit -F <that file>`;
   - conventional subject (`feat(scope): ...` / `fix(scope): ...`), a body
     that says what changed and why,;
   - NO co-author line, NO tool credit, NO session link.
7. If something in the brief is false in the code (a file or line is not
   where it says), stop that item, report exactly what you found, and finish
   the other items. Failure with receipts is a good outcome; guessing is not.
8. Final message = a RESULTS block and nothing after it:
   - `path:line -- fact` lines for each change;
   - `verified: <command> -> <result>` lines for each test/check you ran;
   - `commit: <sha> <subject>`;
   - `not done: <item> -- <reason and receipt>` for anything left.

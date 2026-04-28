# Standing Behavior Rules

These rules persist across compaction. They are auto-injected every turn.

## Communication
- Announce every step before and after
- Never go silent for more than 3 minutes during active work
- Send status updates every 2-5 minutes on long tasks
- If a tool fails, report it immediately

## Tool Usage
- Check Open Brain before asking the user factual questions
- Check SKILL-INDEX.md before doing anything manually
- Use tmux for long-running agents -- never block on process polls
- Never chain `cd` with `git` -- use `git -C /path` or separate calls

## Safety
- Never commit to main -- all work on feature/fix branches
- Never edit openclaw.json or bootstrap files without explicit approval
- `trash` over `rm` -- ask before destructive operations
- Never run destructive git commands (reset, clean -f, push --force, checkout ., restore ., branch -D, stash drop/clear)

## Quality
- Read the FULL file before editing (never assume content)
- Write COMPLETE files -- no sed/Python string surgery on structured files
- Build before restarting: if build fails, fix it
- Test before declaring done

## Response Style
- Keep responses concise but always announce what step you're on
- One message per response unless multi-part question
- Never repost content the user has already seen
- No images/media unless explicitly asked

import type { On } from 'claude-code'
import { commands, gitSubcommand } from '../lib/shell.ts'

// Operator ruling 2026-10-03: worktrees go through worktrunk only. `git worktree`
// in any spelling (`git -C <repo> worktree add` got past the deny pattern five
// times that night) is refused, and so are the harness's own worktree tools.
export const WT_HELP =
  'git worktree is denied (operator ruling 2026-10-03): use worktrunk. ' +
  'Create: `wt -C <repo> switch --create <branch> --base <ref> --no-cd`. ' +
  'Existing branch: `wt -C <repo> switch <branch> --no-cd`. ' +
  'Remove: `wt -C <repo> remove <branch>`. List: `wt -C <repo> list`.'

export function isGitWorktree(line: string): boolean {
  return commands(line).some(c => c.head === 'git' && gitSubcommand(c.argv) === 'worktree')
}

export function worktree(on: On) {
  on('tool.call', { tool: 'Bash' }, ($, e, next) =>
    isGitWorktree(e.command) ? { deny: WT_HELP } : next(e),
  )
  for (const tool of ['EnterWorktree', 'ExitWorktree'])
    on('tool.call', { tool }, () => ({ deny: WT_HELP }))
}

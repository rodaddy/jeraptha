import type { Register } from 'claude-code'
import { literalWord } from './rules/literal-word.ts'
import { worktree } from './rules/worktree.ts'
import { identity } from './rules/identity.ts'
import { cluster } from './rules/cluster.ts'
import { modelGate } from './rules/model-gate.ts'
import { visibleLanes } from './rules/visible-lanes.ts'
import { rulings } from './rules/rulings.ts'
import { noTmp } from './rules/no-tmp.ts'
import { prBar } from './rules/pr-bar.ts'
import { laneBudget } from './rules/lane-budget.ts'
import { compactSave } from './rules/compact-save.ts'
import { worktreeReaper } from './rules/worktree-reaper.ts'

// Operator rulings, enforced as hooks. Each rule lives in ./rules/<name>.ts
// and is wired here; the roots it applies to are in ./config.ts. Any settings
// permission gates still run beneath every tool.call hook and stay the final
// authority.
// compactSave is first so its tool-call recorder sees every call, including
// ones a gate below refuses; it only observes and passes the call on.
// literalWord comes next: it rewrites the line so the gates after it judge
// the literal command.
export const register: Register = on => {
  compactSave(on)
  literalWord(on)
  worktree(on)
  identity(on)
  cluster(on)
  modelGate(on)
  visibleLanes(on)
  rulings(on)
  noTmp(on)
  prBar(on)
  laneBudget(on)
  worktreeReaper(on)
}

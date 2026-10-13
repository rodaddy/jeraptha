// The one file to edit when you install these hooks on your own machine.
//
// Hooks run inside Claude Code's plugin engine, which gives a rule no
// synchronous environment, so the roots live here as constants. Change them,
// save, and the engine hot-reloads the mod. The tests use these defaults.

/** Your workspace: rules apply only when the session's cwd is under one of these. */
export const DEV_ROOT = '/work/dev'
/** Your scratch root. Scratch goes to `<TMP_ROOT>/<project>/<repo>/`, never /tmp. */
export const TMP_ROOT = '/work/_tmp'
export const SCOPE_ROOTS = [DEV_ROOT, TMP_ROOT]

/** True when `dir` is one of SCOPE_ROOTS or below one. */
export const inScope = (dir: string) => SCOPE_ROOTS.some(r => dir === r || dir.startsWith(r + '/'))

/** cluster rule: the only checkouts allowed to change a Kubernetes cluster. */
export const INFRA_SEAT = [`${DEV_ROOT}/infra`, `${DEV_ROOT}/k3s-deploy`]
/** cluster rule: where cluster changes go instead. */
export const CLUSTER_DENY =
  'cluster changes go to the infra seat (a board task for the infra agent, or ' +
  'the infra session): reads stay open'
/** cluster rule: `kubectl port-forward` reads only into these namespaces, loopback only. */
export const PORT_FORWARD_NAMESPACES = ['browser-pool']

/** pr-bar rule: the one sanctioned way to open a PR (it applies your intake bar). */
export const PR_OPENER = 'bin/forge-pr-open'

/**
 * rulings rule: judgment-call rulings loaded into the system prompt every turn
 * (one line each). These are the author's; replace them with your own.
 */
export const RULINGS = [
  'Deterministic first (a script or gate), then a typed model decision, prose last.',
  'Rule docs are workflows: read the headings, take the branch that fits.',
  'A handover or repo layer may adjust a base rule only where the base would stop the work, naming which rule and why.',
  'Review your own PR with a local two-reviewer swarm, fix every P0/P1, see tests and CI green, then merge.',
  'Infra changes live in one seat.',
  'Delete your own temp when done.',
  'HTML deliverables go to a share you own unless they serve the repo itself.',
  'Boards are forge labels plus milestones plus a generated wiki page.',
  'Live infra, secrets, data, money or an external surface gets the full plan-verify loop.',
]

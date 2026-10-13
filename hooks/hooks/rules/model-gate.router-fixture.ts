// A verbatim copy of the author's mixed-model routing snippet (a Workflow
// prelude): every Workflow carrying the router must pass the Fable gate.
export const ROUTER = `const CLAUDEX_MIXED_ROUTER_V1 = true
const CLAUDEX_WORKER_ROUTES = {
  'gpt-6-luna': {runtime:'codex', model:'gpt-6-luna', efforts:['low','medium','high','xhigh','max']},
  'gpt-6.1-sol': {runtime:'codex', model:'gpt-6.1-sol', efforts:['low','medium','high','xhigh','max']},
  'gpt-6-astra': {runtime:'codex', model:'gpt-6-astra', efforts:['low','medium','high','xhigh','max']},
  'gpt-5.6-terra': {runtime:'codex', model:'gpt-5.6-terra', efforts:['low','medium','high','xhigh','max'], reasonRequired:true},
  sonnet: {runtime:'claude', model:'claude-sonnet-5', efforts:['low','medium','high','xhigh','max'], reasonRequired:true},
  opus: {runtime:'claude', model:'opus', efforts:['low','medium','high','xhigh','max']},
  fable: {runtime:'claude', model:'claude-fable-5', efforts:['low','medium','high','xhigh','max']},
}
const CLAUDEX_ROUTE_ALIASES = {'gpt-5.6-luna': 'gpt-6-luna', 'gpt-5.6-sol': 'gpt-6.1-sol', 'gpt-6-sol': 'gpt-6.1-sol'}
function routeWorkflowWorker(route, task, options = {}) {
  if (!route || typeof route !== 'object' || typeof task !== 'string' || !task.trim()) throw new Error('invalid Claudex workflow route')
  const target = CLAUDEX_WORKER_ROUTES[CLAUDEX_ROUTE_ALIASES[route.model] ?? route.model]
  if (!target || route.runtime !== target.runtime || !target.efforts.includes(route.effort)) throw new Error(\`unsupported Claudex workflow route: \${route.runtime}/\${route.model}/\${route.effort}\`)
  const reason = typeof route.reason === 'string' ? route.reason.trim() : ''
  if (target.reasonRequired && !reason) throw new Error(\`exception route requires a task-specific reason: \${route.model}\`)
  if (!['read-only','write'].includes(route.access)) throw new Error(\`access must be read-only or write: \${route.model}\`)
  const accessInstruction = route.access === 'read-only' ? 'Read-only behavior: do not add --write and do not edit files.' : 'Write-capable behavior is authorized within the task scope.'
  if (target.runtime === 'claude') {
    // Every native Claude worker (Opus, Sonnet 5, Fable 5) is a direct
    // in-harness Workflow subagent on the Claude subscription: explicit model
    // and effort, no agentType, never a Bash companion adapter. Fable stays
    // explicitly selectable but never a default at low, medium, or high effort.
    return {
      prompt: \`\${reason ? \`Routing reason: \${reason}\\n\\n\` : ''}\${accessInstruction}\\n\\n\${task}\`,
      options: {...options, model: target.model, effort: route.effort},
      requestedProvenance: {runtime:target.runtime, model:target.model, effort:route.effort, access:route.access, reason:reason || null, source:'workflow-claude-native', router_version:3},
    }
  }
  // --background, NOT --wait. --wait runs foreground and caps at 600s; it was
  // hardcoded here and killed review lanes mid-analysis at exactly 10 minutes,
  // losing their findings. It succeeds on short prompts, which is why it went
  // unnoticed for as long as it did.
  //
  // PREFER \`claudex sol|terra|luna <effort> -p\` AS A SEPARATE PROCESS for
  // review and coding lanes -- see WORKFLOW-FIRST.md "THE SESSION BINDS THE
  // MODEL". This companion route remains only for cases that genuinely need a
  // Workflow-owned node, and it carries the read-only-sandbox DNS severance and
  // the hook[0]-only enforcement gap documented there.
  //
  // EFFORT \`max\` IS NOT VALID ON THIS ROUTE. The vendored plugin
  // (codex/1.0.6 scripts/codex-companion.mjs:71) allows only
  // none|minimal|low|medium|high|xhigh and raises \`Unsupported reasoning
  // effort "max"\` at line 124. Observed 2026-08-25: 1 of 3 Workflow lanes died
  // on it; the other 2 only survived because --background detached before the
  // validation surfaced. So downgrade max -> xhigh HERE ONLY, and say so in the
  // prompt and in provenance. The separate-process \`claudex luna max -p\` path
  // launches at max and is untouched by this.
  const companionEffort = route.effort === 'max' ? 'xhigh' : route.effort
  const effortNote = companionEffort === route.effort ? ''
    : 'NOTE: effort max is rejected by the codex-rescue plugin; this lane was downgraded to xhigh on the Workflow-node route only.\\n\\n'
  return {
    prompt: \`--model \${target.model} --effort \${companionEffort} --background --fresh\\n\\n\${effortNote}\${reason ? \`Routing reason: \${reason}\\n\\n\` : ''}\${accessInstruction}\\n\\n\${task}\`,
    options: {...options, agentType: 'codex:codex-rescue'},
    requestedProvenance: {runtime:target.runtime, model:target.model, effort:companionEffort, requestedEffort:route.effort, effortDowngraded:companionEffort !== route.effort, access:route.access, reason:reason || null, source:'workflow-codex-companion', router_version:4},
  }
}

// THE SESSION BINDS THE MODEL -- assert it before trusting any route.
//
// \`claudex sol\` points ANTHROPIC_BASE_URL at the proxy and binds the Sonnet
// slot to gpt-6-sol, so every worker in that session is Sol regardless of
// what this router asked for. Measured 2026-07-30: a worker routed
// {runtime:'claude', model:'opus'} answered \`OpenAI|gpt-5.6-sol[1m]\` from a Sol
// session and \`anthropic|claude-opus-5[1m]\` from a native one -- same script,
// same route, and requestedProvenance said \`claude-opus-5\` both times.
//
// Provenance records what was REQUESTED. Nothing verifies what ANSWERED. So a
// cross-family verification run launched from a Sol session is Sol reviewing
// Sol while the record claims Opus verified it.
//
// Call this ONCE at the top of any mixed-model workflow. It fails closed rather
// than silently delivering the wrong family.
function assertNativeClaudeSession() {
  const base = (typeof process !== 'undefined' && process.env && process.env.ANTHROPIC_BASE_URL) || ''
  if (base) {
    // Never echo the URL itself: a proxy URL can carry a credential in its
    // userinfo or query string, and this message lands in logs and UI.
    let host = 'unparseable'
    try { host = new URL(base).hostname } catch (_) { /* leave unparseable */ }
    throw new Error(
      \`Mixed-model workflow launched from a proxied session (ANTHROPIC_BASE_URL is set; host \${host}). \` +
      \`Claude-routed workers would silently resolve to the proxied model and the recorded \` +
      \`provenance would be false. Launch the head from \\\`claudex opus\\\` and run Codex workers \` +
      \`as separate \\\`claudex sol|terra|luna <effort> -p\\\` processes. \` +
      \`See WORKFLOW-FIRST.md "THE SESSION BINDS THE MODEL".\`
    )
  }
}
`

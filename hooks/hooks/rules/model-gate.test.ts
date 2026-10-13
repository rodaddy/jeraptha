import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'
import { PRINT_DENY, FABLE_DENY } from './model-gate.ts'
import { ROUTER } from './model-gate.router-fixture.ts'

// Loads the mod folder as a session does: the rule must be wired in
// hooks/register.ts. A hooks module has no `process`; the rule reads
// DEV_RULES_ALLOW_FABLE through $.env, so each test answers `env.get` itself
// and no real environment is touched.
const ran = { result: { stdout: 'ran', stderr: '', interrupted: false } }
const DEV = '/work/dev/my-repo'
const META = "export const meta = { name: 'x', description: 'x' }\n"

/** Session in Development, with DEV_RULES_ALLOW_FABLE set to `fable`. */
function session(on: On, fable: string | undefined) {
  on('session.cwd', () => ({ value: DEV }))
  on('env.get', () => ({ value: fable }))
}

for (const command of [
  'claude -p "x"',
  'claude --print x',
  '/opt/homebrew/bin/claude -p x',
  'claude -cp x',
  "claudex sol high -p 'x' < /dev/null",
  "bash -c 'claude -p x'",
]) {
  test(`denies: ${command}`, async ($, on) => {
    session(on, undefined)
    on('tool.call', { tool: 'Bash' }, () => ran)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toContain('claude -p is never run')
  })
}

for (const command of [
  'claude plugin test',
  'claude plugin validate',
  'claude --version',
  'claude mcp list',
  'echo "claude -p"',
  "rg 'claude -p' _DOCS",
  "cat > notes.md <<'EOF'\nclaude -p x\nEOF",
  'claude -- -p',
]) {
  test(`allows: ${command}`, async ($, on) => {
    session(on, undefined)
    on('tool.call', { tool: 'Bash' }, () => ran)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toBeUndefined()
  })
}

test('leaves sessions outside Development alone', async ($, on) => {
  on('session.cwd', () => ({ value: '/Users/me/elsewhere' }))
  on('tool.call', { tool: 'Bash' }, () => ran)
  const r = await $.tool.call({ tool: 'Bash', command: 'claude -p x' })
  expect(r.deny).toBeUndefined()
})

const FABLE_SCRIPTS = [
  META + "await agent('x', { model: 'fable', effort: 'high' })\n",
  META + 'await agent("x", { model: "claude-fable-5", effort: "high" })\n',
]
const OPUS_SCRIPT = META + "await agent('x', { model: 'opus', effort: 'low' })\n"

for (const script of FABLE_SCRIPTS) {
  const label = script.split('\n')[1]
  test(`denies a Fable Workflow: ${label}`, async ($, on) => {
    session(on, undefined)
    on('tool.call', { tool: 'Workflow' }, () => ran)
    const r = await $.tool.call({ tool: 'Workflow', script } as never)
    expect(r.deny).toContain('Fable runs only when Rico selects it')
  })

  test(`allows a Fable Workflow when Rico enabled it: ${label}`, async ($, on) => {
    session(on, '1')
    on('tool.call', { tool: 'Workflow' }, () => ran)
    const r = await $.tool.call({ tool: 'Workflow', script } as never)
    expect(r.deny).toBeUndefined()
  })
}

test('denies a Fable Workflow when the variable is not exactly 1', async ($, on) => {
  session(on, 'yes')
  on('tool.call', { tool: 'Workflow' }, () => ran)
  const r = await $.tool.call({ tool: 'Workflow', script: FABLE_SCRIPTS[0] } as never)
  expect(r.deny).toContain('Fable runs only when Rico selects it')
})

test('denies a Fable scriptPath file beside an opus script', async ($, on) => {
  session(on, undefined)
  on('fs.read', () => ({ value: FABLE_SCRIPTS[0] }))
  on('tool.call', { tool: 'Workflow' }, () => ran)
  const r = await $.tool.call({ tool: 'Workflow', script: OPUS_SCRIPT, scriptPath: '/r/wf.js' } as never)
  expect(r.deny).toContain('Fable runs only when Rico selects it')
})

test('allows an unreadable scriptPath', async ($, on) => {
  session(on, undefined)
  on('fs.read', () => {
    throw new Error('ENOENT')
  })
  on('tool.call', { tool: 'Workflow' }, () => ran)
  const r = await $.tool.call({ tool: 'Workflow', scriptPath: '/r/missing.js' } as never)
  expect(r.deny).toBeUndefined()
})

test('allows an opus Workflow', async ($, on) => {
  session(on, undefined)
  on('tool.call', { tool: 'Workflow' }, () => ran)
  const r = await $.tool.call({ tool: 'Workflow', script: OPUS_SCRIPT } as never)
  expect(r.deny).toBeUndefined()
})

// the gate judges what an agent() or router call asks for,
// not a `model:` word anywhere in the script (the router's route table).
const CODEX_JOB =
  "const r = routeWorkflowWorker({runtime:'codex', model:'gpt-5.6-sol', effort:'high', access:'read-only'}, 'x')\n" +
  "await agent(r.prompt, r.options)\n"
const ROUTED = [
  ['allows', 'the router plus a Codex route', META + ROUTER + CODEX_JOB],
  ['denies', 'the router plus agent() pinning Fable', META + ROUTER + "await agent(p, {model: 'claude-fable-5'})\n"],
  [
    'denies',
    'the router plus a Fable route',
    META + ROUTER + "routeWorkflowWorker({runtime:'claude', model:'fable', effort:'high', access:'read-only'}, 'x')\n",
  ],
  ['allows', 'a plain opus agent()', META + "await agent(p, {model:'opus'})\n"],
  ['allows', 'a paren in the prompt', META + "await agent('a (b', {model:'opus'})\nconst t = {model:'fable'}\n"],
] as const

for (const [verdict, label, script] of ROUTED) {
  test(`${verdict}: ${label}`, async ($, on) => {
    session(on, undefined)
    on('tool.call', { tool: 'Workflow' }, () => ran)
    const r = await $.tool.call({ tool: 'Workflow', script } as never)
    if (verdict === 'denies') expect(r.deny).toBe(FABLE_DENY)
    else expect(r.deny).toBeUndefined()
  })
}

test('denies an Agent call with model fable', async ($, on) => {
  session(on, undefined)
  on('tool.call', { tool: 'Agent' }, () => ran)
  const r = await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'x', model: 'fable' } as never)
  expect(r.deny).toContain('Fable runs only when Rico selects it')
})

test('allows an Agent call with model fable when Rico enabled it', async ($, on) => {
  session(on, '1')
  on('tool.call', { tool: 'Agent' }, () => ran)
  const r = await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'x', model: 'fable' } as never)
  expect(r.deny).toBeUndefined()
})

test('allows an Agent call with model opus', async ($, on) => {
  session(on, undefined)
  on('tool.call', { tool: 'Agent' }, () => ran)
  const r = await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'x', model: 'opus' } as never)
  expect(r.deny).toBeUndefined()
})

// Round-1 review: threat-model properties held by tests.

test('DEV_RULES_ALLOW_FABLE=1 does not lift the claude -p deny', async ($, on) => {
  session(on, '1')
  on('tool.call', { tool: 'Bash' }, () => ran)
  const r = await $.tool.call({ tool: 'Bash', command: 'claude -p x' })
  expect(r.deny).toBe(PRINT_DENY)
})

/** Session at `cwd`, with DEV_RULES_ALLOW_FABLE unset. */
function at(on: On, cwd: string) {
  on('session.cwd', () => ({ value: cwd }))
  on('env.get', () => ({ value: undefined }))
}

const OUTSIDE = ['/Users/me/elsewhere', '/work/dev2', '/work/_tmpx']
const INSIDE = ['/work/dev', '/work/_tmp/_worktrees/claude/x']

for (const cwd of OUTSIDE) {
  test(`scope: allows claude -p from ${cwd}`, async ($, on) => {
    at(on, cwd)
    on('tool.call', { tool: 'Bash' }, () => ran)
    const r = await $.tool.call({ tool: 'Bash', command: 'claude -p x' })
    expect(r.deny).toBeUndefined()
  })

  test(`scope: allows a Fable Workflow from ${cwd}`, async ($, on) => {
    at(on, cwd)
    on('tool.call', { tool: 'Workflow' }, () => ran)
    const r = await $.tool.call({ tool: 'Workflow', script: FABLE_SCRIPTS[0] } as never)
    expect(r.deny).toBeUndefined()
  })

  test(`scope: allows a Fable Agent from ${cwd}`, async ($, on) => {
    at(on, cwd)
    on('tool.call', { tool: 'Agent' }, () => ran)
    const r = await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'x', model: 'fable' } as never)
    expect(r.deny).toBeUndefined()
  })
}

for (const cwd of INSIDE) {
  test(`scope: denies claude -p from ${cwd}`, async ($, on) => {
    at(on, cwd)
    on('tool.call', { tool: 'Bash' }, () => ran)
    const r = await $.tool.call({ tool: 'Bash', command: 'claude -p x' })
    expect(r.deny).toBe(PRINT_DENY)
  })

  test(`scope: denies a Fable Workflow from ${cwd}`, async ($, on) => {
    at(on, cwd)
    on('tool.call', { tool: 'Workflow' }, () => ran)
    const r = await $.tool.call({ tool: 'Workflow', script: FABLE_SCRIPTS[0] } as never)
    expect(r.deny).toBe(FABLE_DENY)
  })

  test(`scope: denies a Fable Agent from ${cwd}`, async ($, on) => {
    at(on, cwd)
    on('tool.call', { tool: 'Agent' }, () => ran)
    const r = await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'x', model: 'fable' } as never)
    expect(r.deny).toBe(FABLE_DENY)
  })
}

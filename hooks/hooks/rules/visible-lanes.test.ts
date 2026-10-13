import { test, expect } from 'claude-code/testing'

// Loads the mod folder as a session does: the rule must be wired in
// hooks/register.ts. An inline { plugins } register cannot import the rule
// (it closes over nothing and dynamic import() is refused).
const ran = { result: { stdout: 'ran', stderr: '', interrupted: false } }
const META = "export const meta = { name: 'x', description: 'x', phases: [] }\n"
const DEV = '/work/dev/jeraptha/hooks'

// The test's own hooks stand for the engine: a watched session in Development.
function watched(on: any, surfaces: string[] = ['terminal'], cwd = DEV) {
  on('session.surfaces', () => ({ value: surfaces }))
  on('session.cwd', () => ({ value: cwd }))
  // model-gate reads DEV_RULES_ALLOW_FABLE on every Workflow call.
  on('env.get', () => ({ value: undefined }))
  on('tool.call', { tool: 'Workflow' }, () => ran)
  on('tool.call', { tool: 'Bash' }, () => ran)
}

const TWO = META + "await agent('a', { model: 'opus' })\nawait agent('b', { model: 'opus' })\n"
const ONE = META + "await agent('a', { model: 'opus' })\n"

test('denies a Workflow with two agent( calls', async ($, on) => {
  watched(on)
  const r = await $.tool.call({ tool: 'Workflow', script: TWO } as never)
  expect(r.deny).toContain('one lane per Workflow call')
})

test('denies two agent calls inside parallel()', async ($, on) => {
  watched(on)
  const script = META + 'await parallel([() => agent("a"), () => agent ("b")])\n'
  const r = await $.tool.call({ tool: 'Workflow', script } as never)
  expect(r.deny).toContain('at most 6 at once')
})

test('denies a scriptPath file with two agent( calls', async ($, on) => {
  watched(on)
  on('fs.read', () => ({ value: TWO }))
  const r = await $.tool.call({ tool: 'Workflow', scriptPath: '/r/wf.js' } as never)
  expect(r.deny).toContain('one lane per Workflow call')
})

// PR 911 review (SOF-4186): one call site that runs N times is N lanes.
for (const [label, script] of [
  ['one agent( mapped inside parallel()', META + "await parallel(['a','b','c'].map(x => () => agent(x)))\n"],
  ['one agent( in a for loop', META + "for (const x of ['a','b']) await agent(x)\n"],
  ['one agent( in a while block', META + 'let i = 0\nwhile (i++ < 3) {\n  await agent(String(i))\n}\n'],
  ['one agent( in forEach', META + "['a','b'].forEach(x => agent(x))\n"],
  ['one agent( inside pipeline()', META + 'await pipeline([1, 2], x => agent(String(x)))\n'],
  // D1.3/8 carried (Adams 8baf8ff P2): a comment before `(` beside comment-like strings.
  ['agent/**/( twice beside a URL string', META + "await agent/**/('a'); const u = 'http://x'; await agent/**/('b')\n"],
  ['agent/**/( twice after a /* string', META + "const s = '/*'\nawait agent/**/('a')\nawait agent/**/('b')\n"],
] as const) {
  test(`denies a Workflow with ${label}`, async ($, on) => {
    watched(on)
    const r = await $.tool.call({ tool: 'Workflow', script } as never)
    expect(r.deny).toContain('one lane per Workflow call')
  })
}

for (const [label, script] of [
  ['one agent( call', ONE],
  // PR 911 review (SOF-4186): comments and strings are not calls.
  ['agent( only in a comment', META + "// agent('previous-worker')\nawait agent('only-worker')\n"],
  [
    'agent( in a block comment, string and template',
    META + "/* agent('a') */\nconst s = \"agent('b')\"\nconst t = `run agent('c') ${'x'}`\nawait agent('d')\n",
  ],
  ['one agent( after a finished loop', META + "for (const x of ['a']) log(x)\nawait agent('only')\n"],
  ['look-alikes: subagent( and x.agent(', META + "subagent('a')\nlib.agent('b')\nawait agent('c')\n"],
  ['no agent at all', META + 'phase("x")\n'],
  // D1.3/8 carried (920 ec6217c P1): the word agent in prompt text is not a call.
  ['the word agent in its prompt', META + "await agent('Role: agent for the build; agent reviewer next', { model: 'opus' })\n"],
  // D1.3/8 carried (Adams 8baf8ff): prose and comment markers inside a prompt.
  ['parens and async in its prompt', META + "await agent('Do the async work (lanes 1-3) first, then report.', { model: 'opus' })\n"],
  ['// inside its prompt', META + "await agent('Role: agent // reviewer')\n"],
] as const) {
  test(`allows a Workflow with ${label}`, async ($, on) => {
    watched(on)
    const r = await $.tool.call({ tool: 'Workflow', script } as never)
    expect(r.deny).toBeUndefined()
  })
}

test('allows a multi-agent Workflow when headless', async ($, on) => {
  watched(on, [])
  const r = await $.tool.call({ tool: 'Workflow', script: TWO } as never)
  expect(r.deny).toBeUndefined()
})

test('allows a multi-agent Workflow outside Development', async ($, on) => {
  watched(on, ['terminal'], '/Users/me/elsewhere')
  const r = await $.tool.call({ tool: 'Workflow', script: TWO } as never)
  expect(r.deny).toBeUndefined()
})

test('allows a named Workflow (text not readable)', async ($, on) => {
  watched(on)
  const r = await $.tool.call({ tool: 'Workflow', name: 'default-task' } as never)
  expect(r.deny).toBeUndefined()
})

for (const command of [
  "codex exec 'fix it' &",
  "pi --print 'task' &",
  "nohup /opt/homebrew/bin/codex exec x &",
  "cd /r && pi --print x &",
  // PR 911 review (SOF-4186): `&` backgrounds its own command, not only at line end.
  'codex exec x & wait',
  "nohup codex exec 'x' > log 2>&1 & echo $!",
  "codex exec 'x' > log 2>&1 & disown",
  "(codex exec 'x' > log &)",
  "(codex exec 'x' > log) &",
  "codex e 'fix it' &",
]) {
  test(`denies backgrounded: ${command}`, async ($, on) => {
    watched(on)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toContain('hidden background agent')
  })
}

// model-gate denies every claude -p in Development (Rico ruling 2026-10-05),
// so a backgrounded one is denied whichever rule answers first.
for (const command of [
  "claude -p 'do x' > log.txt &",
  "claudex sol high -p 'review' < /dev/null > out &",
  "(claude -p 'x' > log) &",
]) {
  test(`denies backgrounded: ${command}`, async ($, on) => {
    watched(on)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toBeDefined()
  })
}

test('denies codex exec with run_in_background: true', async ($, on) => {
  watched(on)
  const r = await $.tool.call({ tool: 'Bash', command: "codex exec 'x'", run_in_background: true })
  expect(r.deny).toContain('run it as a Workflow lane')
})

for (const command of [
  "codex exec 'x'",
  "pi --print 'review' < /dev/null",
  'codex exec x && echo done',
  'claude --resume abc &',
  'npm run dev &',
  "echo 'claude -p x' &",
  "rg -n 'codex exec' /r &",
  'codex exec x; npm run dev &',
  'codex exec x > log 2>&1',
  'codex exec x &> log',
  "echo 'a & b' && codex exec x",
  // D1.3/8 carried (920 ec6217c P1): background words in a foreground prompt.
  "codex exec 'run it in the background & then nohup report' < /dev/null",
  'pi --print "spawn x & disown it, setsid y" > out.txt',
  "codex exec - <<'EOF'\nstart the server &\nEOF",
]) {
  test(`allows: ${command}`, async ($, on) => {
    watched(on)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toBeUndefined()
  })
}

test('allows backgrounded codex exec when headless', async ($, on) => {
  watched(on, [])
  const r = await $.tool.call({ tool: 'Bash', command: 'codex exec x &' })
  expect(r.deny).toBeUndefined()
})

test('allows backgrounded claude -p outside Development', async ($, on) => {
  watched(on, ['terminal'], '/Users/me/elsewhere')
  const r = await $.tool.call({ tool: 'Bash', command: 'claude -p x &' })
  expect(r.deny).toBeUndefined()
})

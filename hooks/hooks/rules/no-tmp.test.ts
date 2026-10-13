import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'

// Loads the mod folder as a session does: the rule must be wired in
// hooks/register.ts (an inline { plugins } register cannot import it).
const ran = { result: { stdout: 'ran', stderr: '', interrupted: false } }
const DEV = '/work/dev/my-repo'

// The test's own hooks stand for the engine: the session cwd, its env, and a
// file system where `links` maps a path to where it really lands (null: a
// link that leads nowhere, which stats with no realPath).
function world(on: On, cwd = DEV, links: Record<string, string | null> = {}, env: Record<string, string> = {}) {
  on('session.cwd', () => ({ value: cwd }))
  on('env.get', (_$, e) => ({ value: env[e.name] }) as never)
  on('fs.stat', (_$, e) => {
    const real = links[e.path]
    if (real === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    if (real === null) return { value: { kind: 'other', size: 0, mtimeMs: 0, isLink: true } }
    return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: true, realPath: real } }
  })
  for (const tool of ['Bash', 'Write', 'Edit', 'NotebookEdit']) on('tool.call', { tool }, () => ran)
}

// A cwd that is a link into /tmp: every relative word a reader mistakes for a
// write target lands under /tmp and denies, so an allow test here fails when
// the branch that skips that word is deleted.
const LINKED = '/work/_tmp/p/r'
const linkedWorld = (on: On) => world(on, LINKED, { [LINKED]: '/private/tmp/r' })

for (const command of [
  'echo hi > /tmp/x',
  'echo hi >> /private/tmp/x.log',
  'echo hi &> /tmp/out',
  'make 2>/tmp/err',
  'echo hi >| /tmp/x',
  'echo hi > "/tmp/a b"',
  'cmd > /tmp/$NAME.log',
  'echo hi > $TMPDIR/x',
  'echo hi > ${TMPDIR}/x',
  'echo hi > /private/var/folders/ab/T/x',
  'echo hi > /work/_tmp/../../../tmp/x',
  'ls | tee /tmp/ls.txt',
  'ls | tee -a out.txt /tmp/ls.txt',
  'cp a.txt /tmp/',
  'mv -f a.txt b.txt /private/tmp/dir',
  'cp -t /tmp/dir a.txt',
  'install -m 755 bin/x /tmp/x',
  'install -d /tmp/newdir',
  'cd /tmp && echo hi > f.txt',
  "bash -lc 'echo hi > /tmp/x'",
  'sudo tee /tmp/x',
  // Carried from the 913 reviews (D1.3/5,.
  'echo "$(echo \')\' > /tmp/x)"',
  'x="$(echo \'a"b\')"; echo hi > /tmp/x',
  'echo "`echo hi > /tmp/x`"',
  "echo \"$(cat <<'EOF'\ndon't\nEOF\n)\"; echo hi > /tmp/x",
  'cp a.txt /tmp/x <in',
  'cp a.txt /tmp/x < in',
  'mv a.txt /tmp/x <<<word',
  'install a.txt /tmp/x 0<in',
  'cp a.txt /tmp/x > cp.log',
  'cd -P /tmp && echo hi > f.txt',
  'cd -L /tmp && echo hi > f.txt',
  'cd -- /tmp && echo hi > f.txt',
  'pushd /tmp && echo hi > f.txt',
  "bash -c -- 'echo hi > /tmp/x'",
  "bash -c -- 'cp a.txt /tmp/'",
  'watch "echo hi > /tmp/x"',
  'watch -n 2 "date > /tmp/x"',
  'cp a.txt /{tmp,x}/y',
  'tee /t{m,}p/x',
]) {
  test(`denies Bash: ${command}`, async ($, on) => {
    world(on)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toContain('/work/_tmp/<project>/<repo>/')
  })
}

test('denies a redirect into a link that lands under /tmp', async ($, on) => {
  world(on, DEV, { '/work/_tmp/link': '/private/tmp/real' })
  const r = await $.tool.call({ tool: 'Bash', command: 'echo hi > /work/_tmp/link/x' })
  expect(r.deny).toContain('/tmp is denied')
})

test('denies a redirect to a link that leads nowhere (ln -s /tmp/new.txt out.txt)', async ($, on) => {
  world(on, DEV, { [`${DEV}/out.txt`]: null })
  const r = await $.tool.call({ tool: 'Bash', command: 'echo hi > out.txt' })
  expect(r.deny).toContain('leads nowhere')
})

test('denies a Write to a link that leads nowhere', async ($, on) => {
  world(on, DEV, { [`${DEV}/out.txt`]: null })
  const r = await $.tool.call({ tool: 'Write', file_path: `${DEV}/out.txt`, content: 'x' } as never)
  expect(r.deny).toContain('leads nowhere')
})

test('denies a ~ target that lands under /tmp', async ($, on) => {
  world(on, DEV, {}, { HOME: '/Users/me' })
  const r = await $.tool.call({ tool: 'Bash', command: 'echo hi > ~/../../tmp/x' })
  expect(r.deny).toContain('/tmp is denied')
})

test('allows a ~ target under HOME', async ($, on) => {
  world(on, DEV, {}, { HOME: '/Users/me' })
  const r = await $.tool.call({ tool: 'Bash', command: 'echo hi > ~/notes.txt' })
  expect(r.deny).toBeUndefined()
})

test('denies a relative redirect when the cwd is a link into /tmp', async ($, on) => {
  world(on, '/work/_tmp/p/r', { '/work/_tmp/p/r': '/private/tmp/r' })
  const r = await $.tool.call({ tool: 'Bash', command: 'echo hi > out.txt' })
  expect(r.deny).toContain('/tmp is denied')
})

for (const command of [
  'cat /tmp/x',
  'rg -n foo /tmp/log /private/tmp/y',
  'cp /tmp/x ./x',
  'mv /tmp/x /work/_tmp/dev/repo/x',
  'echo "> /tmp/x"',
  "rg '>' /tmp/x",
  'make 2>&1 | tee build.log',
  'echo hi >&2',
  'diff <(sort a) <(sort b) > /work/_tmp/d/r/diff.txt',
  'echo hi > /tmpfoo/x',
  'echo hi > /work/_tmp/dev/repo/x',
  'tee --help',
  'cp a.txt b.txt < in',
  "echo \"$(cat <<'EOF'\ndon't > /tmp/x\nEOF\n)\"",
]) {
  test(`allows Bash: ${command}`, async ($, on) => {
    world(on)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toBeUndefined()
  })
}

// No write target in these: run where any misread word would deny.
for (const command of [
  'tee --help',
  'echo hi >&2',
  'echo hi > "$((1 > 0))"',
  'echo $((1 > 0))',
  'echo hi > /work/dev/x',
]) {
  test(`allows Bash from a cwd linked into /tmp: ${command}`, async ($, on) => {
    linkedWorld(on)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toBeUndefined()
  })
}

// A heredoc body is data round 12): never a command, never a redirect.
for (const command of [
  "cat > docs/example.md <<'EOF'\necho hi > /tmp/example\nEOF",
  'cat > docs/example.md <<EOF\necho hi > /tmp/example\ntee /tmp/y\nEOF',
  'cat > docs/example.md <<"EOF"\ncp a /tmp/\nEOF\necho done',
  'cat > docs/example.md <<-EOF\n\techo hi > /tmp/example\n\tEOF',
  "git commit -m \"$(cat <<'EOF'\nfix: no more echo > /tmp/x\nEOF\n)\"",
  "cat > a.md <<'A' > b.md <<'B'\n> /tmp/a\nA\n> /tmp/b\nB",
]) {
  test(`allows a heredoc body: ${JSON.stringify(command)}`, async ($, on) => {
    world(on)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toBeUndefined()
  })
}

// The header keeps its own redirects and commands, and the line after the terminator is shell again.
for (const command of [
  'cat > /tmp/x <<EOF\nhello\nEOF',
  "tee /tmp/x <<'EOF'\nhello\nEOF",
  'cat <<EOF > /private/tmp/x\nhello\nEOF',
  "cat > a.md <<'EOF'\nhello\nEOF\necho hi > /tmp/x",
  'cat <<<word > /tmp/x\necho next',
  'echo $((1<<2))\necho hi > /tmp/x',
  '# a <<EOF comment\necho hi > /tmp/x',
  'echo "<<EOF"\necho hi > /tmp/x',
  // A `<<` with no terminator line is not a heredoc to the shell reader (hooks/lib/shell.ts): read as commands.
  "cat > docs/example.md <<'EOF'\nnever terminated > /tmp/x",
]) {
  test(`denies a heredoc header or what follows it: ${JSON.stringify(command)}`, async ($, on) => {
    world(on)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toContain('/tmp is denied')
  })
}

test('allows a /tmp write outside the Development and _tmp scope', async ($, on) => {
  world(on, '/Users/me/elsewhere')
  const r = await $.tool.call({ tool: 'Bash', command: 'echo hi > /tmp/x' })
  expect(r.deny).toBeUndefined()
})

for (const [tool, input] of [
  ['Write', { file_path: '/tmp/x.txt', content: 'x' }],
  ['Write', { file_path: '/private/tmp/claude-501/scratch/x.md', content: 'x' }],
  ['Write', { file_path: '/private/var/folders/ab/T/x', content: 'x' }],
  ['Edit', { file_path: '/tmp/x.ts', old_string: 'a', new_string: 'b' }],
  ['NotebookEdit', { notebook_path: '/tmp/n.ipynb', new_source: 'x' }],
] as const) {
  test(`denies ${tool}: ${Object.values(input)[0]}`, async ($, on) => {
    world(on)
    const r = await $.tool.call({ tool, ...input } as never)
    expect(r.deny).toContain('/work/_tmp/<project>/<repo>/')
  })
}

test('denies a Write through a folder link that lands under /tmp', async ($, on) => {
  world(on, DEV, { '/work/_tmp/link': '/private/tmp/real' })
  const r = await $.tool.call({ tool: 'Write', file_path: '/work/_tmp/link/new/x.md', content: 'x' } as never)
  expect(r.deny).toContain('/tmp is denied')
})

for (const file_path of ['/work/_tmp/dev/repo/x.md', '/tmpish/x', `${DEV}/src/x.ts`]) {
  test(`allows Write: ${file_path}`, async ($, on) => {
    world(on)
    const r = await $.tool.call({ tool: 'Write', file_path, content: 'x' } as never)
    expect(r.deny).toBeUndefined()
  })
}

test('allows a Write to /tmp outside the scope', async ($, on) => {
  world(on, '/Users/me/elsewhere')
  const r = await $.tool.call({ tool: 'Write', file_path: '/tmp/x', content: 'x' } as never)
  expect(r.deny).toBeUndefined()
})

// Development sets TMPDIR under _tmp (.claude/settings.local.json); tools may use it.
for (const command of ['echo hi > $TMPDIR/x', 'echo hi > ${TMPDIR}/x']) {
  test(`allows the session's own TMPDIR under _tmp: ${command}`, async ($, on) => {
    world(on, DEV, {}, { TMPDIR: '/work/_tmp/Development/_scratch' })
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toBeUndefined()
  })
}

// Three gaps (D3.1): mktemp with no folder, a cd into /tmp, and TMPDIR pointed at /tmp.
for (const command of [
  'mktemp',
  'mktemp -d',
  'mktemp -t x',
  'mktemp -dt x.XXXXXX',
  'mktemp --tmpdir',
  'mktemp -p /tmp',
  'mktemp -dp /private/tmp',
  'mktemp -p/tmp x.XXXXXX',
  'mktemp --tmpdir=/tmp',
  'X=$(mktemp -d) && echo hi > $X/f',
  "bash -c 'mktemp -d'",
  'cd /tmp',
  'cd /tmp && touch a',
  'pushd /private/tmp',
  'cd -P /tmp/x',
  'TMPDIR=/tmp node x.js',
  'TMPDIR="/tmp" node x.js',
  'env TMPDIR=/tmp node x.js',
  'export TMPDIR=/tmp',
  'export A=1 TMPDIR=/private/tmp/x',
  'declare -x TMPDIR=/tmp',
  'TMPDIR=/tmp',
]) {
  test(`denies Bash (D3.1): ${command}`, async ($, on) => {
    world(on)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toContain('/work/_tmp/<project>/<repo>/')
  })
}

for (const command of [
  'mktemp -p /work/_tmp/dev/repo',
  'mktemp -dp /work/_tmp/dev/repo x.XXXXXX',
  'mktemp --tmpdir=/work/_tmp/dev/repo',
  'mktemp /work/_tmp/dev/repo/x.XXXXXX',
  'mktemp -d x.XXXXXX',
  'echo mktemp',
  'mktemp --help',
  'cd /work/_tmp/dev/repo',
  'cd /tmpfoo',
  'cd',
  'ls /tmp',
  'TMPDIR=/work/_tmp/dev/repo node x.js',
  'export TMPDIR=/work/_tmp/dev/repo',
  'export PATH=/tmp/bin:$PATH',
  'echo TMPDIR=/tmp',
  "echo 'export TMPDIR=/tmp'",
  'MYTMPDIR=/tmp node x.js',
]) {
  test(`allows Bash (D3.1): ${command}`, async ($, on) => {
    world(on)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toBeUndefined()
  })
}

import { test, expect } from 'claude-code/testing'
import { PR_BAR_DENY } from './pr-bar.ts'

// Loads the mod folder as a session does: the rule must be wired in
// hooks/register.ts.
const ran = { result: { stdout: 'ran', stderr: '', interrupted: false } }
const DEV = '/work/dev/my-repo'
const PULLS = 'https://git.example.internal/api/v1/repos/a/b/pulls'

for (const command of [
  `curl -X POST ${PULLS}`,
  `curl -sS --request POST "${PULLS}" -d @body.json`,
  `curl -s ${PULLS} --data-binary @body.json`,
  `curl --json @body.json ${PULLS}/`,
  `curl -XPOST ${PULLS}`,
  'tea pr create --title x',
  'tea pulls create --repo a/b',
  `bash -c 'curl -X POST ${PULLS}'`,
  // AGit: Forgejo opens a PR from a push to refs/for/<base>.
  'git push origin HEAD:refs/for/main',
  'git -C /x push origin HEAD:refs/for/main/topic',
  'git push origin refs/for/main',
  'git push -o title=x origin HEAD:main',
  'git push --push-option=description=y origin HEAD',
  'git push --push-option title=x origin HEAD',
  // RF2 F2: AGit through git config, on the line or persisted by git config.
  'git -c remote.origin.push=HEAD:refs/for/main push origin',
  'git -cremote.origin.push=refs/heads/x:refs/for/main push',
  'git -c push.pushOption=title=x push origin HEAD:main',
  'git -cpush.pushoption=description=y push origin HEAD',
  'git config remote.origin.push HEAD:refs/for/main',
  'git config --local --add remote.origin.push HEAD:refs/for/main',
  'git config set --global push.pushOption title=x',
  'git config --add push.pushOption description=y',
]) {
  test(`denies: ${command}`, async ($, on) => {
    on('session.cwd', () => ({ value: DEV }))
    on('tool.call', { tool: 'Bash' }, () => ran)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toBe(PR_BAR_DENY)
  })
}

for (const command of [
  `curl -X POST ${PULLS}/5/merge -d '{"Do":"merge"}'`,
  `curl -X POST ${PULLS}/5/reviews -d @r.json`,
  `curl -s ${PULLS}`,
  `curl -s "${PULLS}?state=open"`,
  `curl -X GET ${PULLS} -d state=open`,
  `curl -G ${PULLS} -d state=open`,
]) {
  // forge-api refuses these raw Forge API calls; pr-bar must not.
  test(`allows: ${command}`, async ($, on) => {
    on('session.cwd', () => ({ value: DEV }))
    on('tool.call', { tool: 'Bash' }, () => ran)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).not.toBe(PR_BAR_DENY)
  })
}

for (const command of [
  'tea pr list',
  'tea pr checkout 5',
  "echo 'tea pr create'",
  'bin/forge-pr-open --repo a/b --head h --title t --body-file b.md',
  'git push -u origin feat/x',
  'git push -o ci.skip origin HEAD',
  'git log refs/for/main',
  'git -c user.name=x push origin HEAD',
  'git config --add push.pushOption ci.skip',
  'git config --get remote.origin.push',
]) {
  test(`allows: ${command}`, async ($, on) => {
    on('session.cwd', () => ({ value: DEV }))
    on('tool.call', { tool: 'Bash' }, () => ran)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toBeUndefined()
  })
}

for (const cwd of ['/Users/me/elsewhere', '/work/dev2']) {
  test(`scope: allows a raw PR open from ${cwd}`, async ($, on) => {
    on('session.cwd', () => ({ value: cwd }))
    on('tool.call', { tool: 'Bash' }, () => ran)
    const r = await $.tool.call({ tool: 'Bash', command: `curl -X POST ${PULLS}` })
    expect(r.deny).toBeUndefined()
  })
}

test('scope: denies from a worktree under _tmp', async ($, on) => {
  on('session.cwd', () => ({ value: '/work/_tmp/_worktrees/claude/x' }))
  on('tool.call', { tool: 'Bash' }, () => ran)
  const r = await $.tool.call({ tool: 'Bash', command: 'tea pr create' })
  expect(r.deny).toBe(PR_BAR_DENY)
})

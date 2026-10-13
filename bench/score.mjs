// Score benchmark runs against fixed, hidden acceptance checks.
// Usage: node score.mjs <run-dir> [<run-dir> ...]   (run dir = a worktree
// named bench-<tag>-<task>-<setting> by setup.zsh, or any worktree plus
// --task <t>)
// Environment: BENCH_BASE (the frozen start commit, required);
//   BENCH_TASK_FILE (default ./tasks.mjs beside this script).
// Prints one TSV line per run:
//   run  task  pass  checks  committed  files  out_of_scope  detail
import { spawnSync } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// Every task replays from this commit; out-of-scope and committed are judged
// against it.
const BASE = process.env.BENCH_BASE;
if (!BASE) { console.error('score.mjs: set BENCH_BASE to the frozen start commit'); process.exit(3); }

export const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 120000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

// tasks.mjs exports TASKS: { <id>: { scope: RegExp[], checks: (dir, run) => [name, ok, detail][] } }.
// Hidden checks live there (and in hidden/ beside it), never in the brief.
const taskFile = resolve(process.env.BENCH_TASK_FILE ?? join(HERE, 'tasks.mjs'));
const { TASKS } = await import(pathToFileURL(taskFile).href);
const ids = Object.keys(TASKS).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const dir = args[i];
  let task = (basename(dir).match(new RegExp(`(?:^|-)(${ids})-[^-]+$`)) || [])[1];
  if (args[i + 1] === '--task') { task = args[i + 2]; i += 2; }
  const spec = TASKS[task];
  if (!spec) { console.log(`${basename(dir)}\t?\tERROR no task`); continue; }
  const changed = new Set([
    ...run('git', ['diff', '--name-only', BASE], dir).out.split('\n'),
    ...run('git', ['ls-files', '--others', '--exclude-standard'], dir).out.split('\n'),
  ].filter((f) => f && !f.includes('node_modules')));
  const outScope = [...changed].filter((f) => !spec.scope.some((re) => re.test(f)));
  const committed = run('git', ['rev-parse', 'HEAD'], dir).out.trim().slice(0, 8) !== run('git', ['rev-parse', BASE], dir).out.trim().slice(0, 8);
  let results;
  try { results = spec.checks(dir, run); } catch (e) { results = [['checks ran', false, String(e.message).slice(0, 80)]]; }
  const pass = results.every((r) => r[1]);
  const detail = results.map((r) => `${r[1] ? 'ok' : 'FAIL'} ${r[0]}${r[2] ? ' (' + r[2] + ')' : ''}`).join('; ');
  console.log([basename(dir), task, pass ? 'PASS' : 'FAIL', `${results.filter((r) => r[1]).length}/${results.length}`, committed ? 'yes' : 'no', changed.size, outScope.length + (outScope.length ? ' ' + outScope.join(',') : ''), detail].join('\t'));
}

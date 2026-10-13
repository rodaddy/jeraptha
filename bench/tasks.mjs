// Hidden acceptance checks, one entry per task id. The worker never sees this
// file: setup.zsh hands it only tasks/<id>.md. Replace the example with your
// own finished tasks (see README, "Adding a task").
//
// scope:  files the task may touch; anything else is reported out_of_scope.
// checks: (worktree, run) => [[name, ok, detail], ...]; run(cmd, args, cwd)
//         returns { code, out }.
export const TASKS = {
  example: {
    scope: [/^docs\//],
    checks: (d, run) => {
      // A docs task: the dead phrase is gone from every file under docs/.
      const r = run('rg', ['-c', 'old phrase', 'docs'], d);
      return [['dead text gone', r.code === 1, r.out.trim().replace(/\n/g, ' ')]];
    },
  },
};

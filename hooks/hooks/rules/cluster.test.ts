import { test, expect } from 'claude-code/testing'

// Loads the mod folder as a session does: the rule must be wired in
// hooks/register.ts. An inline { plugins } register is serialized alone and
// cannot import the rule.
const ran = { result: { stdout: 'ran', stderr: '', interrupted: false } }
const DEV = '/work/dev/my-repo'

for (const command of [
  'kubectl apply -f deploy.yaml',
  'kubectl -n web delete pod x',
  'kubectl --context=prod scale deploy/x --replicas=0',
  'kubectl --kubeconfig /k rollout restart deploy/x',
  'kubectl config use-context prod',
  'kubectl auth reconcile -f r.yaml',
  'kubectl edit cm x',
  'sudo -E kubectl patch svc x -p {}',
  "bash -lc 'kubectl create ns y'",
  'kubectl get pods && kubectl delete pod x',
  'helm install x chart/',
  'helm -n web upgrade --install x chart/',
  'helm uninstall x',
  'helm rollback x 3',
  'helm repo add bitnami https://charts.bitnami.com',
  'helm dependency update chart/',
  '/opt/homebrew/bin/helm upgrade x chart/',
  // PR 911 review: reserved words, backticks, wrappers, eval, -c in a flag cluster.
  'for p in a b; do kubectl delete pod $p; done',
  'if true; then kubectl delete pod x; fi',
  '{ kubectl delete pod x; }',
  '! kubectl delete pod x',
  'echo `kubectl delete pod x`',
  'timeout 30 kubectl delete pod x',
  'timeout -s KILL 5m kubectl delete pod x',
  'echo x | xargs -I {} kubectl delete pod {}',
  'stdbuf -oL kubectl delete pod x',
  'watch -n 5 "kubectl delete pod x"',
  'ionice -c 3 kubectl delete pod x',
  'doas -u root kubectl delete pod x',
  'eval "kubectl delete pod x"',
  "bash -ce 'kubectl delete pod x'",
  // PR 911 review: a substitution inside double quotes still runs.
  'out="$(kubectl apply -f x.yaml)"',
  'echo "`kubectl delete pod x`"',
  'out=$(kubectl apply -f x.yaml)',
  // PR 911 review: a value-taking global option must not hide the verb, and an
  // unknown option before the verb fails closed.
  'kubectl --profile-output get delete pod x',
  'kubectl --kuberc get delete pod x',
  'kubectl --some-unknown-flag get delete pod x',
  'kubectl --log-file get delete pod x',
  'kubectl --vmodule get delete pod x',
  'kubectl -nweb delete pod x',
  'kubectl config --some-unknown-flag view use-context prod',
  'helm --content-cache list install x chart/',
  'helm --color list install x chart/',
  'helm --some-unknown-flag list install x chart/',
  // PR 926 review: an attached short-option value does not hide the verb, and
  // an unknown short option still fails closed.
  'kubectl -v6 apply -f x.yaml',
  'helm -nweb install x chart/',
  'kubectl -zfoo get delete pod x',
  // PR 926 approve P2: wrappers, a dynamic command word, and `sh -c --`.
  'time -p kubectl delete pod x',
  'sudo --user rico kubectl delete pod x',
  'sudo --user=rico kubectl delete pod x',
  'sudo -u rico --group staff helm uninstall x',
  'env -u HOME K=v nice -n 5 nohup kubectl delete pod x',
  'K=kubectl; $K delete pod x',
  'bash -c -- "helm uninstall x"',
  // PR 929 review: a resolved command variable is classified by its verb; a
  // dynamic or missing value still fails closed.
  'K=helm; $K uninstall x',
  'K=$(which kubectl); $K get pods',
  '$K get pods; K=kubectl',
  'K="kubectl delete"; $K pod x',
  'K=kubectl; $K get pods; K=$(which kubectl); $K get pods',
  'K=kubectl""; $K delete pod x',
  'K=\\kubectl; $K delete pod x',
  // e4755c6 review: an unresolved dynamic word fails closed on its own text
  // and on the line's assignment values.
  '$(which kubectl) delete pod x',
  // e4755c6 review: a decoy assignment that never takes effect, or a second
  // assignment, does not resolve the word.
  'K=kubectl; K=echo $K delete pod x',
  'K=kubectl; false && K=echo; $K delete pod x',
  'K=kubectl; K=echo | true; $K delete pod x',
  'K=kubectl; K=echo & $K delete pod x',
  'K=kubectl; ( K=echo ); $K delete pod x',
  "K=kubectl; echo '; K=echo '; $K delete pod x",
  'K=/x/kube*; $K delete pod x # kubectl',
  'K=/x/kube*; $K delete pod x',
  'K=kubectl $K get pods',
  'false && K=kubectl; $K get pods',
  'K=kubectl; read K < f; $K get pods',
  'K=kubectl; if false; then\nK=echo\nfi; $K delete pod x',
  // e4755c6 review: sudo value options and wrappers after them.
  'sudo --chdir /srv kubectl delete pod x',
  'sudo --role r kubectl delete pod x',
  'sudo --command-timeout 5 kubectl delete pod x',
  'sudo --user rico -D /srv kubectl delete pod x',
  'sudo --user rico timeout 5 kubectl delete pod x',
  'sudo --user rico stdbuf -o 0 kubectl delete pod x',
  'sudo --user rico xargs -n 1 kubectl delete pod < list',
  'sudo --user rico ionice -c 3 kubectl delete pod x',
  'sudo --user rico doas -u rico kubectl delete pod x',
  'stdbuf -o0 kubectl delete pod x',
  'xargs kubectl delete pod < list',
  'doas -u rico kubectl delete pod x',
  // e4755c6 review: `env -S` splits its value into a command line.
  'env -S "kubectl delete pod x"',
  'env --split-string "helm uninstall x"',
  'env -S kubectl delete pod x',
  // 0719435 review: a variable set by read, printf -v, for, an array or
  // mapfile, or through another variable, still fails closed.
  'read K <<< kubectl; $K delete pod x',
  'printf -v K kubectl; $K delete pod x',
  'for K in kubectl; do $K delete pod x; done',
  'K=(kubectl); $K delete pod x',
  'mapfile -t K <<< kubectl; $K delete pod x',
  'A=kubectl; B=$A; $B delete pod x',
  // 0719435 review: `-S` closing a short-option cluster, long xargs options.
  'env -iS "kubectl delete pod x"',
  'env -vS "kubectl delete pod x"',
  'xargs --max-args 1 kubectl delete pod < l',
  // 362a5d3 review: `${!NAME}` indirection fails closed; `+=` appends join.
  'K=kubectl; B=K; ${!B} delete pod x',
  'B=K; K=kubectl; ${!B} delete pod x',
  'K=kube; K+=ctl; $K delete pod x',
  // D1.3/2: a reader gives its whole statement, so input from a pipe or
  // a process substitution counts; a `declare -n` nameref fails closed like `${!B}`.
  'echo kubectl | read K; $K delete pod x',
  'read K < <(echo kubectl); $K delete pod x',
  'K=kubectl; declare -n R=K; $R delete pod x',
  'K=kubectl; typeset -n R=K; $R delete pod x',
  'K=kubectl; declare -gn R; R=K; $R delete pod x',
  'K=kubectl; declare -n R="$N"; $R delete pod x',
  // a port-forward is a read only into browser-pool on loopback.
  'kubectl port-forward pod/x 7150:9223',
  'kubectl -n web port-forward pod/x 7150:9223',
  'kubectl -n browser-pool -n web port-forward pod/x 7150:9223',
  'kubectl -n browser-pool port-forward pod/x 7150:9223 --namespace=web',
  'kubectl -n browser-pool port-forward --address 0.0.0.0 pod/x 7150:9223',
  'kubectl -n browser-pool port-forward --address=127.0.0.1,0.0.0.0 pod/x 7150:9223',
  'kubectl -n $NS port-forward pod/x 7150:9223',
  'kubectl -n browser-pool exec pod/x -- sh',
  'kubectl -n browser-pool port-forward pod/x 7150:9223 && kubectl -n browser-pool delete pod x',
  'helm -n browser-pool port-forward x',
]) {
  test(`denies: ${command}`, async ($, on) => {
    on('session.cwd', () => ({ value: DEV }))
    on('tool.call', { tool: 'Bash' }, () => ran)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toContain('infra seat')
  })
}

for (const command of [
  'kubectl get pods -A',
  'kubectl -n web describe pod x',
  'kubectl logs -f deploy/x',
  'kubectl top nodes',
  'kubectl explain deploy',
  'kubectl api-resources',
  'kubectl api-versions',
  'kubectl version --client',
  'kubectl cluster-info',
  'kubectl events -n web',
  'kubectl config view',
  'kubectl config get-contexts',
  'kubectl config current-context',
  'kubectl config get-clusters',
  'kubectl config get-users',
  'kubectl auth can-i delete pods',
  'kubectl auth whoami',
  'kubectl diff -f deploy.yaml',
  'kubectl --context prod get ns',
  'kubectl get pods',
  'kubectl -n x get pods',
  'kubectl --context=c get pods',
  'kubectl --namespace x describe pod y',
  'kubectl --profile-output prof.out get pods',
  'kubectl --kuberc /k/rc get pods',
  'kubectl --some-unknown-flag=v get pods',
  'kubectl --insecure-skip-tls-verify get pods',
  'kubectl -v 6 --warnings-as-errors logs deploy/x',
  'kubectl --help',
  'kubectl -h',
  'helm --kube-context prod --debug list -A',
  'helm --content-cache /c --color never status x',
  'helm --help',
  'helm list -A',
  'helm ls',
  'helm -n web status x',
  'helm get values x',
  'helm history x',
  'helm show values chart/',
  'helm template x chart/',
  'helm search repo nginx',
  'helm version',
  'helm env',
  'helm lint chart/',
  'helm repo list',
  'helm dependency list chart/',
  // PR 926 review: a value attached to a known value-taking short option.
  'kubectl -nweb get pods',
  'kubectl -v6 get pods',
  'helm -nweb list',
  'kubectl -nweb describe pod x',
  // look-alikes: not a kubectl/helm command word
  'rg -n "kubectl apply" /r/README.md',
  'echo kubectl delete pod x',
  'git commit -m "helm install notes"',
  // An unquoted `#` starting a word is a comment to end of line.
  'echo done # see notes; kubectl delete pod x',
  // Single-quoted text is literal.
  "echo '$(kubectl apply -f x.yaml)'",
  // PR 926 approve P2: reads through wrappers, and a literal mention, stay open.
  'sudo -u rico kubectl get pods',
  'sudo --user rico kubectl get pods',
  'time kubectl get pods',
  'time -p kubectl get pods',
  "echo 'kubectl delete'",
  // PR 929 review: a plain assignment resolves the command variable, so a read stays open.
  'K=kubectl; $K get pods',
  'K=/usr/local/bin/kubectl; ${K} describe pod x',
  'H=helm; $H list',
  'K="kubectl"; $K logs deploy/x',
  // e4755c6 review: an unrelated dynamic word beside a kubectl read, or a
  // `helm` path, is not a cluster change.
  '$EDITOR x.yaml && kubectl get pods',
  '$EDITOR helm/values.yaml',
  'echo hi | $PAGER; kubectl get pods',
  '"$ROOT/bin/lint" charts/helm',
  'F=*.yaml; $EDITOR $F',
  'timeout 5 kubectl get pods',
  'env -S "kubectl get pods"',
  // 0719435 review: only the dependencies of the variable used as the
  // command word count, not every assignment on the line.
  'K=kubectl; $K get pods | $PAGER',
  'K=kubectl; $EDITOR x.yaml; $K get pods',
  'HELM_CHART=charts/helm; $EDITOR $HELM_CHART/values.yaml',
  // 362a5d3 review: a setter's evidence is its own command, not the line,
  // and a quoted mention of a setter is not one.
  'export PAGER=less; kubectl get pods | $PAGER',
  'export EDITOR=vim; $EDITOR helm/values.yaml',
  'echo "read PAGER"; kubectl get pods | $PAGER',
  // D1.3/2: an unrelated read-only command after an other-setter stays open.
  'read -r P < cfg; kubectl get pods | $P',
  'read -r P < cfg && kubectl get pods | $P',
  'echo less | read P; kubectl get pods | $P',
  'declare -n R=K; kubectl get pods | $R',
  // a loopback port-forward into browser-pool is a read.
  'kubectl -n browser-pool port-forward pod/browser-pool-ephemeral-0 9223:9223',
  'kubectl -nbrowser-pool port-forward pod/browser-pool-ephemeral-0 7150:9223',
  'kubectl --namespace browser-pool port-forward pod/x 7150:9223',
  'kubectl --namespace=browser-pool port-forward pod/x 7150:9223',
  'kubectl port-forward -n browser-pool pod/x 7150:9223',
  'kubectl port-forward pod/x 7150:9223 --namespace=browser-pool',
  'kubectl -n browser-pool port-forward --address 127.0.0.1 pod/x 7150:9223',
  'kubectl -n browser-pool port-forward --address=localhost,127.0.0.1 pod/x 7150:9223',
  'KUBECONFIG=$HOME/.kube/config nohup kubectl -n browser-pool port-forward pod/browser-pool-ephemeral-0 7150:9223 > /dev/null 2>&1 &',
]) {
  test(`allows: ${command}`, async ($, on) => {
    on('session.cwd', () => ({ value: DEV }))
    on('tool.call', { tool: 'Bash' }, () => ran)
    const r = await $.tool.call({ tool: 'Bash', command })
    expect(r.deny).toBeUndefined()
  })
}

for (const cwd of [
  '/work/dev/infra',
  '/work/dev/infra/ansible',
  '/work/dev/k3s-deploy',
  // PR 926 approve P2: a worktree of an infra repo is the infra seat too
  // (workspace-path: _worktrees/<harness>/<owner>/<repo>/<branch>).
  '/work/_tmp/_worktrees/claude/owner/infra/fix-x',
  '/work/_tmp/_worktrees/claude/infra/infra/fix-x/ansible',
  '/work/_tmp/_worktrees/codex/owner/k3s-deploy/x',
]) {
  test(`allows changes from the infra seat: ${cwd}`, async ($, on) => {
    on('session.cwd', () => ({ value: cwd }))
    on('tool.call', { tool: 'Bash' }, () => ran)
    const r = await $.tool.call({ tool: 'Bash', command: 'kubectl apply -f deploy.yaml' })
    expect(r.deny).toBeUndefined()
  })
}

for (const cwd of [
  '/work/_tmp/development/development',
  '/work/dev/infra-docs',
  '/work/dev/k3s-deploy2',
  // A worktree of any other repo is not the seat, nor is an infra-named branch.
  '/work/_tmp/_worktrees/claude/owner/development/x',
  '/work/_tmp/_worktrees/claude/owner/development/infra',
  '/work/_tmp/_worktrees/claude/owner/infra-docs/x',
  '/work/_tmp/_worktrees/claude/owner/infra',
]) {
  test(`denies changes outside the infra seat: ${cwd}`, async ($, on) => {
    on('session.cwd', () => ({ value: cwd }))
    on('tool.call', { tool: 'Bash' }, () => ran)
    const r = await $.tool.call({ tool: 'Bash', command: 'helm upgrade x chart/' })
    expect(r.deny).toContain('infra seat')
  })
}

test('leaves sessions outside Development alone', async ($, on) => {
  on('session.cwd', () => ({ value: '/Users/me/elsewhere' }))
  on('tool.call', { tool: 'Bash' }, () => ran)
  const r = await $.tool.call({ tool: 'Bash', command: 'kubectl apply -f x.yaml' })
  expect(r.deny).toBeUndefined()
})

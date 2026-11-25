#!/bin/bash
# Roles:
#   workstation  waits for the clusters' kubeconfigs, gives them to "candidate", serves tmux through ttyd on 7681
#   grader       waits for the kubeconfigs and idles; the controller runs checks with `docker exec`
# Each cluster container writes its admin kubeconfig to /lab/<name>.yaml (a per-session volume) with
# 127.0.0.1 as the server and "default" as the cluster, user and context names. They are rewritten to the
# cluster's address on the session network and to the cluster's name, then merged into one kubeconfig with a
# context per cluster; the first cluster is the current context. Single-cluster kubeconfigs stay in
# ~/.kube/clusters/<name>.yaml for the grader.
set -euo pipefail
role="${1:-workstation}"
read -r -a clusters <<< "${LAB_CLUSTERS:-k8s}"

install_kubeconfig() { # $1 = home directory, $2 = owner
  local dir="$1/.kube" paths=()
  mkdir -p "$dir/clusters"
  for name in "${clusters[@]}"; do
    for _ in $(seq 1 300); do [ -s "/lab/$name.yaml" ] && break; sleep 1; done
    sed -e "s#https://127.0.0.1:6443#https://$name:6443#" -e "s#: default\$#: $name#" "/lab/$name.yaml" > "$dir/clusters/$name.yaml"
    paths+=("$dir/clusters/$name.yaml")
  done
  (IFS=:; KUBECONFIG="${paths[*]}" kubectl config view --flatten) > "$dir/config"
  kubectl --kubeconfig "$dir/config" config use-context "${clusters[0]}" >/dev/null
  chmod 600 "$dir/config" "$dir"/clusters/*.yaml
  chown -R "$2" "$dir"
}

case "$role" in
  workstation)
    : "${TTYD_CREDENTIAL:?TTYD_CREDENTIAL is required}"
    install_kubeconfig /home/candidate candidate:candidate
    install_kubeconfig /root root:root
    mkdir -p /opt/answers && chown candidate:candidate /opt/answers
    exec ttyd --port 7681 --writable --credential "$TTYD_CREDENTIAL" --max-clients 3 \
      --terminal-type xterm-256color \
      su - candidate -c "tmux new-session -A -s lab"
    ;;
  grader)
    install_kubeconfig /root root:root
    touch /tmp/ready
    exec sleep infinity
    ;;
  *)
    exec "$@"
    ;;
esac

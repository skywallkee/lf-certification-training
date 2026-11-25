#!/bin/bash
# Roles:
#   workstation  waits for the cluster's kubeconfig, gives it to "candidate", serves tmux through ttyd on 7681
#   grader       waits for the kubeconfig and idles; the controller runs checks with `docker exec`
# The cluster container writes its admin kubeconfig to /lab/kubeconfig.yaml (a per-session volume) with
# 127.0.0.1 as the server; it is rewritten to the cluster's address on the session network.
set -euo pipefail
role="${1:-workstation}"
server="${LAB_CLUSTER_SERVER:-https://cluster:6443}"

install_kubeconfig() { # $1 = home directory, $2 = owner
  for _ in $(seq 1 300); do [ -s /lab/kubeconfig.yaml ] && break; sleep 1; done
  mkdir -p "$1/.kube"
  sed "s#https://127.0.0.1:6443#${server}#" /lab/kubeconfig.yaml > "$1/.kube/config"
  chmod 600 "$1/.kube/config"
  chown -R "$2" "$1/.kube"
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

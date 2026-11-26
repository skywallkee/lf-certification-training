# syntax=docker/dockerfile:1.7
# Lab workstation image: the learner's terminal (ttyd + tmux as the unprivileged "candidate" user) and the
# grader sidecar (kubectl + Chainsaw). One image, two roles; the lab controller picks the command.
# The runtime stays Ubuntu on purpose: the real exams give candidates an Ubuntu shell, so the lab should feel the same.
#
# Behind a TLS-inspecting proxy, pass its CA as a build secret:
#   docker build --secret id=extra_ca,src=/path/to/ca.crt ...
# apt and curl retry with backoff when a mirror or download host hiccups (see apt-install.sh). If Ubuntu's
# main mirror stays broken, pick another: --build-arg APT_MIRROR=http://de.archive.ubuntu.com/ubuntu

ARG UBUNTU_VERSION=24.04

# --- Downloads: fetch and checksum-verify the static binaries in a throwaway stage -------------------------------
FROM ubuntu:${UBUNTU_VERSION} AS downloads
ARG TARGETARCH=amd64
ARG KUBECTL_VERSION=v1.34.13
ARG CHAINSAW_VERSION=v0.2.15
ARG TTYD_VERSION=1.7.7
ARG HELM_VERSION=v3.19.2
ARG INSTALL_HELM=true
ARG APT_MIRROR=
RUN --mount=type=bind,source=apt-install.sh,target=/tmp/apt-install.sh \
    sh /tmp/apt-install.sh ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /out
RUN --mount=type=secret,id=extra_ca,required=false <<'SH'
set -eu
CA=""; [ -s /run/secrets/extra_ca ] && CA="--cacert /run/secrets/extra_ca"
get() { curl -fsSL --connect-timeout 20 --retry 5 --retry-delay 3 --retry-all-errors $CA "$@"; }
case "$TARGETARCH" in amd64) TTYD_ARCH=x86_64 ;; arm64) TTYD_ARCH=aarch64 ;; *) echo "unsupported arch $TARGETARCH"; exit 1 ;; esac
cd /tmp

get -o kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl"
echo "$(get "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl.sha256")  kubectl" | sha256sum -c -

get -o "ttyd.${TTYD_ARCH}" "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.${TTYD_ARCH}"
get "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/SHA256SUMS" | grep " ttyd.${TTYD_ARCH}\$" | sha256sum -c -
mv "ttyd.${TTYD_ARCH}" ttyd

CS="chainsaw_linux_${TARGETARCH}.tar.gz"
get -o "$CS" "https://github.com/kyverno/chainsaw/releases/download/${CHAINSAW_VERSION}/${CS}"
get "https://github.com/kyverno/chainsaw/releases/download/${CHAINSAW_VERSION}/checksums.txt" | grep " ${CS}\$" | sha256sum -c -
tar -xzf "$CS" chainsaw

if [ "$INSTALL_HELM" = "true" ]; then
  HT="helm-${HELM_VERSION}-linux-${TARGETARCH}.tar.gz"
  get -o "$HT" "https://get.helm.sh/${HT}"
  echo "$(get "https://get.helm.sh/${HT}.sha256sum" | cut -d' ' -f1)  ${HT}" | sha256sum -c -
  tar -xzf "$HT" --strip-components=1 "linux-${TARGETARCH}/helm"
  mv helm /out/
fi
install -m 0755 kubectl ttyd chainsaw /out/
SH

# --- Runtime ----------------------------------------------------------------------------------------------------
FROM ubuntu:${UBUNTU_VERSION}
ARG APT_MIRROR=
# Learner tools only; no recommends, no docs/man pages, apt lists removed in the same layer.
RUN --mount=type=bind,source=apt-install.sh,target=/tmp/apt-install.sh <<'SH'
set -eu
printf '%s\n' 'path-exclude=/usr/share/doc/*' 'path-include=/usr/share/doc/*/copyright' 'path-exclude=/usr/share/man/*' \
  'path-exclude=/usr/share/info/*' 'path-exclude=/usr/share/locale/*' 'path-include=/usr/share/locale/locale.alias' \
  > /etc/dpkg/dpkg.cfg.d/01-slim
sh /tmp/apt-install.sh \
  bash-completion ca-certificates curl dnsutils iproute2 iputils-ping jq less nano netcat-openbsd tmux vim
apt-get clean
rm -rf /var/lib/apt/lists/* /var/cache/apt/* /var/log/apt/* /var/log/dpkg.log
SH
COPY --from=downloads /out/ /usr/local/bin/
RUN useradd --create-home --shell /bin/bash candidate \
 && mkdir -p /etc/bash_completion.d && kubectl completion bash > /etc/bash_completion.d/kubectl \
 && if command -v helm >/dev/null; then helm completion bash > /etc/bash_completion.d/helm; fi \
 && printf '%s\n' 'source /etc/bash_completion' 'alias k=kubectl' 'complete -o default -F __start_kubectl k' \
      'export KUBECONFIG=$HOME/.kube/config' 'export EDITOR=vim' >> /home/candidate/.bashrc
COPY --chmod=0755 entrypoint.sh /usr/local/bin/lab-entrypoint
COPY --chmod=0644 tmux.conf /etc/tmux.conf
# Starts as root: the entrypoint installs the kubeconfigs for both users, then ttyd runs the learner's shell as
# "candidate" (su), and the grader role only idles for `docker exec`.
ENTRYPOINT ["/usr/local/bin/lab-entrypoint"]
CMD ["workstation"]

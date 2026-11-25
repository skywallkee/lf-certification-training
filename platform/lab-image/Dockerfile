# syntax=docker/dockerfile:1.7
# Lab workstation image: the learner's terminal (ttyd + tmux as the unprivileged "candidate" user) and the
# grader sidecar (kubectl + Chainsaw). One image, two roles; the lab controller picks the command.
#
# Behind a TLS-inspecting proxy, pass its CA as a build secret:
#   docker build --secret id=extra_ca,src=/path/to/ca.crt ...

ARG UBUNTU_VERSION=24.04

FROM ubuntu:${UBUNTU_VERSION} AS downloads
ARG TARGETARCH=amd64
ARG KUBECTL_VERSION=v1.34.13
ARG CHAINSAW_VERSION=v0.2.15
ARG TTYD_VERSION=1.7.7
ARG HELM_VERSION=v3.19.2
ARG INSTALL_HELM=true
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /out
RUN --mount=type=secret,id=extra_ca,required=false <<'SH'
set -eu
CA=""; [ -s /run/secrets/extra_ca ] && CA="--cacert /run/secrets/extra_ca"
case "$TARGETARCH" in amd64) TTYD_ARCH=x86_64 ;; arm64) TTYD_ARCH=aarch64 ;; *) echo "unsupported arch $TARGETARCH"; exit 1 ;; esac
curl -fsSL $CA -o kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl"
curl -fsSL $CA -o ttyd "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.${TTYD_ARCH}"
curl -fsSL $CA "https://github.com/kyverno/chainsaw/releases/download/${CHAINSAW_VERSION}/chainsaw_linux_${TARGETARCH}.tar.gz" | tar -xz chainsaw
if [ "$INSTALL_HELM" = "true" ]; then
  curl -fsSL $CA "https://get.helm.sh/helm-${HELM_VERSION}-linux-${TARGETARCH}.tar.gz" | tar -xz --strip-components=1 "linux-${TARGETARCH}/helm"
fi
chmod +x ./*
SH

FROM ubuntu:${UBUNTU_VERSION}
RUN apt-get update && apt-get install -y --no-install-recommends \
      bash-completion ca-certificates curl dnsutils iproute2 iputils-ping jq less nano netcat-openbsd tmux vim \
 && rm -rf /var/lib/apt/lists/*
COPY --from=downloads /out/ /usr/local/bin/
RUN useradd --create-home --shell /bin/bash candidate \
 && mkdir -p /etc/bash_completion.d && kubectl completion bash > /etc/bash_completion.d/kubectl \
 && printf '%s\n' 'source /etc/bash_completion' 'alias k=kubectl' 'complete -o default -F __start_kubectl k' \
      'export KUBECONFIG=$HOME/.kube/config' 'export EDITOR=vim' >> /home/candidate/.bashrc
COPY entrypoint.sh /usr/local/bin/lab-entrypoint
COPY tmux.conf /etc/tmux.conf
ENTRYPOINT ["/usr/local/bin/lab-entrypoint"]
CMD ["workstation"]

# 4. Labs are disposable VMs on AWS and Azure under monthly caps

Date: 2026-11-24 · Status: Accepted (implementation from Phase 2)

## Context

Six exams are performance-based and need real environments. There is no always-on cluster, and CKA, CKS
and CKNE test kubeadm itself.

## Decision

- Labs run on spot VMs created through the AWS and Azure APIs by the lab controller inside the web app,
  and are deleted at Finish or TTL (default 2 hours). AWS (us-east-1) is the default; Azure (East US) takes
  over when AWS reaches its monthly cap.
- Three tiers: vCluster on a shared k3s node (deleted after the last learner leaves), per-session kubeadm
  on 2-3 VMs, and a single Linux VM for LFCS.
- Every VM is tagged with its session id and expiry, so the sweeper can delete anything orphaned.
- Lab VMs live in a dedicated AWS account and Azure subscription with no route to the database.
- The terminal (ttyd, own TLS with a per-session pinned certificate and password) is relayed through the
  web app; lab VMs get no DNS names.
- Grading uses Kyverno Chainsaw asserts and shell checks run by a small Go agent on the VM.

## Consequences

Phase 0 sets up only the budgets for the lab clouds. The lab network, IAM role and images arrive with the
first lab tier.

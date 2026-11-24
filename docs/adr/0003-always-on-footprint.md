# 3. Only the web app and Postgres are always on, on Azure

Date: 2026-11-24 · Status: Accepted

## Context

There is $100 of credit per month on Azure and $100 on AWS, and learners never pay. Only the frontend may
run around the clock; everything else is created on demand. Accounts and progress need a managed Postgres.
There is no custom domain.

## Decision

- The Next.js web app runs on **Azure Container Apps** (consumption workload profile, East US) with
  **one warm replica** (0.5 vCPU, 1 GiB). It also holds the lab controller and the terminal relay.
- **Azure Database for PostgreSQL Flexible Server, Burstable B1ms**, 32 GiB, private access only
  (delegated subnet, private DNS zone, public access off), stays on. A stopped server restarts after
  seven days, so stopping it saves little and breaks sign-in.
- The **sweeper** is a Container Apps cron job every 5 minutes. Terraform creates it only once its image
  exists (`enable_sweeper`), so nothing runs for nothing before Phase 2.
- The app is served on its free `*.azurecontainerapps.io` address with Azure-managed TLS.
- Log Analytics has a daily ingestion cap (0.1 GB by default).
- Budgets on both clouds alert at 50%, 80% and 100% of $100 actual spend and at 100% forecast. Budgets
  only alert; the platform enforces the cap by refusing new labs.
- Terraform never runs against real accounts from CI in Phase 0. Plans and applies are run by a person
  until a reviewed workflow with OIDC credentials exists.

## Consequences

- Expected always-on cost is about $30 to $45 a month on Azure (to be confirmed in the pricing calculator).
- The database is unreachable from GitHub-hosted runners, so the curriculum ingest must run inside the
  virtual network: as a Container Apps job started by the deploy workflow (Phase 1).
- The AWS budget excludes credits and refunds (`include_credit = false`), otherwise it would read about $0
  while credits pay the bill.

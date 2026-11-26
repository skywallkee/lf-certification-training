# Infrastructure

Terraform for the parts that exist all the time: the Azure platform (web app, database, logs) and the
monthly budgets on both clouds. Lab VMs are not here: the web app creates and deletes them through the
cloud APIs ([ADR 0004](../docs/adr/0004-on-demand-labs-two-clouds.md)).

```
terraform/
  modules/
    azure-platform/   resource group, VNet, Container Apps environment + web app (+ sweeper job), Postgres B1ms, Log Analytics
    azure-budget/     $100/month subscription budget, alerts at 50/80/100% actual and 100% forecast
    aws-budget/       $100/month account budget, same alerts, credits excluded
  envs/
    azure/            platform + Azure budget, East US
    aws/              AWS budget, us-east-1 (lab network and IAM arrive in Phase 2)
```

> **Nothing here has been applied.** CI runs `fmt` and `validate` only. Run plans and applies by hand
> until a reviewed deploy workflow with OIDC credentials exists ([ADR 0003](../docs/adr/0003-always-on-footprint.md)).

## What it costs (approximate, East US)

| Piece | Size | Per month |
|-------|------|-----------|
| Container App `web`, 1 warm replica | 0.5 vCPU, 1 GiB | $10 to $25 |
| PostgreSQL Flexible Server | B1ms, 32 GiB, 7-day backups | $15 to $20 |
| Log Analytics | capped at 0.1 GB/day | a few dollars at most |
| Sweeper job (when enabled) | 0.25 vCPU, ~20 s every 5 min | under $2 |
| VNet, private DNS zone, budgets | | about $0.50 |

Check the figures in the Azure pricing calculator before the first apply. Set `web_min_replicas = 0` to
scale to zero (cold starts of 10 to 30 seconds) if credits run short.

## Bootstrap state (once)

State holds the database password, so keep it in private storage, never in git.

```sh
# Azure: storage account for state (pennies a month)
az group create -n rg-lfct-tfstate -l eastus
az storage account create -n stlfcttfstate$RANDOM -g rg-lfct-tfstate -l eastus \
  --sku Standard_LRS --min-tls-version TLS1_2 --allow-blob-public-access false
az storage container create -n tfstate --account-name <account> --auth-mode login

# AWS: versioned, encrypted bucket for state
aws s3api create-bucket --bucket lfct-tfstate-<suffix> --region us-east-1
aws s3api put-bucket-versioning --bucket lfct-tfstate-<suffix> --versioning-configuration Status=Enabled
```

Then in each of `envs/azure` and `envs/aws`:

```sh
cp backend.hcl.example backend.hcl            # fill in
cp terraform.tfvars.example terraform.tfvars  # fill in
terraform init -backend-config=backend.hcl
terraform plan -out tfplan
terraform apply tfplan
```

## Notes

- The first web revision is Microsoft's quickstart image on port 80. From Phase 1 GitHub Actions deploys
  the Next.js image as new revisions; set `web_target_port = 4000` then. Terraform ignores image changes.
- `enable_sweeper` stays `false` until the sweeper image exists (Phase 2).
- The web app gets a system-assigned identity, later granted rights in the Azure lab subscription.
- `web_outbound_ip_addresses` is the allow-list for lab VM terminal and grader ports.
- Budgets alert only; the platform itself refuses new labs once a cloud's monthly cap is reached.
- Some credit-based Azure offers limit Cost Management budgets; if the budget fails to create, check the
  subscription's offer type.
- Provider lock files (`.terraform.lock.hcl`) are created on first `terraform init` and should be committed then.

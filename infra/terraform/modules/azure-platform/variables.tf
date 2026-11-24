variable "name" {
  description = "Short prefix for resource names, lowercase letters and digits."
  type        = string
  default     = "lfct"
  validation {
    condition     = can(regex("^[a-z][a-z0-9]{1,11}$", var.name))
    error_message = "name must be 2-12 lowercase letters or digits, starting with a letter."
  }
}

variable "location" {
  description = "Azure region. East US is among the cheapest (see the plan)."
  type        = string
  default     = "eastus"
}

variable "tags" {
  description = "Tags applied to every resource."
  type        = map(string)
  default     = {}
}

variable "vnet_address_space" {
  type    = string
  default = "10.40.0.0/16"
}

# --- Web app -----------------------------------------------------------------

variable "web_image" {
  description = "Image for the first revision. GitHub Actions deploys later revisions, so Terraform ignores image changes."
  type        = string
  default     = "mcr.microsoft.com/k8se/quickstart:latest"
}

variable "web_target_port" {
  description = "Port the web container listens on: 80 for the quickstart image, 3000 for the Next.js app from Phase 1."
  type        = number
  default     = 80
}

variable "web_cpu" {
  type    = number
  default = 0.5
}

variable "web_memory" {
  type    = string
  default = "1Gi"
}

variable "web_min_replicas" {
  description = "1 keeps the frontend warm (no 10-30 s cold start). 0 scales to zero and costs less."
  type        = number
  default     = 1
}

variable "web_max_replicas" {
  type    = number
  default = 2
}

# --- Sweeper job ---------------------------------------------------------------

variable "enable_sweeper" {
  description = "Create the sweeper cron job. Leave false until its image exists (Phase 2), so nothing runs for nothing."
  type        = bool
  default     = false
}

variable "sweeper_image" {
  type    = string
  default = "mcr.microsoft.com/k8se/quickstart-jobs:latest"
}

variable "sweeper_cron" {
  description = "Every 5 minutes: expire sessions, delete orphaned lab VMs by tag, check monthly caps."
  type        = string
  default     = "*/5 * * * *"
}

# --- PostgreSQL ------------------------------------------------------------------

variable "postgres_version" {
  type    = string
  default = "17"
}

variable "postgres_sku" {
  description = "Burstable B1ms: 1 vCore, 2 GiB. Always on, since a stopped server restarts after 7 days anyway."
  type        = string
  default     = "B_Standard_B1ms"
}

variable "postgres_storage_mb" {
  description = "32 GiB, the smallest size. Storage can only grow."
  type        = number
  default     = 32768
}

variable "postgres_backup_retention_days" {
  type    = number
  default = 7
}

variable "postgres_database" {
  type    = string
  default = "lfct"
}

# --- Logs ----------------------------------------------------------------------

variable "log_daily_quota_gb" {
  description = "Daily ingestion cap for Log Analytics, so a noisy app cannot run up the bill."
  type        = number
  default     = 0.1
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "subscription_id" {
  description = "Azure subscription that holds the always-on platform (web app, database, budget)."
  type        = string
}

variable "location" {
  type    = string
  default = "eastus"
}

variable "alert_emails" {
  description = "Who gets budget alerts."
  type        = list(string)
}

variable "monthly_budget" {
  type    = number
  default = 100
}

variable "budget_start_date" {
  description = "First of the month the budget starts, e.g. 2026-12-01T00:00:00Z."
  type        = string
}

variable "web_image" {
  type    = string
  default = "mcr.microsoft.com/k8se/quickstart:latest"
}

variable "web_target_port" {
  type    = number
  default = 80
}

variable "enable_sweeper" {
  type    = bool
  default = false
}

terraform {
  required_version = ">= 1.10"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.15"
    }
  }
}

variable "name" {
  type = string
}

variable "subscription_id" {
  description = "Subscription resource id: /subscriptions/<guid>."
  type        = string
}

variable "amount" {
  description = "Monthly amount in the billing currency. Matches the $100 monthly credit."
  type        = number
  default     = 100
}

variable "start_date" {
  description = "First day of a month, RFC 3339. Cannot be in the past when the budget is created."
  type        = string
}

variable "alert_emails" {
  type = list(string)
  validation {
    condition     = length(var.alert_emails) > 0
    error_message = "At least one alert email is required."
  }
}

variable "actual_thresholds" {
  description = "Percent of the amount at which to email on actual spend."
  type        = list(number)
  default     = [50, 80, 100]
}

# Alerts only: Azure budgets never stop resources. The platform enforces the hard cap itself by refusing
# new labs once the month's spend reaches the cap (see the plan, "Learner limits").
resource "azurerm_consumption_budget_subscription" "monthly" {
  name            = "budget-${var.name}-monthly"
  subscription_id = var.subscription_id
  amount          = var.amount
  time_grain      = "Monthly"

  time_period {
    start_date = var.start_date
  }

  dynamic "notification" {
    for_each = var.actual_thresholds
    content {
      enabled        = true
      threshold      = notification.value
      operator       = "GreaterThanOrEqualTo"
      threshold_type = "Actual"
      contact_emails = var.alert_emails
    }
  }

  notification {
    enabled        = true
    threshold      = 100
    operator       = "GreaterThan"
    threshold_type = "Forecasted"
    contact_emails = var.alert_emails
  }

  lifecycle {
    # Azure normalises the start date; changing it would force a new budget.
    ignore_changes = [time_period]
  }
}

output "id" {
  value = azurerm_consumption_budget_subscription.monthly.id
}

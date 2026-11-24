terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.74"
    }
  }
}

variable "name" {
  type = string
}

variable "amount" {
  description = "Monthly amount in USD. Matches the $100 monthly credit."
  type        = number
  default     = 100
}

variable "alert_emails" {
  type = list(string)
  validation {
    condition     = length(var.alert_emails) > 0
    error_message = "At least one alert email is required."
  }
}

variable "actual_thresholds" {
  type    = list(number)
  default = [50, 80, 100]
}

# Alerts only: AWS Budgets does not stop resources by itself. The platform enforces the hard cap.
resource "aws_budgets_budget" "monthly" {
  name         = "${var.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.amount)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Credits pay the bill, so a budget that nets them out would always read about $0.
  # Exclude credits and refunds to measure real usage against the credit allowance.
  cost_types {
    include_credit = false
    include_refund = false
  }

  dynamic "notification" {
    for_each = var.actual_thresholds
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      notification_type          = "ACTUAL"
      subscriber_email_addresses = var.alert_emails
    }
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.alert_emails
  }
}

output "name" {
  value = aws_budgets_budget.monthly.name
}

variable "region" {
  description = "us-east-1 is among the cheapest regions for spot capacity (see the plan)."
  type        = string
  default     = "us-east-1"
}

variable "alert_emails" {
  type = list(string)
}

variable "monthly_budget" {
  type    = number
  default = 100
}

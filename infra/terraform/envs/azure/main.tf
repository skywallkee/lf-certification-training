locals {
  tags = {
    project = "lf-certification-training"
    managed = "terraform"
    tier    = "platform"
  }
}

module "platform" {
  source = "../../modules/azure-platform"

  name            = "lfct"
  location        = var.location
  tags            = local.tags
  web_image       = var.web_image
  web_target_port = var.web_target_port
  enable_sweeper  = var.enable_sweeper
}

module "budget" {
  source = "../../modules/azure-budget"

  name            = "lfct"
  subscription_id = "/subscriptions/${var.subscription_id}"
  amount          = var.monthly_budget
  start_date      = var.budget_start_date
  alert_emails    = var.alert_emails
}

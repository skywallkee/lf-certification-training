# AWS holds only on-demand lab VMs (from Phase 2). Phase 0 sets up the spending alert;
# the lab VPC, security groups and the controller's IAM role arrive with the first labs.

module "budget" {
  source = "../../modules/aws-budget"

  name         = "lfct"
  amount       = var.monthly_budget
  alert_emails = var.alert_emails
}

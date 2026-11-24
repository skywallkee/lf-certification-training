resource "azurerm_resource_group" "platform" {
  name     = "rg-${var.name}-platform"
  location = var.location
  tags     = var.tags
}

resource "azurerm_log_analytics_workspace" "platform" {
  name                = "log-${var.name}"
  location            = azurerm_resource_group.platform.location
  resource_group_name = azurerm_resource_group.platform.name
  sku                 = "PerGB2018"
  retention_in_days   = var.log_retention_days
  daily_quota_gb      = var.log_daily_quota_gb
  tags                = var.tags
}

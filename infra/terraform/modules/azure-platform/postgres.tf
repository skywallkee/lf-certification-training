resource "random_password" "postgres_admin" {
  length  = 32
  special = false
}

resource "random_string" "postgres_suffix" {
  length  = 6
  special = false
  upper   = false
}

resource "azurerm_postgresql_flexible_server" "platform" {
  # Server names are global, hence the suffix.
  name                          = "psql-${var.name}-${random_string.postgres_suffix.result}"
  resource_group_name           = azurerm_resource_group.platform.name
  location                      = azurerm_resource_group.platform.location
  version                       = var.postgres_version
  sku_name                      = var.postgres_sku
  storage_mb                    = var.postgres_storage_mb
  storage_tier                  = "P4"
  auto_grow_enabled             = false
  backup_retention_days         = var.postgres_backup_retention_days
  geo_redundant_backup_enabled  = false
  delegated_subnet_id           = azurerm_subnet.postgres.id
  private_dns_zone_id           = azurerm_private_dns_zone.postgres.id
  public_network_access_enabled = false
  administrator_login           = "lfctadmin"
  administrator_password        = random_password.postgres_admin.result
  tags                          = var.tags

  depends_on = [azurerm_private_dns_zone_virtual_network_link.postgres]

  lifecycle {
    # Azure picks an availability zone when none is given; do not fight it on later plans.
    ignore_changes = [zone]
  }
}

resource "azurerm_postgresql_flexible_server_database" "app" {
  name      = var.postgres_database
  server_id = azurerm_postgresql_flexible_server.platform.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

locals {
  database_url = format(
    "postgres://%s:%s@%s:5432/%s?sslmode=require",
    azurerm_postgresql_flexible_server.platform.administrator_login,
    random_password.postgres_admin.result,
    azurerm_postgresql_flexible_server.platform.fqdn,
    azurerm_postgresql_flexible_server_database.app.name,
  )
}

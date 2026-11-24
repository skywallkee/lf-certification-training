resource "azurerm_container_app_environment" "platform" {
  name                       = "cae-${var.name}"
  location                   = azurerm_resource_group.platform.location
  resource_group_name        = azurerm_resource_group.platform.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.platform.id
  logs_destination           = "log-analytics"
  infrastructure_subnet_id   = azurerm_subnet.apps.id
  tags                       = var.tags

  # Consumption only: pay per use, no dedicated nodes.
  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }
}

# The always-on frontend: pages, auth, quizzes, lab controller and terminal relay.
# Reached on its free <app>.<env>.<region>.azurecontainerapps.io address with Azure-managed TLS.
resource "azurerm_container_app" "web" {
  name                         = "ca-${var.name}-web"
  container_app_environment_id = azurerm_container_app_environment.platform.id
  resource_group_name          = azurerm_resource_group.platform.name
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"
  tags                         = var.tags

  identity {
    type = "SystemAssigned"
  }

  secret {
    name  = "database-url"
    value = local.database_url
  }

  ingress {
    external_enabled           = true
    allow_insecure_connections = false
    target_port                = var.web_target_port
    transport                  = "auto"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = var.web_min_replicas
    max_replicas = var.web_max_replicas

    container {
      name   = "web"
      image  = var.web_image
      cpu    = var.web_cpu
      memory = var.web_memory

      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
    }
  }

  lifecycle {
    # GitHub Actions deploys new images as new revisions.
    ignore_changes = [template[0].container[0].image]
  }
}

# Safety net for on-demand labs. Runs about 20 seconds every 5 minutes.
resource "azurerm_container_app_job" "sweeper" {
  count = var.enable_sweeper ? 1 : 0

  name                         = "caj-${var.name}-sweeper"
  location                     = azurerm_resource_group.platform.location
  resource_group_name          = azurerm_resource_group.platform.name
  container_app_environment_id = azurerm_container_app_environment.platform.id
  workload_profile_name        = "Consumption"
  replica_timeout_in_seconds   = 240
  replica_retry_limit          = 0
  tags                         = var.tags

  identity {
    type = "SystemAssigned"
  }

  schedule_trigger_config {
    cron_expression          = var.sweeper_cron
    parallelism              = 1
    replica_completion_count = 1
  }

  secret {
    name  = "database-url"
    value = local.database_url
  }

  template {
    container {
      name   = "sweeper"
      image  = var.sweeper_image
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }
}

output "resource_group_name" {
  value = azurerm_resource_group.platform.name
}

output "web_url" {
  description = "The app's free Azure-provided address."
  value       = "https://${azurerm_container_app.web.ingress[0].fqdn}"
}

output "web_outbound_ip_addresses" {
  description = "Lab VMs allow terminal and grader traffic only from these addresses."
  value       = azurerm_container_app.web.outbound_ip_addresses
}

output "web_principal_id" {
  description = "Managed identity of the web app, for granting it rights in the Azure lab subscription later."
  value       = azurerm_container_app.web.identity[0].principal_id
}

output "container_app_environment_id" {
  value = azurerm_container_app_environment.platform.id
}

output "postgres_fqdn" {
  value = azurerm_postgresql_flexible_server.platform.fqdn
}

output "database_url" {
  description = "Connection string for the app (also stored as a Container Apps secret)."
  value       = local.database_url
  sensitive   = true
}

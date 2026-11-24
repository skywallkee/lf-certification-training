output "web_url" {
  value = module.platform.web_url
}

output "web_outbound_ip_addresses" {
  value = module.platform.web_outbound_ip_addresses
}

output "postgres_fqdn" {
  value = module.platform.postgres_fqdn
}

output "database_url" {
  value     = module.platform.database_url
  sensitive = true
}

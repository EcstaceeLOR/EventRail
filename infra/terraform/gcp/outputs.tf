output "cluster_name" { value = google_container_cluster.eventrail.name }
output "cluster_region" { value = google_container_cluster.eventrail.location }
output "artifact_repository" { value = google_artifact_registry_repository.eventrail.name }
output "runtime_secret" { value = google_secret_manager_secret.runtime.secret_id }
output "recovery_bucket" { value = google_storage_bucket.recovery.name }
output "deployer_service_account" { value = google_service_account.deployer.email }
output "workload_identity_provider" { value = google_iam_workload_identity_pool_provider.github.name }
output "database_private_ip" {
  value     = google_sql_database_instance.eventrail.private_ip_address
  sensitive = true
}
output "redis_host" {
  value     = google_redis_instance.eventrail.host
  sensitive = true
}

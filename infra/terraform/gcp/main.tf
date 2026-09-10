locals {
  name = "eventrail-${var.environment}"
  labels = merge(var.labels, {
    application = "eventrail"
    environment = var.environment
    managed_by  = "terraform"
  })
  production = var.environment == "production"
  services = toset([
    "artifactregistry.googleapis.com",
    "container.googleapis.com",
    "iamcredentials.googleapis.com",
    "redis.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
    "sts.googleapis.com",
  ])
}

resource "google_project_service" "required" {
  for_each           = local.services
  service            = each.value
  disable_on_destroy = false
}

resource "google_compute_network" "eventrail" {
  name                    = local.name
  auto_create_subnetworks = false
  depends_on              = [google_project_service.required]
}

resource "google_compute_subnetwork" "eventrail" {
  name          = local.name
  region        = var.region
  network       = google_compute_network.eventrail.id
  ip_cidr_range = "10.40.0.0/20"
  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.48.0.0/14"
  }
  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.44.0.0/20"
  }
  private_ip_google_access = true
}

resource "google_compute_router" "eventrail" {
  name    = local.name
  region  = var.region
  network = google_compute_network.eventrail.id
}

resource "google_compute_router_nat" "eventrail" {
  name                               = local.name
  router                             = google_compute_router.eventrail.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}

resource "google_compute_global_address" "services" {
  name          = "${local.name}-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.eventrail.id
}

resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.eventrail.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.services.name]
  depends_on              = [google_project_service.required]
}

resource "google_container_cluster" "eventrail" {
  name                = local.name
  location            = var.region
  enable_autopilot    = true
  network             = google_compute_network.eventrail.id
  subnetwork          = google_compute_subnetwork.eventrail.id
  deletion_protection = var.deletion_protection

  release_channel { channel = "STABLE" }
  workload_identity_config { workload_pool = "${var.project_id}.svc.id.goog" }
  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = "172.16.0.0/28"
  }
  vertical_pod_autoscaling { enabled = true }
  resource_labels = local.labels
  depends_on      = [google_project_service.required]
}

resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "random_password" "redis" {
  length  = 32
  special = false
}

resource "random_password" "api_pepper" {
  length  = 48
  special = false
}

resource "random_password" "webhook_key" {
  length  = 48
  special = false
}

resource "google_sql_database_instance" "eventrail" {
  name                = local.name
  region              = var.region
  database_version    = "POSTGRES_17"
  deletion_protection = var.deletion_protection
  settings {
    tier                        = var.database_tier
    availability_type           = local.production ? "REGIONAL" : "ZONAL"
    deletion_protection_enabled = var.deletion_protection
    disk_type                   = "PD_SSD"
    disk_autoresize             = true
    user_labels                 = local.labels
    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.eventrail.id
      ssl_mode        = "ENCRYPTED_ONLY"
    }
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "03:00"
      transaction_log_retention_days = local.production ? 7 : 3
      backup_retention_settings {
        retained_backups = local.production ? 30 : 7
        retention_unit   = "COUNT"
      }
    }
    maintenance_window {
      day          = 7
      hour         = 4
      update_track = "stable"
    }
    insights_config {
      query_insights_enabled  = true
      record_application_tags = true
      record_client_address   = false
    }
  }
  depends_on = [google_service_networking_connection.private_services]
}

resource "google_sql_database" "eventrail" {
  name     = "eventrail"
  instance = google_sql_database_instance.eventrail.name
}

resource "google_sql_user" "eventrail" {
  name     = "eventrail_app"
  instance = google_sql_database_instance.eventrail.name
  password = random_password.postgres.result
}

resource "google_redis_instance" "eventrail" {
  name                    = local.name
  tier                    = local.production ? "STANDARD_HA" : "BASIC"
  memory_size_gb          = 1
  region                  = var.region
  redis_version           = "REDIS_7_2"
  authorized_network      = google_compute_network.eventrail.id
  connect_mode            = "PRIVATE_SERVICE_ACCESS"
  auth_enabled            = true
  transit_encryption_mode = "SERVER_AUTHENTICATION"
  labels                  = local.labels
  depends_on              = [google_service_networking_connection.private_services]
}

resource "google_artifact_registry_repository" "eventrail" {
  location      = var.region
  repository_id = local.name
  format        = "DOCKER"
  labels        = local.labels
  depends_on    = [google_project_service.required]
}

resource "google_storage_bucket" "recovery" {
  name                        = "${var.project_id}-${local.name}-recovery"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  versioning { enabled = true }
  retention_policy {
    retention_period = local.production ? 2592000 : 604800
  }
  lifecycle_rule {
    condition { age = local.production ? 90 : 30 }
    action { type = "Delete" }
  }
  labels = local.labels
}

resource "google_secret_manager_secret" "runtime" {
  secret_id = "${local.name}-runtime"
  replication {
    auto {}
  }
  labels     = local.labels
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "runtime" {
  secret = google_secret_manager_secret.runtime.id
  secret_data = jsonencode({
    DATABASE_URL        = "postgresql://eventrail_app:${random_password.postgres.result}@${google_sql_database_instance.eventrail.private_ip_address}:5432/eventrail?sslmode=require"
    REDIS_URL           = "rediss://:${google_redis_instance.eventrail.auth_string}@${google_redis_instance.eventrail.host}:${google_redis_instance.eventrail.port}"
    REDIS_CA_CERT       = google_redis_instance.eventrail.server_ca_certs[0].cert
    API_KEY_PEPPER      = random_password.api_pepper.result
    WEBHOOK_SIGNING_KEY = random_password.webhook_key.result
  })
}

resource "google_service_account" "deployer" {
  account_id   = "eventrail-${var.environment}-deploy"
  display_name = "EventRail ${var.environment} GitHub deployer"
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "eventrail-${var.environment}-github"
  display_name              = "EventRail ${var.environment} GitHub"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }
  attribute_condition = "assertion.sub == 'repo:${var.github_repository}:environment:${var.environment}'"
}

resource "google_service_account_iam_member" "github" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

resource "google_project_iam_member" "deployer_roles" {
  for_each = toset([
    "roles/artifactregistry.writer",
    "roles/container.developer",
    "roles/container.clusterViewer",
  ])
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_secret_manager_secret_iam_member" "deployer_runtime" {
  secret_id = google_secret_manager_secret.runtime.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.deployer.email}"
}

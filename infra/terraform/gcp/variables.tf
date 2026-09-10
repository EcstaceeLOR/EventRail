variable "project_id" {
  description = "Dedicated GCP project. Production must never share a project with preview or staging."
  type        = string
}

variable "environment" {
  description = "Isolated EventRail environment."
  type        = string
  validation {
    condition     = contains(["preview", "staging", "production"], var.environment)
    error_message = "environment must be preview, staging, or production."
  }
}

variable "region" {
  type    = string
  default = "europe-west1"
}

variable "github_repository" {
  type    = string
  default = "EcstaceeLOR/EventRail"
}

variable "database_tier" {
  type    = string
  default = "db-custom-1-3840"
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "labels" {
  type    = map(string)
  default = {}
}

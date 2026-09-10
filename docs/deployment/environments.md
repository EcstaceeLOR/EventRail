# Deployment environments

EventRail uses the same immutable OCI image in three isolated GCP projects. Preview proves pull-request integrations, staging is the production rehearsal, and production receives only an already-tested commit SHA. Each project owns a separate VPC, GKE Autopilot cluster, private Cloud SQL instance, private Memorystore instance, recovery bucket, Secret Manager secret, workload identity pool, and deployer service account.

## Provisioning

1. Create three empty GCP projects with billing enabled. Never reuse the production project for preview or staging.
2. Copy `infra/terraform/gcp/terraform.tfvars.example` to a file outside the repository and set the project and environment. Store Terraform state in a versioned, encrypted GCS bucket whose IAM is limited to infrastructure maintainers; state contains generated database credentials.
3. Run `terraform init`, `terraform plan -out plan.tfplan`, review it, then `terraform apply plan.tfplan` from `infra/terraform/gcp`.
4. Create matching GitHub environments: `preview`, `staging`, and `production`. Require reviewer approval for production. Configure the variables and secrets in the table below from Terraform outputs.
5. Run the Deploy workflow, read the provisioned GKE ingress address, and point all five DNS records to it. GKE then provisions and renews the chart's managed certificate; wait for every domain to become active before production smoke approval.

| GitHub setting                                                      | Source                                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| `GCP_PROJECT_ID`, `GCP_REGION`                                      | Terraform project and region                              |
| `GKE_CLUSTER_NAME`, `ARTIFACT_REPOSITORY`, `RUNTIME_SECRET_ID`      | Terraform outputs                                         |
| `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`      | Terraform outputs, stored as environment secrets          |
| `APP_HOST`, `API_HOST`, `DOCS_HOST`, `EXAMPLES_HOST`, `STATUS_HOST` | DNS names without `https://`                              |
| `APP_URL`, `GATEWAY_URL`, `DOCS_URL`, `EXAMPLES_URL`, `STATUS_URL`  | Public HTTPS URLs                                         |
| `SMOKE_ACCOUNT`                                                     | Read-only test wallet address                             |
| `SMOKE_API_KEY`                                                     | Dedicated, rate-limited production test credential        |
| `RESTORE_SOURCE_DATABASE_URL`, `RESTORE_TARGET_DATABASE_URL`        | Staging-only drill users; target ends in `_restore_drill` |

Production data credentials exist only in its Secret Manager and Kubernetes namespace. The Helm template mounts the runtime secret into the gateway and workers; browser workloads receive only non-sensitive ConfigMap values. The `deploy:validate` policy and infrastructure workflow enforce this boundary.

## Ownership and cost

The platform owner owns Terraform, Kubernetes, database recovery, and access review. The application owner owns releases, smoke results, and rollback. Product owns public incident communication. GKE Autopilot, Cloud SQL, Redis, retained backups, egress, and public load balancers are the principal costs; inspect GCP Billing by the `application=eventrail` and `environment` labels weekly.

For teardown, first export required evidence and backups, remove DNS, run a reviewed `terraform destroy` only for the exact non-production project, and delete that project. Production deletion protection is intentionally enabled and requires a separate reviewed change.

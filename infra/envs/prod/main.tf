# The stack of prod. The data bucket comes from the module that carries (or not)
# `prevent_destroy`, chosen here because that attribute takes no variable.
locals {
  data_bucket_name = "atlas-prod-data-${var.bucket_suffix}"
}

module "data_bucket" {
  source = "../../modules/data-bucket-protected"

  name = local.data_bucket_name
}

module "atlas" {
  source = "../../modules/atlas"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  env                      = "prod"
  region                   = var.region
  account_id               = var.account_id
  bucket_suffix            = var.bucket_suffix
  data_bucket_name         = module.data_bucket.name
  domain                   = var.domain
  mail_recipient           = var.mail_recipient
  mail_amounts             = var.mail_amounts
  enabled                  = true
  edge_mode                = var.edge_mode
  log_retention_days       = 30
  api_reserved_concurrency = var.reserve_api_concurrency ? var.api_reserved_concurrency : null
  oac_spa_id               = var.oac_spa_id
  oac_api_id               = var.oac_api_id
  artifact_key             = var.artifact_key
  artifact_sha256_base64   = var.artifact_sha256_base64

  mail_sender                      = var.mail_sender
  jobs_artifact_key                = var.jobs_artifact_key
  jobs_artifact_sha256_base64      = var.jobs_artifact_sha256_base64
  reserve_jobs_concurrency         = var.reserve_jobs_concurrency
  prices_eodhd_daily_calls         = var.prices_eodhd_daily_calls
  prices_alpha_vantage_daily_calls = var.prices_alpha_vantage_daily_calls
  prices_failure_threshold         = var.prices_failure_threshold
  oauth_idle_warning_days          = var.oauth_idle_warning_days
  ledger_size_warning_bytes        = var.ledger_size_warning_bytes
  enabled_jobs                     = ["ecb", "prices", "mail", "backup", "integrity"]
  price_sources                    = var.prices_sources
}

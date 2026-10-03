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
}

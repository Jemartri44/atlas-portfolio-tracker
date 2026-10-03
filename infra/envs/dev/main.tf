# The stack of dev. The data bucket comes from the module that carries (or not)
# `prevent_destroy`, chosen here because that attribute takes no variable.
locals {
  data_bucket_name = "atlas-dev-data-${var.bucket_suffix}"
}

module "data_bucket" {
  source = "../../modules/data-bucket"

  name = local.data_bucket_name
}

module "atlas" {
  source = "../../modules/atlas"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  env                      = "dev"
  region                   = var.region
  account_id               = var.account_id
  bucket_suffix            = var.bucket_suffix
  data_bucket_name         = module.data_bucket.name
  domain                   = var.domain
  mail_recipient           = var.mail_recipient
  mail_amounts             = var.mail_amounts
  enabled                  = var.dev_active
  edge_mode                = var.edge_mode
  log_retention_days       = 7
  api_reserved_concurrency = var.api_reserved_concurrency
  oac_spa_id               = var.oac_spa_id
  oac_api_id               = var.oac_api_id
  artifact_key             = var.artifact_key
  artifact_sha256_base64   = var.artifact_sha256_base64
}

variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "account_id" {
  type = string
}

variable "bucket_suffix" {
  type = string
}

variable "domain" {
  type      = string
  sensitive = true
}

variable "mail_recipient" {
  type      = string
  sensitive = true
}

variable "mail_amounts" {
  type    = string
  default = "off"
}

variable "edge_mode" {
  type = string

  validation {
    condition     = var.edge_mode == "free_plan"
    error_message = "prod always runs with the web ACL of the Free flat-rate plan (C11: pay_per_use is only for dev)."
  }
}

variable "api_reserved_concurrency" {
  type    = number
  default = null
}

variable "oac_spa_id" {
  description = "Output oac_spa_id of the bootstrap of this environment."
  type        = string
}

variable "oac_api_id" {
  description = "Output oac_api_id of the bootstrap of this environment."
  type        = string
}

variable "artifact_key" {
  type = string
}

variable "artifact_sha256_base64" {
  type = string
}

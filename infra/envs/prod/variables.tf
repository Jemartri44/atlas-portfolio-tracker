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

# C12. The formula (docs: ADR-0034 row 13; specs/017 questions.md, E2): reserve a few
# concurrent executions for the API so that a flood on this environment cannot use up
# the SSM read quota the account shares (40 reads a second, standard throughput, with
# other projects). One request reads about three parameters, so N executions are at
# most N x ~3 reads per request time; 1 for the development stack, 5 for production.
# The reservation must leave at least 100 unreserved in the account (Lambda). The
# 018 measures the duration of the fastest request and adjusts.
variable "api_reserved_concurrency" {
  type    = number
  default = 5

  validation {
    condition     = var.api_reserved_concurrency >= 1 && var.api_reserved_concurrency == floor(var.api_reserved_concurrency)
    error_message = "api_reserved_concurrency must be a whole number of at least 1."
  }
}

variable "reserve_api_concurrency" {
  description = "C12. false leaves the API unreserved, when the account has no margin to reserve."
  type        = bool
  default     = true
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

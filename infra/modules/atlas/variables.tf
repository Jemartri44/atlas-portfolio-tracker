variable "env" {
  type = string
  validation {
    condition     = can(regex("^(d[e]v|pr[o]d)$", var.env))
    error_message = "env must be one of the two environments."
  }
}

variable "region" {
  type    = string
  default = "eu-west-1"
  validation {
    condition     = var.region == "eu-west-1"
    error_message = "region must be eu-west-1."
  }
}

variable "account_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "account_id must be twelve digits."
  }
}

variable "bucket_suffix" {
  type = string
  validation {
    condition     = can(regex("^[a-z0-9]{6,16}$", var.bucket_suffix))
    error_message = "bucket_suffix must be 6 to 16 lowercase letters or digits."
  }
}

variable "data_bucket_name" {
  description = "Name of the data bucket, created by the module the root chose."
  type        = string

  validation {
    condition     = startswith(var.data_bucket_name, "atlas-${var.env}-data-") && can(regex("^[a-z0-9-]{3,63}$", var.data_bucket_name))
    error_message = "data_bucket_name must be atlas-<env>-data-<suffix>."
  }
}

variable "domain" {
  description = "The subdomain of the environment (sensitive, ADR-0034 row 1)."
  type        = string
  sensitive   = true
  validation {
    condition     = can(regex("^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,}$", var.domain))
    error_message = "domain must be a DNS name."
  }
}

variable "mail_recipient" {
  description = "Recipient of the monthly mail; written to /atlas/<env>/mail/recipient (ssm-and-config.md section 1)."
  type        = string
  sensitive   = true
  validation {
    condition     = can(regex("^[!-~]{1,64}@[!-~]{1,189}$", var.mail_recipient)) && !can(regex("[,<>]|@.*@", var.mail_recipient))
    error_message = "mail_recipient must be one plain address: ASCII, one @, no spaces, commas, < or >."
  }
}

variable "mail_amounts" {
  type    = string
  default = "off"
  validation {
    condition     = contains(["on", "off"], var.mail_amounts)
    error_message = "mail_amounts must be on or off."
  }
}

variable "enabled" {
  description = "Whether the distribution is enabled. The root of the development environment passes its activation lever (ADR-0034 rows 2 and 19)."
  type        = bool
}

variable "edge_mode" {
  description = "C11. free_plan: a web ACL with a rate rule, to be covered by the Free flat-rate plan. pay_per_use: no web ACL."
  type        = string
  validation {
    condition     = contains(["free_plan", "pay_per_use"], var.edge_mode)
    error_message = "edge_mode must be free_plan or pay_per_use."
  }
}

variable "rate_limit_per_5_minutes" {
  type    = number
  default = 300
  validation {
    condition     = var.rate_limit_per_5_minutes >= 10 && var.rate_limit_per_5_minutes <= 20000
    error_message = "rate limit out of range."
  }
}

variable "log_retention_days" {
  type = number
  validation {
    condition     = contains([7, 30], var.log_retention_days)
    error_message = "retention is 7 or 30 days."
  }
}

variable "api_reserved_concurrency" {
  description = "C12. Reserved concurrency of the API: a whole number of at least 1, or null to leave it unreserved (the root decides; no default here)."
  type        = number
  nullable    = true

  validation {
    condition     = var.api_reserved_concurrency == null || try(var.api_reserved_concurrency >= 1 && var.api_reserved_concurrency == floor(var.api_reserved_concurrency), false)
    error_message = "api_reserved_concurrency must be a whole number of at least 1, or null."
  }
}

variable "artifact_key" {
  description = "Key of lambda.zip in the artifacts bucket (built once and promoted)."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9._/-]{0,500}$", var.artifact_key)) && !strcontains(var.artifact_key, "..")
    error_message = "artifact_key must be a relative key with no .. segment."
  }
}

variable "artifact_sha256_base64" {
  description = "Base64 SHA-256 of lambda.zip."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9+/]{43}=$", var.artifact_sha256_base64))
    error_message = "artifact_sha256_base64 must be the base64 of a SHA-256 digest (44 characters)."
  }
}

variable "mail_sender" {
  description = "The verified sender of the mail (the identity is created by the bootstrap of the account); goes to ATLAS_MAIL_FROM and to the SES condition of the mail role."
  type        = string

  validation {
    condition     = can(regex("^[!-~]{1,64}@[!-~]{1,189}$", var.mail_sender)) && !can(regex("[,<>]|@.*@", var.mail_sender))
    error_message = "mail_sender must be one plain address: ASCII, one @, no spaces, commas, < or >."
  }
}

variable "jobs_artifact_key" {
  description = "Key of jobs.zip in the artifacts bucket (built once and promoted)."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9][A-Za-z0-9._/-]{0,500}$", var.jobs_artifact_key)) && !strcontains(var.jobs_artifact_key, "..")
    error_message = "jobs_artifact_key must be a relative key with no .. segment."
  }
}

variable "jobs_artifact_sha256_base64" {
  description = "Base64 SHA-256 of jobs.zip."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9+/]{43}=$", var.jobs_artifact_sha256_base64))
    error_message = "jobs_artifact_sha256_base64 must be the base64 of a SHA-256 digest (44 characters)."
  }
}

variable "enabled_jobs" {
  description = "The schedules that are ENABLED: the families named here. The root of the development environment passes its lever (default none); the production one passes all five (ADR-0034, row 2)."
  type        = set(string)

  validation {
    condition     = alltrue([for job in var.enabled_jobs : contains(["ecb", "prices", "mail", "backup", "integrity"], job)])
    error_message = "enabled_jobs may only name ecb, prices, mail, backup or integrity."
  }
}

variable "reserve_jobs_concurrency" {
  description = "C12. Each task reserves 1 execution (ADR-0029); false leaves them unreserved, when the account has no margin."
  type        = bool
}

variable "price_sources" {
  description = "ATLAS_PRICE_SOURCES of the prices function, in the order of the cascade. `simulated` stands alone and only in the development environment (ssm-and-config.md section 2)."
  type        = list(string)

  validation {
    condition     = length(var.price_sources) >= 1 && length(distinct(var.price_sources)) == length(var.price_sources) && ((length(var.price_sources) == 1 && contains(var.price_sources, "simulated")) || alltrue([for s in var.price_sources : contains(["eodhd", "alpha_vantage"], s)]))
    error_message = "price_sources is eodhd and/or alpha_vantage without repeats, or [\"simulated\"] alone."
  }

  validation {
    condition     = !contains(var.price_sources, "simulated") || can(regex("^d[e]v$", var.env))
    error_message = "the simulated source is only for the development environment."
  }
}

variable "prices_eodhd_daily_calls" {
  type = number

  validation {
    condition     = var.prices_eodhd_daily_calls >= 0 && var.prices_eodhd_daily_calls <= 20 && var.prices_eodhd_daily_calls == floor(var.prices_eodhd_daily_calls)
    error_message = "prices_eodhd_daily_calls is a whole number from 0 to 20."
  }
}

variable "prices_alpha_vantage_daily_calls" {
  type = number

  validation {
    condition     = var.prices_alpha_vantage_daily_calls >= 0 && var.prices_alpha_vantage_daily_calls <= 25 && var.prices_alpha_vantage_daily_calls == floor(var.prices_alpha_vantage_daily_calls)
    error_message = "prices_alpha_vantage_daily_calls is a whole number from 0 to 25."
  }
}

variable "prices_failure_threshold" {
  type = number

  validation {
    condition     = var.prices_failure_threshold >= 1 && var.prices_failure_threshold <= 30 && var.prices_failure_threshold == floor(var.prices_failure_threshold)
    error_message = "prices_failure_threshold is a whole number from 1 to 30."
  }
}

variable "oauth_idle_warning_days" {
  type = number

  validation {
    condition     = var.oauth_idle_warning_days >= 1 && var.oauth_idle_warning_days <= 179 && var.oauth_idle_warning_days == floor(var.oauth_idle_warning_days)
    error_message = "oauth_idle_warning_days is a whole number from 1 to 179 (Google deletes an idle client at six months)."
  }
}

variable "ledger_size_warning_bytes" {
  type = number

  validation {
    condition     = var.ledger_size_warning_bytes >= 1024 && var.ledger_size_warning_bytes <= 104857600 && var.ledger_size_warning_bytes == floor(var.ledger_size_warning_bytes)
    error_message = "ledger_size_warning_bytes is a whole number from 1,024 to 104,857,600."
  }
}

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
    condition     = contains(["free_plan", "pay_per_use"], var.edge_mode)
    error_message = "edge_mode must be free_plan or pay_per_use (C11)."
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
  default = 1

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

variable "dev_active" {
  description = "The only lever of the distribution of dev (ADR-0034, rows 2 and 19): false keeps it disabled."
  type        = bool
  default     = false
}

variable "mail_sender" {
  description = "The verified sender of the mail (ATLAS_MAIL_FROM and the SES condition of the mail role)."
  type        = string
}

variable "jobs_artifact_key" {
  type = string
}

variable "jobs_artifact_sha256_base64" {
  type = string
}

# C12. Each task reserves 1 execution (ADR-0029); false leaves them unreserved, when the
# account has no margin to reserve (Lambda: the unreserved quota minus 100).
variable "reserve_jobs_concurrency" {
  type    = bool
  default = true
}

# The budgets of the prices function (ssm-and-config.md, section 2; ADR-0031): the free
# quotas of the sources are 20 and 25 calls a day. Changing one is changing terraform.tfvars.
variable "prices_eodhd_daily_calls" {
  type    = number
  default = 18

  validation {
    condition     = var.prices_eodhd_daily_calls >= 0 && var.prices_eodhd_daily_calls <= 20 && var.prices_eodhd_daily_calls == floor(var.prices_eodhd_daily_calls)
    error_message = "prices_eodhd_daily_calls is a whole number from 0 to 20."
  }
}

variable "prices_alpha_vantage_daily_calls" {
  type    = number
  default = 23

  validation {
    condition     = var.prices_alpha_vantage_daily_calls >= 0 && var.prices_alpha_vantage_daily_calls <= 25 && var.prices_alpha_vantage_daily_calls == floor(var.prices_alpha_vantage_daily_calls)
    error_message = "prices_alpha_vantage_daily_calls is a whole number from 0 to 25."
  }
}

variable "prices_failure_threshold" {
  type    = number
  default = 3

  validation {
    condition     = var.prices_failure_threshold >= 1 && var.prices_failure_threshold <= 30 && var.prices_failure_threshold == floor(var.prices_failure_threshold)
    error_message = "prices_failure_threshold is a whole number from 1 to 30."
  }
}

variable "oauth_idle_warning_days" {
  type    = number
  default = 150

  validation {
    condition     = var.oauth_idle_warning_days >= 1 && var.oauth_idle_warning_days <= 179 && var.oauth_idle_warning_days == floor(var.oauth_idle_warning_days)
    error_message = "oauth_idle_warning_days is a whole number from 1 to 179."
  }
}

variable "ledger_size_warning_bytes" {
  type    = number
  default = 1048576

  validation {
    condition     = var.ledger_size_warning_bytes >= 1024 && var.ledger_size_warning_bytes <= 104857600 && var.ledger_size_warning_bytes == floor(var.ledger_size_warning_bytes)
    error_message = "ledger_size_warning_bytes is a whole number from 1,024 to 104,857,600."
  }
}

# The lever of the schedules of the development environment (ADR-0034, row 2): none is
# ENABLED unless it is named here, from the pipeline, never by hand. The 018 enables one,
# once, with the simulated price source.
variable "dev_active_jobs" {
  type    = set(string)
  default = []

  validation {
    condition     = alltrue([for job in var.dev_active_jobs : contains(["ecb", "prices", "mail", "backup", "integrity"], job)])
    error_message = "dev_active_jobs may only name ecb, prices, mail, backup or integrity."
  }
}

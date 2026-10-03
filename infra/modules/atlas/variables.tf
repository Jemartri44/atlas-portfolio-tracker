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
  description = "C12. A number of at least 1, or null to leave the function unreserved."
  type        = number
  default     = null
  validation {
    condition     = var.api_reserved_concurrency == null || try(var.api_reserved_concurrency >= 1, false)
    error_message = "api_reserved_concurrency must be at least 1 or null."
  }
}

variable "artifact_key" {
  description = "Key of lambda.zip in the artifacts bucket (built once and promoted)."
  type        = string
}

variable "artifact_sha256_base64" {
  description = "Base64 SHA-256 of lambda.zip."
  type        = string
}

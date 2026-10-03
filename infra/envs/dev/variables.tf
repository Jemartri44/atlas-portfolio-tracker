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

variable "dev_active" {
  description = "The only lever of the distribution of dev (ADR-0034, rows 2 and 19): false keeps it disabled."
  type        = bool
  default     = false
}

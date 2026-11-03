# The OAC are created by the bootstrap of the environment (they admit no tag, so the
# deploy role cannot be scoped over them: research b0.3); this stack only receives
# their identifiers.
variable "oac_spa_id" {
  type = string

  validation {
    condition     = can(regex("^[A-Z0-9]{10,20}$", var.oac_spa_id))
    error_message = "oac_spa_id must be a CloudFront identifier."
  }
}

variable "oac_api_id" {
  type = string

  validation {
    condition     = can(regex("^[A-Z0-9]{10,20}$", var.oac_api_id))
    error_message = "oac_api_id must be a CloudFront identifier."
  }
}

# The certificate is requested by the same bootstrap (ACM admits a tag, but the deploy role
# is not scoped over it: finding 1 of the security audit); the stack only waits for its
# validation and attaches it.
variable "certificate_arn" {
  type = string

  validation {
    condition     = can(regex("^arn:aws:acm:us-east-1:[0-9]{12}:certificate/[0-9a-f-]{36}$", var.certificate_arn))
    error_message = "certificate_arn must be a certificate of us-east-1 (output certificate_arn of the bootstrap)."
  }
}

locals {
  oac_spa_id = var.oac_spa_id
  oac_api_id = var.oac_api_id
}

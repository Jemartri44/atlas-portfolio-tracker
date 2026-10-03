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

locals {
  oac_spa_id = var.oac_spa_id
  oac_api_id = var.oac_api_id
}

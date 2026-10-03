# The OAC are created by the bootstrap of the environment (they admit no tag, so the
# deploy role cannot be scoped over them: research b0.3); this stack only receives
# their identifiers.
variable "oac_spa_id" {
  type = string
}

variable "oac_api_id" {
  type = string
}

locals {
  oac_spa_id = var.oac_spa_id
  oac_api_id = var.oac_api_id
}

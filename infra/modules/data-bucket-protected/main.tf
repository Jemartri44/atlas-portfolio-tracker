# The data bucket WITH `prevent_destroy`: the protected one (prompt 017, §12 P8). Same interface as `data-bucket`.
variable "name" {
  description = "Bucket name, atlas-<env>-data-<suffix>, built by the root."
  type        = string
}

resource "aws_s3_bucket" "this" {
  bucket        = var.name
  force_destroy = false

  lifecycle {
    prevent_destroy = true
  }
}

output "name" {
  value = var.name
}

output "arn" {
  value = "arn:aws:s3:::${var.name}"
}

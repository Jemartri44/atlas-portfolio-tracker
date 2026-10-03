# The data bucket without `prevent_destroy`: the unprotected one, which the rehearsal of
# 018 destroys (prompt 017, §12 P8). `prevent_destroy` takes no variable, so the root of
# each environment picks this module or its protected twin (same interface); the
# configuration and the policy of the bucket live in `modules/atlas`.
variable "name" {
  description = "Bucket name, atlas-<env>-data-<suffix>, built by the root."
  type        = string
}

resource "aws_s3_bucket" "this" {
  bucket        = var.name
  force_destroy = false
}

output "name" {
  # From the resource, so what is configured on the bucket waits for it.
  value = aws_s3_bucket.this.bucket
}

output "arn" {
  value = "arn:aws:s3:::${var.name}"
}

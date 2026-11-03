# The data bucket WITH `prevent_destroy`: the protected one (prompt 017, §12 P8). Same interface as `data-bucket`; the production bootstrap uses it.
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
  # From the resource, so what is configured on the bucket waits for it.
  value = aws_s3_bucket.this.bucket
}

output "arn" {
  value = "arn:aws:s3:::${var.name}"
}

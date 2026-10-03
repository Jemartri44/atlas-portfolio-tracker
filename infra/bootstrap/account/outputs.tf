# Bucket names carry the suffix, which is personal: sensitive (prompt 017, §12.2 B3).
output "tfstate_bucket" {
  description = "Bucket of the Terraform state of the environments."
  value       = aws_s3_bucket.tfstate.bucket
  sensitive   = true
}

output "artifacts_bucket" {
  description = "Bucket through which the artifact built in dev travels to prod."
  value       = aws_s3_bucket.artifacts.bucket
  sensitive   = true
}

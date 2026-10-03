# None carries the domain, a bucket suffix or an address (prompt 017, §12.2 B3).
output "api_function_name" {
  value = aws_lambda_function.api.function_name
}

output "distribution_id" {
  value = aws_cloudfront_distribution.this.id
}

output "spa_bucket_name" {
  description = "Carries the bucket suffix, so it is sensitive (prompt 017, §12.2 B3)."
  value       = local.spa_name
  sensitive   = true
}

# Read by `terraform test` (the attributes of a module's resources are not reachable).
output "web_acl_count" {
  value = length(aws_wafv2_web_acl.this)
}

output "distribution_enabled" {
  value = aws_cloudfront_distribution.this.enabled
}

output "api_reserved_concurrency" {
  value = aws_lambda_function.api.reserved_concurrent_executions
}

output "job_function_names" {
  value = [for job in local.job_names : aws_lambda_function.job[job].function_name]
}

output "schedule_states" {
  value = { for job in local.job_names : job => aws_scheduler_schedule.job[job].state }
}

output "jobs_reserved_concurrency" {
  value = { for job in local.job_names : job => aws_lambda_function.job[job].reserved_concurrent_executions }
}

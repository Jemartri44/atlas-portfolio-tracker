# Read by `terraform test` (the attributes of a module's resources are not reachable). None carries
# the domain, a bucket suffix or an address (prompt 017, §12.2 B3).
output "web_acl_count" {
  value = length(aws_wafv2_web_acl.this)
}

output "distribution_enabled" {
  value = aws_cloudfront_distribution.this.enabled
}

output "api_reserved_concurrency" {
  value = aws_lambda_function.api.reserved_concurrent_executions
}

output "schedule_states" {
  value = { for job in local.job_names : job => aws_scheduler_schedule.job[job].state }
}

output "jobs_reserved_concurrency" {
  value = { for job in local.job_names : job => aws_lambda_function.job[job].reserved_concurrent_executions }
}

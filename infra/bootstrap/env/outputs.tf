# The stack of the environment (E2) reads these; none carries a bucket suffix or an
# address, so none is sensitive, except the DNS records of the certificate, which carry the
# domain (prompt 017, §12.2 B3). The account
# identifier is in every ARN and is not sensitive (ADR-0034, row 1).
output "boundary_policy_arn" {
  description = "The permissions boundary every role of the environment carries."
  value       = local.boundary_arn
}

output "deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}

output "plan_role_arn" {
  value = aws_iam_role.plan.arn
}

output "admin_role_arn" {
  value = aws_iam_role.admin.arn
}

output "oac_spa_id" {
  description = "OAC of the SPA bucket origin."
  value       = aws_cloudfront_origin_access_control.spa.id
}

output "oac_api_id" {
  description = "OAC of the Function URL origin."
  value       = aws_cloudfront_origin_access_control.api.id
}

output "certificate_arn" {
  description = "ARN of the certificate of the distribution (us-east-1); the stack waits for its validation."
  value       = aws_acm_certificate.edge.arn
}

output "certificate_validation_records" {
  description = "The DNS record that validates the certificate, to create by hand."
  value = [for option in aws_acm_certificate.edge.domain_validation_options : {
    name  = option.resource_record_name
    type  = option.resource_record_type
    value = option.resource_record_value
  }]
  sensitive = true
}

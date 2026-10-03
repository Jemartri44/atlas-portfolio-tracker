# The stack of the environment (E2) reads these; none carries the domain, a bucket
# suffix or an address, so none is sensitive (prompt 017, §12.2 B3). The account
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

output "kms_key_arn" {
  description = "ARN of the customer managed key (C2), or null."
  value       = one(aws_kms_key.ssm[*].arn)
}

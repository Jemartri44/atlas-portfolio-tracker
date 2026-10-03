# The permissions boundary of the environment (ADR-0034, row 4; prompt 017, E1
# block 3). Every role of Atlas in this environment carries it. It is a ceiling: it
# grants nothing by itself, and a role gets what its own policy says, as far as this
# allows. Statements are written compactly (prefix wildcards such as `lambda:Get*`,
# never `*` nor `<service>:*`, which the suite refuses) because a managed policy
# cannot exceed 6,144 characters; the suite measures it.
#
# Exceptions to "only resources with the prefixes of the environment" (prompt 017,
# §12.2 B4), each one on purpose: IAM for the deploy role and its reads for the plan
# role; the account buckets (S3 ARNs only, kept apart per environment by the two
# locks); `ses:SendEmail` on the sender's identities, which carry no prefix (row
# 12); CloudFront, ACM and WAF, whose ARN carries a generated identifier and so are
# scoped by tag; and `us-east-1`, only for those and for IAM.
#
# NOT here, on purpose: `kms:Decrypt` on `aws/ssm` (E2 block 0, point 4), and the
# SES identity of the recipient (E3). Neither is silently widened.

locals {
  boundary_home = { StringEquals = { "aws:RequestedRegion" = [local.home] } }
  boundary_edge = { StringEquals = { "aws:RequestedRegion" = [local.edge] } }

  boundary_allow = [
    {
      # The services of the home region, on the resources with the prefix of the
      # environment, in one statement: separate ones would not fit in 6,144.
      sid    = "Home"
      effect = "Allow"
      actions = [
        "lambda:AddPermission",
        "lambda:Create*",
        "lambda:Delete*",
        "lambda:Get*",
        "lambda:InvokeFunction",
        "lambda:List*",
        "lambda:Put*",
        "lambda:RemovePermission",
        "lambda:TagResource",
        "lambda:UntagResource",
        "lambda:Update*",
        "logs:Create*",
        "logs:Delete*",
        "logs:ListTagsForResource",
        "logs:Put*",
        "logs:TagResource",
        "logs:UntagResource",
        "s3:CreateBucket",
        "s3:Get*",
        "s3:List*",
        "s3:Put*",
        "scheduler:Create*",
        "scheduler:Delete*",
        "scheduler:Get*",
        "scheduler:ListTagsForResource",
        "scheduler:TagResource",
        "scheduler:UntagResource",
        "scheduler:UpdateSchedule",
        "ssm:AddTagsToResource",
        "ssm:DeleteParameter",
        "ssm:Get*",
        "ssm:ListTagsForResource",
        "ssm:PutParameter",
        "ssm:RemoveTagsFromResource",
      ]
      resources = [
        local.lambda_fn,
        local.logs_group,
        local.scheduler_group,
        local.scheduler_item,
        "${local.ssm_base}/*",
        "arn:aws:s3:::${local.prefix}-*",
        "arn:aws:s3:::${local.prefix}-*/*",
      ]
      condition = local.boundary_home
    },
    {
      sid       = "LogsDescribe"
      effect    = "Allow"
      actions   = ["logs:DescribeLogGroups"]
      resources = ["*"]
      condition = local.boundary_home
    },
    {
      sid       = "Deletes"
      effect    = "Allow"
      actions   = ["s3:DeleteBucket", "s3:DeleteObject"]
      resources = [local.s3_spa, "${local.s3_spa}/*", "${local.s3_data}/reference/ecb/manifest.json", "${local.s3_data}/jobs/ecb/ecb_update/*"]
      condition = local.boundary_home
    },
    {
      sid       = "AccountBuckets"
      effect    = "Allow"
      actions   = ["s3:DeleteObject", "s3:GetObject", "s3:ListBucket", "s3:PutObject"]
      resources = ["arn:aws:s3:::atlas-account-*", "arn:aws:s3:::atlas-account-*/*"]
      condition = local.boundary_home
    },
    {
      sid       = "SesSend"
      effect    = "Allow"
      actions   = ["ses:SendEmail"]
      resources = ["arn:aws:ses:${local.home}:${local.acct}:identity/${var.mail_sender}", "arn:aws:ses:${local.home}:${local.acct}:identity/${local.mail_sender_host}"]
      condition = { StringEquals = { "aws:RequestedRegion" = [local.home], "ses:FromAddress" = var.mail_sender } }
    },
    {
      sid    = "Edge"
      effect = "Allow"
      actions = [
        "acm:AddTagsToCertificate",
        "acm:Delete*",
        "acm:Describe*",
        "acm:Get*",
        "acm:ListTagsForCertificate",
        "acm:RemoveTagsFromCertificate",
        "acm:RequestCertificate",
        "cloudfront:Create*",
        "cloudfront:Delete*",
        "cloudfront:Describe*",
        "cloudfront:Get*",
        "cloudfront:List*",
        "cloudfront:PublishFunction",
        "cloudfront:TagResource",
        "cloudfront:UntagResource",
        "cloudfront:Update*",
        "wafv2:Create*",
        "wafv2:Delete*",
        "wafv2:Get*",
        "wafv2:ListTagsForResource",
        "wafv2:TagResource",
        "wafv2:UntagResource",
        "wafv2:Update*",
      ]
      resources = [local.cf_distribution, local.cf_function, local.acm_certificate, local.waf_web_acl]
      condition = merge(local.boundary_edge, { StringEqualsIfExists = { "aws:ResourceTag/env" = var.env } })
    },
    {
      # Actions that take no resource type (SAR): only the request tag can scope them.
      sid       = "EdgeCreate"
      effect    = "Allow"
      actions   = ["acm:RequestCertificate", "cloudfront:CreateDistribution", "cloudfront:CreateFunction"]
      resources = ["*"]
      condition = { StringEquals = { "aws:RequestedRegion" = [local.edge], "aws:RequestTag/env" = var.env } }
    },
    {
      sid       = "EdgeReads"
      effect    = "Allow"
      actions   = ["cloudfront:Get*"]
      resources = local.cf_untagged
      condition = local.boundary_edge
    },
    {
      sid       = "IamWrite"
      effect    = "Allow"
      actions   = ["iam:CreateRole", "iam:DeleteRolePolicy", "iam:PutRolePolicy", "iam:UpdateAssumeRolePolicy"]
      resources = [local.iam_roles]
      condition = { StringEquals = { "aws:RequestedRegion" = [local.home, local.edge], "iam:PermissionsBoundary" = local.boundary_arn } }
    },
    {
      sid       = "IamOther"
      effect    = "Allow"
      actions   = ["iam:DeleteRole", "iam:Get*", "iam:List*", "iam:TagRole", "iam:UntagRole", "iam:UpdateRoleDescription"]
      resources = [local.iam_roles, local.iam_policies]
      condition = { StringEquals = { "aws:RequestedRegion" = [local.home, local.edge] } }
    },
    {
      sid       = "PassToLambda"
      effect    = "Allow"
      actions   = ["iam:PassRole"]
      resources = concat([local.role_arn.api], local.job_role_arns)
      condition = { StringEquals = { "aws:RequestedRegion" = [local.home, local.edge], "iam:PassedToService" = "lambda.amazonaws.com" } }
    },
    {
      sid       = "PassToScheduler"
      effect    = "Allow"
      actions   = ["iam:PassRole"]
      resources = [local.role_arn.scheduler]
      condition = { StringEquals = { "aws:RequestedRegion" = [local.home, local.edge], "iam:PassedToService" = "scheduler.amazonaws.com" } }
    },
  ]

  boundary_deny = [
    {
      # Nothing of the organization, the account or the bill, whatever a policy says.
      sid       = "DenyOrgAccountBilling"
      effect    = "Deny"
      actions   = ["account:*", "aws-portal:*", "billing:*", "budgets:*", "ce:*", "cur:*", "organizations:*", "payments:*", "tax:*"]
      resources = ["*"]
    },
    {
      # No role of the environment, whatever its policy says, writes IAM on the
      # roles of the bootstrap or on the policies of the environment (row 4: no IAM
      # but the deploy role's, and row 5: nobody touches the bootstrap).
      sid       = "DenyBootstrapIam"
      effect    = "Deny"
      actions   = ["iam:Attach*", "iam:Create*", "iam:Delete*", "iam:Detach*", "iam:Put*", "iam:Set*", "iam:Tag*", "iam:Untag*", "iam:Update*"]
      resources = concat(local.bootstrap_role_arns, [local.iam_policies])
    },
    {
      sid       = "DenyOtherRegions"
      effect    = "Deny"
      actions   = ["*"]
      resources = ["*"]
      condition = { StringNotEquals = { "aws:RequestedRegion" = [local.home, local.edge] } }
    },
  ]

  boundary_statements = concat(local.boundary_allow, local.boundary_deny)
}

resource "aws_iam_policy" "boundary" {
  name        = "${local.prefix}-boundary"
  description = "Permissions boundary of every role of Atlas in ${var.env}."
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [for s in local.boundary_statements : merge(
      { Sid = s.sid, Effect = s.effect, Action = s.actions, Resource = s.resources },
      try(s.condition, null) == null ? {} : { Condition = s.condition },
    )]
  })
}

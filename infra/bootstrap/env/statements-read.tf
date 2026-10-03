# What the plan role reads, and what the deploy role also needs to read to refresh
# before it changes. Metadata only: no object of any bucket, no secret (row 21).
# Resources are scoped by name where the ARN carries it, and by the `env` tag where
# it carries only a generated identifier (CloudFront, ACM, WAF; research b0.2).
# Each statement is {sid, effect, actions, resources, condition}; the policy
# documents are built with `jsonencode` so that they are known at plan time.

locals {
  read_statements = [
    {
      sid    = "LambdaRead"
      effect = "Allow"
      actions = [
        "lambda:GetFunction",
        "lambda:GetFunctionCodeSigningConfig",
        "lambda:GetFunctionConcurrency",
        "lambda:GetFunctionConfiguration",
        "lambda:GetFunctionUrlConfig",
        "lambda:GetPolicy",
        "lambda:GetRuntimeManagementConfig",
        "lambda:ListTags",
        "lambda:ListVersionsByFunction",
      ]
      resources = [local.lambda_fn]
    },
    {
      sid       = "LogsRead"
      effect    = "Allow"
      actions   = ["logs:ListTagsForResource"]
      resources = [local.logs_group]
    },
    {
      # No resource type and no condition key in the Service Authorization
      # Reference: the one `Resource: "*"` of the closed list.
      sid       = "LogsDescribe"
      effect    = "Allow"
      actions   = ["logs:DescribeLogGroups"]
      resources = ["*"]
    },
    {
      sid       = "SsmStringsRead"
      effect    = "Allow"
      actions   = ["ssm:GetParameter", "ssm:ListTagsForResource"]
      resources = [local.ssm_strings]
    },
    {
      sid       = "SchedulerRead"
      effect    = "Allow"
      actions   = ["scheduler:GetScheduleGroup", "scheduler:ListTagsForResource"]
      resources = [local.scheduler_group]
    },
    {
      sid       = "SchedulerScheduleRead"
      effect    = "Allow"
      actions   = ["scheduler:GetSchedule"]
      resources = [local.scheduler_item]
    },
    {
      sid       = "DataBucketConfigurationRead"
      effect    = "Allow"
      actions   = local.bucket_read_actions
      resources = [local.s3_data]
    },
    {
      sid       = "SpaBucketConfigurationRead"
      effect    = "Allow"
      actions   = local.bucket_read_actions
      resources = [local.s3_spa]
    },
    {
      sid       = "CloudFrontDistributionRead"
      effect    = "Allow"
      actions   = ["cloudfront:GetDistribution", "cloudfront:GetDistributionConfig", "cloudfront:ListTagsForResource"]
      resources = [local.cf_distribution]
      condition = local.tag_env_equals
    },
    {
      sid       = "CloudFrontFunctionRead"
      effect    = "Allow"
      actions   = ["cloudfront:DescribeFunction", "cloudfront:GetFunction", "cloudfront:ListTagsForResource"]
      resources = [local.cf_function]
      condition = local.tag_env_equals
    },
    {
      # The OAC and the policies of the distribution are created by the bootstrap
      # (they admit no tag): the deploy only reads them (research b0.3).
      sid       = "CloudFrontBootstrapRead"
      effect    = "Allow"
      actions   = ["cloudfront:GetCachePolicy", "cloudfront:GetOriginAccessControl", "cloudfront:GetOriginRequestPolicy", "cloudfront:GetResponseHeadersPolicy"]
      resources = local.cf_untagged
    },
    {
      sid       = "AcmRead"
      effect    = "Allow"
      actions   = ["acm:DescribeCertificate", "acm:GetCertificate", "acm:ListTagsForCertificate"]
      resources = [local.acm_certificate]
      condition = local.tag_env_equals
    },
    {
      sid       = "WafRead"
      effect    = "Allow"
      actions   = ["wafv2:GetWebACL", "wafv2:ListTagsForResource"]
      resources = [local.waf_web_acl]
      condition = local.tag_env_equals
    },
    {
      sid       = "IamRead"
      effect    = "Allow"
      actions   = ["iam:GetRole", "iam:GetRolePolicy", "iam:ListAttachedRolePolicies", "iam:ListInstanceProfilesForRole", "iam:ListRolePolicies", "iam:ListRoleTags"]
      resources = [local.iam_roles]
    },
    {
      sid       = "IamPolicyRead"
      effect    = "Allow"
      actions   = ["iam:GetPolicy", "iam:GetPolicyVersion", "iam:ListPolicyVersions"]
      resources = [local.iam_policies]
    },
  ]

  # Only the plan role: the state of its own environment, read, never written. The
  # plan of the CI runs with `-lock=false`, so it needs no lock file either.
  plan_statements = [
    {
      sid       = "StateRead"
      effect    = "Allow"
      actions   = ["s3:GetObject"]
      resources = ["${local.s3_tfstate}/envs/${var.env}/terraform.tfstate"]
    },
    {
      sid       = "StateList"
      effect    = "Allow"
      actions   = ["s3:ListBucket"]
      resources = [local.s3_tfstate]
      condition = { StringLike = { "s3:prefix" = "envs/${var.env}/*" } }
    },
  ]
}

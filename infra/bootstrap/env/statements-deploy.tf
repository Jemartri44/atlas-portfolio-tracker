# What the deploy role adds to the reads (ADR-0034, row 5; prompt 017, E1 block 3).
# Names scope what the ARN names; the `env` tag scopes CloudFront, ACM and WAF, which
# carry a generated identifier (`aws:RequestTag` when creating, `aws:ResourceTag` when
# changing). It never has an object action on the data bucket, a change action on the
# OAC or the CloudFront policies, a `GetParameter` on a secret or any `kms:Decrypt`.

locals {
  # Only dev writes the artifact; prod only reads what dev built (prompt 017, §12.2 B6).
  artifact_object_actions = var.env == "dev" ? ["s3:GetObject", "s3:PutObject"] : ["s3:GetObject"]

  tag_actions = [
    "acm:AddTagsToCertificate",
    "acm:RemoveTagsFromCertificate",
    "cloudfront:TagResource",
    "cloudfront:UntagResource",
    "iam:TagRole",
    "iam:UntagRole",
    "lambda:TagResource",
    "lambda:UntagResource",
    "logs:TagResource",
    "logs:UntagResource",
    "s3:PutBucketTagging",
    "scheduler:TagResource",
    "scheduler:UntagResource",
    "ssm:AddTagsToResource",
    "ssm:RemoveTagsFromResource",
    "wafv2:TagResource",
    "wafv2:UntagResource",
  ]

  iam_bootstrap_role_actions = [
    "iam:AttachRolePolicy",
    "iam:CreateRole",
    "iam:DeleteRole",
    "iam:DeleteRolePermissionsBoundary",
    "iam:DeleteRolePolicy",
    "iam:DetachRolePolicy",
    "iam:PutRolePermissionsBoundary",
    "iam:PutRolePolicy",
    "iam:TagRole",
    "iam:UntagRole",
    "iam:UpdateAssumeRolePolicy",
    "iam:UpdateRole",
    "iam:UpdateRoleDescription",
  ]

  deploy_workload_statements = [
    {
      sid    = "LambdaWrite"
      effect = "Allow"
      actions = [
        "lambda:AddPermission",
        "lambda:CreateFunction",
        "lambda:CreateFunctionUrlConfig",
        "lambda:DeleteFunction",
        "lambda:DeleteFunctionConcurrency",
        "lambda:DeleteFunctionUrlConfig",
        "lambda:PutFunctionConcurrency",
        "lambda:RemovePermission",
        "lambda:TagResource",
        "lambda:UntagResource",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:UpdateFunctionUrlConfig",
      ]
      resources = [local.lambda_fn]
    },
    {
      sid       = "LogsWrite"
      effect    = "Allow"
      actions   = ["logs:CreateLogGroup", "logs:DeleteLogGroup", "logs:DeleteRetentionPolicy", "logs:PutRetentionPolicy", "logs:TagResource", "logs:UntagResource"]
      resources = [local.logs_group]
    },
    {
      sid       = "SsmStringsWrite"
      effect    = "Allow"
      actions   = ["ssm:AddTagsToResource", "ssm:DeleteParameter", "ssm:PutParameter", "ssm:RemoveTagsFromResource"]
      resources = [local.ssm_strings]
    },
    {
      sid    = "SchedulerGroupWrite"
      effect = "Allow"
      actions = [
        "scheduler:CreateScheduleGroup",
        "scheduler:DeleteScheduleGroup",
        "scheduler:TagResource",
        "scheduler:UntagResource",
      ]
      resources = [local.scheduler_group]
    },
    {
      sid       = "SchedulerScheduleWrite"
      effect    = "Allow"
      actions   = ["scheduler:CreateSchedule", "scheduler:DeleteSchedule", "scheduler:UpdateSchedule"]
      resources = [local.scheduler_item]
    },
    {
      sid       = "SpaBucketConfigurationWrite"
      effect    = "Allow"
      actions   = concat(local.bucket_config_actions, ["s3:DeleteBucket"])
      resources = [local.s3_spa]
    },
    {
      sid       = "SpaBucketObjects"
      effect    = "Allow"
      actions   = ["s3:DeleteObject", "s3:PutObject"]
      resources = ["${local.s3_spa}/*"]
    },
    {
      # Bucket actions only (prompt 017, §12.2 B1): never GetObject or PutObject.
      sid       = "DataBucketConfigurationWrite"
      effect    = "Allow"
      actions   = local.bucket_config_actions
      resources = [local.s3_data]
    },
    {
      sid       = "StateReadWrite"
      effect    = "Allow"
      actions   = ["s3:DeleteObject", "s3:GetObject", "s3:PutObject"]
      resources = ["${local.s3_tfstate}/envs/${var.env}/*"]
    },
    {
      sid       = "StateList"
      effect    = "Allow"
      actions   = ["s3:ListBucket"]
      resources = [local.s3_tfstate]
      condition = { StringLike = { "s3:prefix" = "envs/${var.env}/*" } }
    },
    {
      sid       = "ArtifactObjects"
      effect    = "Allow"
      actions   = local.artifact_object_actions
      resources = ["${local.s3_artifacts}/*"]
    },
    {
      sid       = "ArtifactList"
      effect    = "Allow"
      actions   = ["s3:ListBucket"]
      resources = [local.s3_artifacts]
    },
  ]

  deploy_edge_statements = [
    {
      # SAR: CreateDistribution and CreateFunction take no resource type, only the
      # action-level keys `aws:RequestTag` and `aws:TagKeys`: an ARN here would never
      # match. `Resource: "*"` with the request tag is the closed-list exception.
      sid       = "CloudFrontCreate"
      effect    = "Allow"
      actions   = ["cloudfront:CreateDistribution", "cloudfront:CreateFunction"]
      resources = ["*"]
      condition = local.request_tag_env
    },
    {
      # CreateDistributionWithTags also needs TagResource, which does take a resource.
      sid       = "CloudFrontTagOnCreate"
      effect    = "Allow"
      actions   = ["cloudfront:TagResource"]
      resources = [local.cf_distribution, local.cf_function]
      condition = local.request_tag_env
    },
    {
      sid    = "CloudFrontChange"
      effect = "Allow"
      actions = [
        "cloudfront:CreateInvalidation",
        "cloudfront:DeleteDistribution",
        "cloudfront:DeleteFunction",
        "cloudfront:PublishFunction",
        "cloudfront:TagResource",
        "cloudfront:UntagResource",
        "cloudfront:UpdateDistribution",
        "cloudfront:UpdateFunction",
      ]
      resources = [local.cf_distribution, local.cf_function]
      condition = local.tag_env_equals
    },
    {
      # SAR: RequestCertificate takes no resource type (same reasoning as CloudFront).
      sid       = "AcmCreate"
      effect    = "Allow"
      actions   = ["acm:RequestCertificate"]
      resources = ["*"]
      condition = local.request_tag_env
    },
    {
      sid       = "AcmTagOnCreate"
      effect    = "Allow"
      actions   = ["acm:AddTagsToCertificate"]
      resources = [local.acm_certificate]
      condition = local.request_tag_env
    },
    {
      sid       = "AcmChange"
      effect    = "Allow"
      actions   = ["acm:AddTagsToCertificate", "acm:DeleteCertificate", "acm:RemoveTagsFromCertificate"]
      resources = [local.acm_certificate]
      condition = local.tag_env_equals
    },
    {
      sid       = "WafCreate"
      effect    = "Allow"
      actions   = ["wafv2:CreateWebACL", "wafv2:TagResource"]
      resources = [local.waf_web_acl]
      condition = local.request_tag_env
    },
    {
      sid       = "WafChange"
      effect    = "Allow"
      actions   = ["wafv2:DeleteWebACL", "wafv2:TagResource", "wafv2:UntagResource", "wafv2:UpdateWebACL"]
      resources = [local.waf_web_acl]
      condition = local.tag_env_equals
    },
  ]

  deploy_iam_write_statements = [
    {
      # The only roles it may create are `atlas-<env>-*`, and only with the boundary
      # of its environment on (row 5).
      sid       = "IamRoleWriteWithBoundary"
      effect    = "Allow"
      actions   = ["iam:CreateRole", "iam:DeleteRolePolicy", "iam:PutRolePolicy", "iam:UpdateAssumeRolePolicy"]
      resources = [local.iam_roles]
      condition = { StringEquals = { "iam:PermissionsBoundary" = local.boundary_arn } }
    },
    {
      sid       = "IamRoleOther"
      effect    = "Allow"
      actions   = ["iam:DeleteRole", "iam:TagRole", "iam:UntagRole", "iam:UpdateRoleDescription"]
      resources = [local.iam_roles]
    },
    {
      # Exact ARNs, never a pattern, and only to the service that will use the role.
      sid       = "IamPassRoleToLambda"
      effect    = "Allow"
      actions   = ["iam:PassRole"]
      resources = concat([local.role_arn.api], local.job_role_arns)
      condition = { StringEquals = { "iam:PassedToService" = "lambda.amazonaws.com" } }
    },
    {
      sid       = "IamPassRoleToScheduler"
      effect    = "Allow"
      actions   = ["iam:PassRole"]
      resources = [local.role_arn.scheduler]
      condition = { StringEquals = { "iam:PassedToService" = "scheduler.amazonaws.com" } }
    },
  ]

  deploy_deny_statements = [
    {
      # It touches none of the roles of the bootstrap, its own included. Those of the
      # other environment are out of reach twice over: no Allow names them and the
      # boundary of this environment does not either.
      sid       = "DenyBootstrapRoles"
      effect    = "Deny"
      actions   = local.iam_bootstrap_role_actions
      resources = local.bootstrap_role_arns
    },
    {
      sid       = "DenyBoundaryRemoval"
      effect    = "Deny"
      actions   = ["iam:DeleteRolePermissionsBoundary", "iam:PutRolePermissionsBoundary"]
      resources = [local.iam_roles]
    },
    {
      sid       = "DenyOwnPolicyChange"
      effect    = "Deny"
      actions   = ["iam:CreatePolicy", "iam:CreatePolicyVersion", "iam:DeletePolicy", "iam:DeletePolicyVersion", "iam:SetDefaultPolicyVersion"]
      resources = [local.iam_policies]
    },
    {
      sid       = "DenyRoleWithoutBoundary"
      effect    = "Deny"
      actions   = ["iam:CreateRole", "iam:DeleteRolePolicy", "iam:PutRolePolicy", "iam:UpdateAssumeRolePolicy"]
      resources = [local.iam_roles]
      condition = { StringNotEquals = { "iam:PermissionsBoundary" = local.boundary_arn } }
    },
    {
      # `aws:ResourceTag/env` is absent while a resource is created, so creating with
      # tags passes; once it exists, a resource of another environment is untouchable
      # (a service that authorises TagResource on creation, row 5 and NB4).
      sid       = "DenyTaggingOtherEnvironments"
      effect    = "Deny"
      actions   = local.tag_actions
      resources = ["*"]
      condition = {
        Null            = { "aws:ResourceTag/env" = "false" }
        StringNotEquals = { "aws:ResourceTag/env" = var.env }
      }
    },
    {
      sid       = "DenyChangingTheEnvTag"
      effect    = "Deny"
      actions   = local.tag_actions
      resources = ["*"]
      condition = {
        Null                       = { "aws:ResourceTag/env" = "false" }
        "ForAnyValue:StringEquals" = { "aws:TagKeys" = ["env"] }
      }
    },
    {
      sid       = "DenyChangingTheProjectTag"
      effect    = "Deny"
      actions   = local.tag_actions
      resources = ["*"]
      condition = {
        Null                       = { "aws:ResourceTag/project" = "false" }
        "ForAnyValue:StringEquals" = { "aws:TagKeys" = ["project"] }
      }
    },
  ]

  # A role's inline policies cannot exceed 10,240 characters in total, and a managed
  # policy 6,144: the deploy role carries four customer managed policies, created
  # here with constructed ARNs (and not attached from an attribute) so that they are
  # known when the plan is rendered. The deny statements live with the IAM ones.
  deploy_groups = {
    read     = local.read_statements
    workload = local.deploy_workload_statements
    edge     = local.deploy_edge_statements
    iam      = concat(local.deploy_iam_write_statements, local.deploy_deny_statements)
  }
  plan_all = concat(local.read_statements, local.plan_statements)
}

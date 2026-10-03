# Names and ARNs of one environment. Everything is built from `var.env` and the
# variables below, never from an attribute of another resource: a policy has to be
# fully known at `plan` time for the static analysis of the suite to read it
# (research b0.1). No `data` source: it would call AWS.

locals {
  prefix = "atlas-${var.env}"
  home   = var.region
  edge   = "us-east-1"
  acct   = var.account_id
  iam    = "arn:aws:iam::${local.acct}"

  boundary_arn = "${local.iam}:policy/${local.prefix}-boundary"

  role_names = {
    admin     = "${local.prefix}-admin"
    deploy    = "${local.prefix}-deploy"
    plan      = "${local.prefix}-plan"
    api       = "${local.prefix}-api"
    scheduler = "${local.prefix}-scheduler"
  }
  job_names = ["ecb", "prices", "mail", "backup", "integrity"]

  role_arn      = { for key, name in local.role_names : key => "${local.iam}:role/${name}" }
  job_role_arns = [for job in local.job_names : "${local.iam}:role/${local.prefix}-job-${job}"]
  # The roles of the bootstrap: the deploy role may touch none of them (row 5).
  bootstrap_role_arns = [local.role_arn.admin, local.role_arn.deploy, local.role_arn.plan]

  s3_data      = "arn:aws:s3:::${local.prefix}-data-${var.bucket_suffix}"
  s3_spa       = "arn:aws:s3:::${local.prefix}-spa-${var.bucket_suffix}"
  s3_tfstate   = "arn:aws:s3:::atlas-account-tfstate-${var.bucket_suffix}"
  s3_artifacts = "arn:aws:s3:::atlas-account-artifacts-${var.bucket_suffix}"

  ssm_base = "arn:aws:ssm:${local.home}:${local.acct}:parameter/atlas/${var.env}"
  # The only parameters that are not secrets and that Terraform creates (the mail
  # ones, ADR-0034 row 12). Nothing else under /atlas/<env>/ is readable by the
  # deploy or plan role (row 21).
  ssm_strings = "${local.ssm_base}/mail/*"

  lambda_fn       = "arn:aws:lambda:${local.home}:${local.acct}:function:${local.prefix}-*"
  logs_group      = "arn:aws:logs:${local.home}:${local.acct}:log-group:/aws/lambda/${local.prefix}-*"
  scheduler_group = "arn:aws:scheduler:${local.home}:${local.acct}:schedule-group/${local.prefix}-*"
  scheduler_item  = "arn:aws:scheduler:${local.home}:${local.acct}:schedule/${local.prefix}-jobs/*"

  cf_distribution = "arn:aws:cloudfront::${local.acct}:distribution/*"
  cf_function     = "arn:aws:cloudfront::${local.acct}:function/${local.prefix}-*"
  cf_untagged = [
    "arn:aws:cloudfront::${local.acct}:origin-access-control/*",
    "arn:aws:cloudfront::${local.acct}:cache-policy/*",
    "arn:aws:cloudfront::${local.acct}:origin-request-policy/*",
    "arn:aws:cloudfront::${local.acct}:response-headers-policy/*",
  ]
  acm_certificate = "arn:aws:acm:${local.edge}:${local.acct}:certificate/*"
  waf_web_acl     = "arn:aws:wafv2:${local.edge}:${local.acct}:global/webacl/${local.prefix}-*/*"

  iam_roles    = "${local.iam}:role/${local.prefix}-*"
  iam_policies = "${local.iam}:policy/${local.prefix}-*"

  # Every environment condition in one place.
  tag_env_equals   = { StringEquals = { "aws:ResourceTag/env" = var.env } }
  request_tag_env  = { StringEquals = { "aws:RequestTag/env" = var.env } }
  mail_sender_host = split("@", var.mail_sender)[1]

  # The whole list the provider needs on a bucket to refresh it and its
  # configuration resources (research b0.9, v6.67.0): configuration only, never an
  # object. `s3:GetBucket*` would not cover four of them, so they are named.
  bucket_read_actions = [
    "s3:GetAccelerateConfiguration",
    "s3:GetBucketAcl",
    "s3:GetBucketCORS",
    "s3:GetBucketLogging",
    "s3:GetBucketObjectLockConfiguration",
    "s3:GetBucketOwnershipControls",
    "s3:GetBucketPolicy",
    "s3:GetBucketPublicAccessBlock",
    "s3:GetBucketRequestPayment",
    "s3:GetBucketTagging",
    "s3:GetBucketVersioning",
    "s3:GetBucketWebsite",
    "s3:GetEncryptionConfiguration",
    "s3:GetLifecycleConfiguration",
    "s3:GetReplicationConfiguration",
    "s3:ListBucket",
  ]
  bucket_config_actions = [
    "s3:CreateBucket",
    "s3:PutBucketOwnershipControls",
    "s3:PutBucketPolicy",
    "s3:PutBucketPublicAccessBlock",
    "s3:PutBucketTagging",
    "s3:PutBucketVersioning",
    "s3:PutEncryptionConfiguration",
    "s3:PutLifecycleConfiguration",
  ]
}

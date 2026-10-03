# What the administration role may do (ADR-0034, row 16; prompt 017, E2 block 2). The
# policy lives in this part and not in the stack of the environment on purpose: the
# deploy role is denied every IAM write on the roles of the bootstrap, this one
# included (row 5), so a change of what the administrator can do is always an
# `apply` of the bootstrap made by hand, `dev` first. Every line comes from
# `infra/test/contract/permissions.json` (role `admin`): `specs/015-api-access/plan.md`
# section 10, `specs/016-scheduled-jobs/contracts/iam-permissions.md` section 8 and
# the answer P-3 (the secrets script reads only to know whether a parameter exists,
# never with decryption). No `kms:` action: with `aws/ssm` the key policy decides
# (E2 block 0, point 4); with C2 the policy of the key names this role.

locals {
  admin_secret_parameters = ["${local.ssm_base}/auth/*", "${local.ssm_base}/prices/*"]

  admin_statements = [
    {
      sid       = "Objects"
      effect    = "Allow"
      actions   = ["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject"]
      resources = ["${local.s3_data}/*"]
    },
    {
      sid       = "List"
      effect    = "Allow"
      actions   = ["s3:ListBucket", "s3:ListBucketVersions"]
      resources = [local.s3_data]
    },
    {
      sid       = "Tokens"
      effect    = "Allow"
      actions   = ["ssm:GetParametersByPath", "ssm:PutParameter"]
      resources = ["${local.ssm_base}/device-tokens", "${local.ssm_base}/device-tokens/*"]
    },
    {
      # Accepted by the direction for 017 (iam-permissions.md section 8): the two
      # deletions of the ECB history procedure, and nothing else.
      sid       = "EcbDelete"
      effect    = "Allow"
      actions   = ["s3:DeleteObject"]
      resources = ["${local.s3_data}/reference/ecb/manifest.json", "${local.s3_data}/jobs/ecb/ecb_update/*"]
    },
    {
      sid       = "Schedule"
      effect    = "Allow"
      actions   = ["scheduler:GetSchedule", "scheduler:UpdateSchedule"]
      resources = ["arn:aws:scheduler:${local.home}:${local.acct}:schedule/${local.prefix}-jobs/${local.prefix}-job-ecb"]
    },
    {
      sid       = "PassScheduler"
      effect    = "Allow"
      actions   = ["iam:PassRole"]
      resources = [local.role_arn.scheduler]
      condition = { StringEquals = { "iam:PassedToService" = "scheduler.amazonaws.com" } }
    },
    {
      sid       = "Invoke"
      effect    = "Allow"
      actions   = ["lambda:InvokeFunction"]
      resources = ["arn:aws:lambda:${local.home}:${local.acct}:function:${local.prefix}-job-ecb"]
    },
    {
      sid       = "Secrets"
      effect    = "Allow"
      actions   = ["ssm:AddTagsToResource", "ssm:PutParameter"]
      resources = local.admin_secret_parameters
    },
    {
      # Never decrypting: the script asks `WithDecryption=false` and prints no value.
      sid       = "SecretsExistence"
      effect    = "Allow"
      actions   = ["ssm:GetParameter"]
      resources = local.admin_secret_parameters
    },
  ]
}

resource "aws_iam_role_policy" "admin" {
  name = "admin"
  role = aws_iam_role.admin.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [for s in local.admin_statements : merge(
      { Sid = s.sid, Effect = s.effect, Action = s.actions, Resource = s.resources },
      try(s.condition, null) == null ? {} : { Condition = s.condition },
    )]
  })
}

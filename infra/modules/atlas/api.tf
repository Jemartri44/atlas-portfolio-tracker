# The Lambda of the API: its role (exactly `contract/permissions.json`, role `api`,
# from specs/015-api-access/plan.md section 10 and iam-permissions.md section 6), its
# log group created before it, and its Function URL with AWS_IAM behind the OAC.
# No `kms:` line: see `infra/bootstrap/env/statements-admin.tf` and questions.md, E2 b0.4.

locals {
  api_statements = [
    {
      Sid      = "LedgerRead"
      Effect   = "Allow"
      Action   = ["s3:GetObject"]
      Resource = ["${local.data_arn}/ledger/ledger.jsonl", "${local.data_arn}/sync/devices/*", "${local.data_arn}/reference/ecb/*", "${local.data_arn}/prices/*"]
    },
    {
      Sid      = "LedgerWrite"
      Effect   = "Allow"
      Action   = ["s3:PutObject"]
      Resource = ["${local.data_arn}/ledger/ledger.jsonl", "${local.data_arn}/sync/devices/*"]
    },
    {
      Sid      = "AccessMarker"
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:PutObject"]
      Resource = ["${local.data_arn}/access/last-web-sign-in.json"]
    },
    {
      # `access/` makes a missing marker a 404 and not a 403 (prompt 017, §12.2 B5).
      Sid       = "List"
      Effect    = "Allow"
      Action    = ["s3:ListBucket"]
      Resource  = [local.data_arn]
      Condition = { StringLike = { "s3:prefix" = ["ledger/*", "sync/devices/*", "reference/ecb/*", "prices/*", "access/*"] } }
    },
    {
      Sid      = "SsmRead"
      Effect   = "Allow"
      Action   = ["ssm:GetParameter"]
      Resource = ["${local.ssm_base}/auth/*", "${local.ssm_base}/device-tokens/*"]
    },
    {
      Sid      = "SsmByPath"
      Effect   = "Allow"
      Action   = ["ssm:GetParametersByPath"]
      Resource = ["${local.ssm_base}/device-tokens"]
    },
    {
      Sid      = "SsmTokens"
      Effect   = "Allow"
      Action   = ["ssm:AddTagsToResource", "ssm:PutParameter"]
      Resource = ["${local.ssm_base}/device-tokens/*"]
    },
    {
      Sid      = "Logs"
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = [local.api_logs, "${local.api_logs}:*"]
    },
  ]
}

resource "aws_iam_role" "api" {
  name                 = local.api_role_name
  description          = "Lambda of the API of ${var.env}."
  permissions_boundary = local.boundary_arn
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AssumeFromLambda"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "api" {
  name   = "api"
  role   = aws_iam_role.api.name
  policy = jsonencode({ Version = "2012-10-17", Statement = local.api_statements })
}

# Created here, before the function, so that retention is ours (30 or 7 days by
# environment; ADR-0028 row 16) and the role needs no `logs:CreateLogGroup`.
resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.api_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name = local.api_name
  description   = "API of Atlas (${var.env})."
  role          = aws_iam_role.api.arn
  runtime       = "nodejs22.x"
  handler       = "index.handler"
  architectures = ["arm64"] # lambda.zip is one index.mjs with no native binary (questions.md, E2 b0 (d))
  memory_size   = 256
  timeout       = 30

  s3_bucket        = "atlas-account-artifacts-${var.bucket_suffix}"
  s3_key           = var.artifact_key
  source_code_hash = var.artifact_sha256_base64

  reserved_concurrent_executions = var.api_reserved_concurrency == null ? -1 : var.api_reserved_concurrency

  # Exactly the variables `parseApiConfig` accepts (docs/api.md section 9): no secret.
  environment {
    variables = {
      ATLAS_ENV                      = var.env
      ATLAS_ORIGIN                   = "https://${var.domain}"
      ATLAS_DATA_BUCKET              = local.data_name
      ATLAS_SESSION_TTL_SECONDS      = "28800"
      ATLAS_LOGIN_TTL_SECONDS        = "600"
      ATLAS_CONSOLE_CODE_TTL_SECONDS = "300"
      ATLAS_TOKEN_LIFETIME_DAYS      = "90"
      ATLAS_RECENT_ISSUE_DAYS        = "7"
      ATLAS_CLOCK_TOLERANCE_SECONDS  = "600"
      ATLAS_ALLOW_LIST_CACHE_SECONDS = "120"
      ATLAS_SECRETS_CACHE_SECONDS    = "300"
    }
  }

  depends_on = [aws_cloudwatch_log_group.api, aws_iam_role_policy.api]
}

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "AWS_IAM"
}

# CloudFront needs both (CloudFront Developer Guide, "Restrict access to an AWS Lambda
# function URL origin"; E2 b0.1), each tied to the distribution of this environment
# with `AWS:SourceArn`, never `SourceAccount` (ADR-0034, row 19).
resource "aws_lambda_permission" "cloudfront_url" {
  statement_id           = "AllowCloudFrontServicePrincipal"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = aws_cloudfront_distribution.this.arn
  function_url_auth_type = "AWS_IAM"
}

resource "aws_lambda_permission" "cloudfront_invoke" {
  statement_id  = "AllowCloudFrontServicePrincipalInvokeFunction"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "cloudfront.amazonaws.com"
  source_arn    = aws_cloudfront_distribution.this.arn
}

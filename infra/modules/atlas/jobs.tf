# The five functions of the scheduled tasks (feature 016; specs/016-scheduled-jobs/
# contracts/iam-permissions.md sections 1 to 5, 7 and 9, ssm-and-config.md section 2):
# one artifact (`jobs.zip`, `index.handler`) and one function per family of permissions,
# each with its own role, exactly its table. Only the mail role has `ses:*`, and it
# reaches nothing under `/atlas/<env>/prices/`. No `kms:` line: see questions.md, E2 b0.4.

locals {
  job_names = ["ecb", "prices", "mail", "backup", "integrity"]

  # Time and memory: iam-permissions.md section 9. Hours (Europe/Madrid): plan.md of the 016,
  # section 6; none falls between 02:00 and 03:00, where the change of hour skips or repeats.
  jobs = {
    ecb       = { tasks = ["ecb_update"], timeout = 300, memory = 256, cron = "cron(15 17 * * ? *)" }
    prices    = { tasks = ["prices_update"], timeout = 900, memory = 256, cron = "cron(0 7 * * ? *)" }
    mail      = { tasks = ["dispatch_findings", "monthly_reminder", "weekly_review", "tax_return_ready", "informative_thresholds"], timeout = 300, memory = 256, cron = "cron(0 8 * * ? *)" }
    backup    = { tasks = ["monthly_backup"], timeout = 300, memory = 512, cron = "cron(15 3 * * ? *)" }
    integrity = { tasks = ["quarterly_integrity"], timeout = 300, memory = 512, cron = "cron(15 4 * * ? *)" }
  }

  job_function_name = { for job in local.job_names : job => "${local.prefix}-job-${job}" }
  job_function_arn  = { for job in local.job_names : job => "arn:aws:lambda:${local.home}:${local.acct}:function:${local.prefix}-job-${job}" }
  job_logs          = { for job in local.job_names : job => "arn:aws:logs:${local.home}:${local.acct}:log-group:/aws/lambda/${local.prefix}-job-${job}" }

  job_env_common = {
    for job in local.job_names : job => {
      ATLAS_ENV                 = var.env
      ATLAS_DATA_BUCKET         = local.data_name
      ATLAS_JOBS                = join(",", local.jobs[job].tasks)
      ATLAS_JOB_MAX_RUN_SECONDS = tostring(local.jobs[job].timeout)
    }
  }

  # Exactly the variables of each family (`JOBS_CONFIG_VARIABLES` of the domain): an
  # unknown one stops the function from starting. No secret: the keys come from SSM.
  job_env_family = {
    ecb    = {}
    backup = {}
    prices = {
      ATLAS_PRICE_SOURCES                    = join(",", var.price_sources)
      ATLAS_PRICES_EODHD_DAILY_CALLS         = tostring(var.prices_eodhd_daily_calls)
      ATLAS_PRICES_ALPHA_VANTAGE_DAILY_CALLS = tostring(var.prices_alpha_vantage_daily_calls)
      ATLAS_PRICES_FAILURE_THRESHOLD         = tostring(var.prices_failure_threshold)
    }
    mail = {
      ATLAS_MAIL_FROM               = var.mail_sender
      ATLAS_ORIGIN                  = "https://${var.domain}"
      ATLAS_OAUTH_IDLE_WARNING_DAYS = tostring(var.oauth_idle_warning_days)
    }
    integrity = {
      ATLAS_LEDGER_SIZE_WARNING_BYTES = tostring(var.ledger_size_warning_bytes)
    }
  }

  sender_host = split("@", var.mail_sender)[1]

  job_logs_statement = {
    for job in local.job_names : job => {
      Sid      = "Logs"
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = [local.job_logs[job], "${local.job_logs[job]}:*"]
    }
  }

  # `s3:ListBucket` makes a missing key a 404 and not a 403 (iam-permissions.md, intro).
  job_statements = {
    ecb = [
      { Sid = "Read", Effect = "Allow", Action = ["s3:GetObject"], Resource = ["${local.data_arn}/ledger/ledger.jsonl"] },
      { Sid = "ReadWrite", Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject"], Resource = ["${local.data_arn}/reference/ecb/*", "${local.data_arn}/jobs/ecb/*"] },
      { Sid = "List", Effect = "Allow", Action = ["s3:ListBucket"], Resource = [local.data_arn], Condition = { StringLike = { "s3:prefix" = ["reference/ecb/*", "jobs/ecb/*", "ledger/*"] } } },
      local.job_logs_statement["ecb"],
    ]

    prices = [
      { Sid = "Read", Effect = "Allow", Action = ["s3:GetObject"], Resource = ["${local.data_arn}/ledger/ledger.jsonl", "${local.data_arn}/prices/*"] },
      { Sid = "Write", Effect = "Allow", Action = ["s3:PutObject"], Resource = ["${local.data_arn}/prices/*"] },
      { Sid = "JobRecord", Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject"], Resource = ["${local.data_arn}/jobs/prices/*"] },
      # One writer per object: IAM stops what the code no longer does (iam-permissions.md, section 2).
      { Sid = "DenyConfig", Effect = "Deny", Action = ["s3:PutObject"], Resource = ["${local.data_arn}/prices/symbols.json", "${local.data_arn}/prices/config.json"] },
      { Sid = "List", Effect = "Allow", Action = ["s3:ListBucket"], Resource = [local.data_arn], Condition = { StringLike = { "s3:prefix" = ["prices/*", "jobs/prices/*", "ledger/*"] } } },
      { Sid = "Keys", Effect = "Allow", Action = ["ssm:GetParameter"], Resource = ["${local.ssm_base}/prices/eodhd-key", "${local.ssm_base}/prices/alpha-vantage-key"] },
      local.job_logs_statement["prices"],
    ]

    mail = [
      { Sid = "Read", Effect = "Allow", Action = ["s3:GetObject"], Resource = ["${local.data_arn}/ledger/ledger.jsonl", "${local.data_arn}/prices/*", "${local.data_arn}/reference/ecb/*", "${local.data_arn}/access/last-web-sign-in.json", "${local.data_arn}/jobs/*"] },
      { Sid = "Write", Effect = "Allow", Action = ["s3:PutObject"], Resource = ["${local.data_arn}/jobs/mail/*"] },
      { Sid = "List", Effect = "Allow", Action = ["s3:ListBucket"], Resource = [local.data_arn], Condition = { StringLike = { "s3:prefix" = ["jobs/*", "prices/*", "reference/ecb/*", "access/*", "ledger/*"] } } },
      { Sid = "Config", Effect = "Allow", Action = ["ssm:GetParameter"], Resource = ["${local.ssm_base}/mail/recipient", "${local.ssm_base}/mail/amounts"] },
      { Sid = "Tokens", Effect = "Allow", Action = ["ssm:GetParametersByPath"], Resource = ["${local.ssm_base}/device-tokens"], Condition = { StringEquals = { "ssm:Recursive" = "false" } } },
      {
        # The sender and its domain, the two identities (accepted, 016 questions section 9; which
        # one SES evaluates is SIN VERIFICAR, questions.md E3 b0.1). The recipient of the condition
        # and the one of /atlas/<env>/mail/recipient are the same variable (ADR-0034, row 12).
        Sid      = "Send"
        Effect   = "Allow"
        Action   = ["ses:SendEmail"]
        Resource = ["arn:aws:ses:${local.home}:${local.acct}:identity/${var.mail_sender}", "arn:aws:ses:${local.home}:${local.acct}:identity/${local.sender_host}"]
        Condition = {
          StringEquals                = { "ses:FromAddress" = var.mail_sender, "ses:ApiVersion" = "2" }
          "ForAllValues:StringEquals" = { "ses:Recipients" = [var.mail_recipient] }
          Null                        = { "ses:Recipients" = "false" }
        }
      },
      local.job_logs_statement["mail"],
    ]

    backup = [
      { Sid = "Read", Effect = "Allow", Action = ["s3:GetObject"], Resource = ["${local.data_arn}/ledger/ledger.jsonl", "${local.data_arn}/reference/ecb/manifest.json", "${local.data_arn}/reference/ecb/eurofxref-hist.csv", "${local.data_arn}/reference/ecb/api-exr.csv", "${local.data_arn}/prices/*"] },
      { Sid = "ReadWrite", Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject"], Resource = ["${local.data_arn}/backups/*", "${local.data_arn}/jobs/backup/*"] },
      { Sid = "List", Effect = "Allow", Action = ["s3:ListBucket"], Resource = [local.data_arn], Condition = { StringLike = { "s3:prefix" = ["prices/*", "reference/ecb/*", "backups/*", "jobs/backup/*", "ledger/*"] } } },
      local.job_logs_statement["backup"],
    ]

    integrity = [
      { Sid = "Read", Effect = "Allow", Action = ["s3:GetObject"], Resource = ["${local.data_arn}/ledger/ledger.jsonl", "${local.data_arn}/jobs/backup/*", "${local.data_arn}/backups/*/ledger.jsonl"] },
      { Sid = "ReadWrite", Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject"], Resource = ["${local.data_arn}/jobs/integrity/*"] },
      { Sid = "List", Effect = "Allow", Action = ["s3:ListBucket"], Resource = [local.data_arn], Condition = { StringLike = { "s3:prefix" = ["jobs/backup/monthly_backup/*", "jobs/integrity/*", "backups/*", "ledger/*"] } } },
      local.job_logs_statement["integrity"],
    ]
  }
}

resource "aws_iam_role" "job" {
  for_each = toset(local.job_names)

  name                 = local.job_function_name[each.key]
  description          = "Lambda of the ${each.key} tasks of ${var.env}."
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

resource "aws_iam_role_policy" "job" {
  for_each = toset(local.job_names)

  name   = "job"
  role   = aws_iam_role.job[each.key].name
  policy = jsonencode({ Version = "2012-10-17", Statement = local.job_statements[each.key] })
}

# Created here, before the functions, so that retention is ours (ADR-0034, row 3) and a
# role needs no `logs:CreateLogGroup`.
resource "aws_cloudwatch_log_group" "job" {
  for_each = toset(local.job_names)

  name              = "/aws/lambda/${local.job_function_name[each.key]}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "job" {
  for_each = toset(local.job_names)

  function_name = local.job_function_name[each.key]
  description   = "Scheduled ${each.key} tasks of Atlas (${var.env})."
  role          = aws_iam_role.job[each.key].arn
  runtime       = "nodejs22.x"
  handler       = "index.handler"
  architectures = ["arm64"] # jobs.zip is one index.mjs with no native binary (questions.md, E3 b0)
  memory_size   = local.jobs[each.key].memory
  timeout       = local.jobs[each.key].timeout

  s3_bucket        = "atlas-account-artifacts-${var.bucket_suffix}"
  s3_key           = var.jobs_artifact_key
  source_code_hash = var.jobs_artifact_sha256_base64

  reserved_concurrent_executions = var.reserve_jobs_concurrency ? 1 : -1

  environment {
    variables = merge(local.job_env_common[each.key], local.job_env_family[each.key])
  }

  depends_on = [aws_cloudwatch_log_group.job, aws_iam_role_policy.job]
}

# Scheduler invokes asynchronously: no retry of Lambda's own (Scheduler retries twice) and
# an event older than an hour is dropped (iam-permissions.md, section 7).
resource "aws_lambda_function_event_invoke_config" "job" {
  for_each = toset(local.job_names)

  function_name                = aws_lambda_function.job[each.key].function_name
  maximum_retry_attempts       = 0
  maximum_event_age_in_seconds = 3600
}

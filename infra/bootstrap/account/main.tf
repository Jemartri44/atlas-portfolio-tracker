# Bootstrap of the account (ADR-0034, rows 9, 11, 12, 14, 15 and 20; prompt 017, E1
# block 2). Applied by hand by the user with the administration principal, with a
# local state outside the repository, before `dev`. Nothing here is applied by a
# pipeline, and nothing creates a secret.

locals {
  tfstate_bucket   = "atlas-account-tfstate-${var.bucket_suffix}"
  artifacts_bucket = "atlas-account-artifacts-${var.bucket_suffix}"
  account_arn      = "arn:aws:iam::${var.account_id}"
}

# ---------------------------------------------------------------- state bucket

resource "aws_s3_bucket" "tfstate" {
  bucket        = local.tfstate_bucket
  force_destroy = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_policy" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  policy = local.tfstate_policy

  depends_on = [aws_s3_bucket_public_access_block.tfstate]
}

# ------------------------------------------------------------ artifacts bucket

resource "aws_s3_bucket" "artifacts" {
  bucket        = local.artifacts_bucket
  force_destroy = false
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# What is old expires (specs/017 cost.md): the artifact of a commit is promoted
# within days, never months.
resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    id     = "expire-old-artifacts"
    status = "Enabled"

    filter {}

    expiration {
      days = 90
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.artifacts]
}

resource "aws_s3_bucket_policy" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  policy = local.artifacts_policy

  depends_on = [aws_s3_bucket_public_access_block.artifacts]
}

# --------------------------------------------------------------- cost budget

# One budget for the account (ADR-0034, row 9): its name is the documented
# exception to row 3. Measured before credits, filtered by the cost-allocation tag.
resource "aws_budgets_budget" "atlas_cost" {
  provider = aws.us_east_1

  name         = "atlas-cost"
  budget_type  = "COST"
  limit_amount = var.use_customer_managed_key ? "2" : "1"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_types {
    include_credit = false
    include_refund = false
  }

  cost_filter {
    name   = "TagKeyValue"
    values = ["user:project$atlas"]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}

# Second pass (research b0.7): the key can take up to 24 hours to show up in Billing
# after a resource carries it, so this stays off until then.
resource "aws_ce_cost_allocation_tag" "project" {
  provider = aws.us_east_1
  count    = var.cost_tag_activation == "terraform" ? 1 : 0

  tag_key = "project"
  status  = "Active"
}

# ------------------------------------------------- shared resources of the account
# Each one is created only when its variable says `create`; with `use_existing`
# there is no resource and no data source (a data source would call AWS at plan
# time). They carry `prevent_destroy` and are outside every `destroy` of Atlas.

resource "aws_iam_openid_connect_provider" "github" {
  count = var.github_oidc_provider_mode == "create" ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  tags           = { shared = "true" }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_accessanalyzer_analyzer" "external" {
  count = var.access_analyzer_mode == "create" ? 1 : 0

  analyzer_name = "atlas-account-external-access"
  type          = "ACCOUNT"
  tags          = { shared = "true" }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_sesv2_email_identity" "sender" {
  count = var.ses_create_sender_identity ? 1 : 0

  email_identity = var.mail_sender
  tags           = { shared = "true" }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_sesv2_email_identity" "recipient" {
  count = var.ses_verify_recipient_identity ? 1 : 0

  email_identity = var.mail_recipient
  tags           = { shared = "true" }

  lifecycle {
    prevent_destroy = true
  }
}

# The data bucket of the environment: the bucket, its versioning, lifecycle, encryption,
# public access block and policy. They live in the bootstrap, applied by hand with MFA, and
# not in the stack the deploy role applies: that role can then neither shorten the
# retention to a day, nor switch versioning off, nor rewrite the policy, so no automatic
# pipeline can erase the ledger and its copies (security audit 03/11, finding 2).
# The deploy and plan roles only read this configuration. Never a CloudFront origin.
# `prevent_destroy` takes no variable: prod uses the protected twin of the module.

module "data_bucket_protected" {
  count  = var.env == "prod" ? 1 : 0
  source = "../../modules/data-bucket-protected"

  name = local.data_name
}

module "data_bucket" {
  count  = var.env == "prod" ? 0 : 1
  source = "../../modules/data-bucket"

  name = local.data_name
}

locals {
  # From the module, so what is configured on the bucket waits for it.
  data_bucket = one(concat(module.data_bucket_protected[*].name, module.data_bucket[*].name))
}

resource "aws_s3_bucket_versioning" "data" {
  bucket = local.data_bucket
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = local.data_bucket
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = local.data_bucket
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "data" {
  bucket = local.data_bucket
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "data" {
  bucket = local.data_bucket

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 365 # ADR-0006
    }
  }

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.data]
}

locals {
  # The roles that may touch objects: the API, the five tasks and administration.
  data_object_roles = concat([local.role_arn.api, local.role_arn.admin], local.job_role_arns)
  # Deploy and plan read the configuration of the bucket and list it, nothing else.
  data_list_roles = concat(local.data_object_roles, [local.role_arn.deploy, local.role_arn.plan])
  # Only the principal that applies this part (the user's administration principal) writes the
  # configuration. No role of the
  # environment does, the deploy role least of all.
  data_config_principals = [var.admin_principal_arn]

  data_policy = {
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyObjectActionsOutsideTheEnvironment"
        Effect    = "Deny"
        Principal = "*"
        Action    = ["s3:*"]
        Resource  = "${local.s3_data}/*"
        Condition = { ArnNotLike = { "aws:PrincipalArn" = local.data_object_roles } }
      },
      {
        Sid       = "DenyListOutsideTheEnvironment"
        Effect    = "Deny"
        Principal = "*"
        Action    = ["s3:ListBucket"]
        Resource  = local.s3_data
        Condition = { ArnNotLike = { "aws:PrincipalArn" = local.data_list_roles } }
      },
      {
        Sid       = "DenyVersionAndUploadListsOutsideTheRoles"
        Effect    = "Deny"
        Principal = "*"
        Action    = ["s3:ListBucketMultipartUploads", "s3:ListBucketVersions"]
        Resource  = local.s3_data
        Condition = { ArnNotLike = { "aws:PrincipalArn" = local.data_object_roles } }
      },
      {
        Sid       = "DenyConfigurationChangesExceptTheBootstrap"
        Effect    = "Deny"
        Principal = "*"
        # Every write of the configuration of the bucket, not a list: inventory, logging,
        # notification and replication would let another project's role take the key
        # names or the contents out (review of PR 115, B1).
        Action    = ["s3:CreateBucketMetadata*", "s3:DeleteBucket*", "s3:Put*Configuration", "s3:PutBucket*", "s3:UpdateBucketMetadata*"]
        Resource  = local.s3_data
        Condition = { ArnNotLike = { "aws:PrincipalArn" = local.data_config_principals } }
      },
      {
        # iam-permissions.md §4, in the form questions §20.1 verified.
        Sid       = "BackupsOnlyIfAbsent"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${local.s3_data}/backups/*"
        Condition = { Null = { "s3:if-none-match" = "true" }, Bool = { "s3:ObjectCreationOperation" = "true" } }
      },
      {
        # Drafts of the cloud (E6 of ADR-0035): created once, never overwritten; same form as backups.
        Sid       = "DraftsOnlyIfAbsent"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${local.s3_data}/drafts/*"
        Condition = { Null = { "s3:if-none-match" = "true" }, Bool = { "s3:ObjectCreationOperation" = "true" } }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [local.s3_data, "${local.s3_data}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  }
}

resource "aws_s3_bucket_policy" "data" {
  bucket = local.data_bucket
  policy = jsonencode(local.data_policy)

  depends_on = [aws_s3_bucket_public_access_block.data]
}

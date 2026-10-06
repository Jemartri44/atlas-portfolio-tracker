# The data bucket (ADR-0028 row 7; ADR-0034 rows 6, 7 and 8; docs/data-schema.md §1).
# The bucket itself comes from the module the root chose; here go its configuration
# and its policy. Never a CloudFront origin.

resource "aws_s3_bucket_versioning" "data" {
  bucket = local.data_name
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = local.data_name
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = local.data_name
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "data" {
  bucket = local.data_name
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "data" {
  bucket = local.data_name

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
  data_object_roles = concat([local.api_role_arn, local.admin_arn], local.job_role_arns)
  # Deploy and plan read the configuration of the bucket and list it, nothing else (§12.2 B1).
  data_list_roles   = concat(local.data_object_roles, [local.deploy_arn, local.plan_arn])
  data_config_roles = [local.deploy_arn, local.admin_arn]

  data_policy = {
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyObjectActionsOutsideTheEnvironment"
        Effect    = "Deny"
        Principal = "*"
        Action    = ["s3:*"]
        Resource  = "${local.data_arn}/*"
        Condition = { ArnNotLike = { "aws:PrincipalArn" = local.data_object_roles } }
      },
      {
        Sid       = "DenyListOutsideTheEnvironment"
        Effect    = "Deny"
        Principal = "*"
        Action    = ["s3:ListBucket"]
        Resource  = local.data_arn
        Condition = { ArnNotLike = { "aws:PrincipalArn" = local.data_list_roles } }
      },
      {
        Sid       = "DenyVersionAndUploadListsOutsideTheRoles"
        Effect    = "Deny"
        Principal = "*"
        Action    = ["s3:ListBucketMultipartUploads", "s3:ListBucketVersions"]
        Resource  = local.data_arn
        Condition = { ArnNotLike = { "aws:PrincipalArn" = local.data_object_roles } }
      },
      {
        Sid       = "DenyConfigurationChangesExceptDeployAndAdmin"
        Effect    = "Deny"
        Principal = "*"
        # Every write of the configuration of the bucket, not a list: inventory, logging,
        # notification and replication would let another project's role take the key
        # names or the contents out (review of PR 115, B1).
        Action    = ["s3:CreateBucketMetadata*", "s3:DeleteBucket*", "s3:Put*Configuration", "s3:PutBucket*", "s3:UpdateBucketMetadata*"]
        Resource  = local.data_arn
        Condition = { ArnNotLike = { "aws:PrincipalArn" = local.data_config_roles } }
      },
      {
        # iam-permissions.md §4, in the form questions §20.1 verified.
        Sid       = "BackupsOnlyIfAbsent"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${local.data_arn}/backups/*"
        Condition = { Null = { "s3:if-none-match" = "true" }, Bool = { "s3:ObjectCreationOperation" = "true" } }
      },
      {
        # Drafts of the cloud (E6 of ADR-0035): created once, never overwritten; same form as backups.
        Sid       = "DraftsOnlyIfAbsent"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${local.data_arn}/drafts/*"
        Condition = { Null = { "s3:if-none-match" = "true" }, Bool = { "s3:ObjectCreationOperation" = "true" } }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [local.data_arn, "${local.data_arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  }
}

resource "aws_s3_bucket_policy" "data" {
  bucket = local.data_name
  policy = jsonencode(local.data_policy)

  depends_on = [aws_s3_bucket_public_access_block.data]
}

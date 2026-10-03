# The two policies of the account's buckets. They only deny: what is granted lives in
# the identity policy of each role (bootstrap/env), because these buckets are created
# before the roles and must not need them to exist (prompt 017, §12.2 B6 and N3).
# Principals are matched by `aws:PrincipalArn`, so a role that does not exist yet is
# fine. The administration principal appears in every exception: it applies this
# bootstrap and has to be able to apply it again (family 20).

locals {
  role_arn = { for name in ["dev-deploy", "dev-plan", "prod-deploy", "prod-plan"] : name => "${local.account_arn}:role/atlas-${name}" }

  state_principals = {
    dev  = [local.role_arn["dev-deploy"], local.role_arn["dev-plan"], var.admin_principal_arn]
    prod = [local.role_arn["prod-deploy"], local.role_arn["prod-plan"], var.admin_principal_arn]
    all  = [local.role_arn["dev-deploy"], local.role_arn["dev-plan"], local.role_arn["prod-deploy"], local.role_arn["prod-plan"], var.admin_principal_arn]
  }

  tfstate_arn   = "arn:aws:s3:::${local.tfstate_bucket}"
  artifacts_arn = "arn:aws:s3:::${local.artifacts_bucket}"

  bucket_config_actions = [
    "s3:DeleteBucket",
    "s3:DeleteBucketPolicy",
    "s3:PutBucketPolicy",
    "s3:PutBucketVersioning",
    "s3:PutLifecycleConfiguration",
    "s3:PutEncryptionConfiguration",
    "s3:PutBucketPublicAccessBlock",
    "s3:PutBucketOwnershipControls",
  ]

  tfstate_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [local.tfstate_arn, "${local.tfstate_arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid       = "DenyProdStateToEveryoneElse"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = "${local.tfstate_arn}/envs/prod/*"
        Condition = { ArnNotLike = { "aws:PrincipalArn" = local.state_principals.prod } }
      },
      {
        Sid       = "DenyDevStateToEveryoneElse"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = "${local.tfstate_arn}/envs/dev/*"
        Condition = { ArnNotLike = { "aws:PrincipalArn" = local.state_principals.dev } }
      },
      {
        Sid       = "DenyProdRolesToListOutsideTheirPrefix"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:ListBucket"
        Resource  = local.tfstate_arn
        Condition = {
          ArnLike       = { "aws:PrincipalArn" = [local.role_arn["prod-deploy"], local.role_arn["prod-plan"]] }
          StringNotLike = { "s3:prefix" = "envs/prod/*" }
        }
      },
      {
        Sid       = "DenyDevRolesToListOutsideTheirPrefix"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:ListBucket"
        Resource  = local.tfstate_arn
        Condition = {
          ArnLike       = { "aws:PrincipalArn" = [local.role_arn["dev-deploy"], local.role_arn["dev-plan"]] }
          StringNotLike = { "s3:prefix" = "envs/dev/*" }
        }
      },
      {
        Sid       = "DenyAnyOtherPrincipal"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [local.tfstate_arn, "${local.tfstate_arn}/*"]
        Condition = { ArnNotLike = { "aws:PrincipalArn" = local.state_principals.all } }
      },
      {
        Sid       = "DenyConfigurationChangesExceptAdministration"
        Effect    = "Deny"
        Principal = "*"
        Action    = local.bucket_config_actions
        Resource  = local.tfstate_arn
        Condition = { ArnNotLike = { "aws:PrincipalArn" = var.admin_principal_arn } }
      },
    ]
  })

  artifacts_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [local.artifacts_arn, "${local.artifacts_arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        Sid       = "DenyWritesExceptDevDeploy"
        Effect    = "Deny"
        Principal = "*"
        Action    = ["s3:AbortMultipartUpload", "s3:DeleteObject", "s3:DeleteObjectVersion", "s3:PutObject", "s3:PutObjectTagging"]
        Resource  = "${local.artifacts_arn}/*"
        Condition = { ArnNotLike = { "aws:PrincipalArn" = [local.role_arn["dev-deploy"], var.admin_principal_arn] } }
      },
      {
        Sid       = "DenyReadsExceptDeploys"
        Effect    = "Deny"
        Principal = "*"
        Action    = ["s3:GetObject", "s3:GetObjectVersion"]
        Resource  = "${local.artifacts_arn}/*"
        Condition = { ArnNotLike = { "aws:PrincipalArn" = [local.role_arn["dev-deploy"], local.role_arn["prod-deploy"], var.admin_principal_arn] } }
      },
      {
        Sid       = "DenyListingExceptDeploys"
        Effect    = "Deny"
        Principal = "*"
        Action    = ["s3:ListBucket", "s3:ListBucketMultipartUploads", "s3:ListBucketVersions"]
        Resource  = local.artifacts_arn
        Condition = { ArnNotLike = { "aws:PrincipalArn" = [local.role_arn["dev-deploy"], local.role_arn["prod-deploy"], var.admin_principal_arn] } }
      },
      {
        Sid       = "DenyConfigurationChangesExceptAdministration"
        Effect    = "Deny"
        Principal = "*"
        Action    = local.bucket_config_actions
        Resource  = local.artifacts_arn
        Condition = { ArnNotLike = { "aws:PrincipalArn" = var.admin_principal_arn } }
      },
    ]
  })
}

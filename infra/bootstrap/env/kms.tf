# C2 (ADR-0034, row 8; prompt 017, E1 block 3): a customer managed key for the
# SecureStrings of prod, only if the variable asks for it. Its policy does not
# delegate to IAM, so a key that names no administrator would be unmanageable
# (research b0.6): the administration principal is named **always**, as a real
# principal; everyone else is matched by `aws:PrincipalArn` with `ArnLike` (`Principal
# "*"`), so applying this part does not require that their roles exist (KMS rejects a
# principal that does not exist).

locals {
  device_token_parameters = "${local.ssm_base}/device-tokens/*"

  key_statements = [
    {
      Sid       = "AdministrationPrincipal"
      Effect    = "Allow"
      Principal = { AWS = var.admin_principal_arn }
      Action = [
        "kms:CancelKeyDeletion",
        "kms:DescribeKey",
        "kms:DisableKey",
        "kms:EnableKey",
        "kms:EnableKeyRotation",
        "kms:GetKeyPolicy",
        "kms:GetKeyRotationStatus",
        "kms:ListResourceTags",
        "kms:PutKeyPolicy",
        "kms:ScheduleKeyDeletion",
        "kms:TagResource",
        "kms:UntagResource",
      ]
      Resource = "*"
    },
    {
      Sid       = "AdminRoleEncryptDecrypt"
      Effect    = "Allow"
      Principal = "*"
      Action    = ["kms:Decrypt", "kms:Encrypt"]
      Resource  = "*"
      Condition = {
        ArnLike = { "aws:PrincipalArn" = local.role_arn.admin }
      }
    },
    {
      Sid       = "ApiTokensEncryptDecrypt"
      Effect    = "Allow"
      Principal = "*"
      Action    = ["kms:Decrypt", "kms:Encrypt"]
      Resource  = "*"
      Condition = {
        ArnLike = {
          "aws:PrincipalArn"                    = local.role_arn.api
          "kms:EncryptionContext:PARAMETER_ARN" = local.device_token_parameters
        }
      }
    },
    {
      Sid       = "JobsDecrypt"
      Effect    = "Allow"
      Principal = "*"
      Action    = ["kms:Decrypt"]
      Resource  = "*"
      Condition = {
        ArnLike = { "aws:PrincipalArn" = local.job_role_arns }
      }
    },
  ]
}

resource "aws_kms_key" "ssm" {
  count = var.use_customer_managed_key ? 1 : 0

  description             = "SecureStrings of ${var.env} (ADR-0034, row 8, option 2)."
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = jsonencode({ Version = "2012-10-17", Statement = local.key_statements })
}

resource "aws_kms_alias" "ssm" {
  count = var.use_customer_managed_key ? 1 : 0

  name          = "alias/${local.prefix}-ssm"
  target_key_id = aws_kms_key.ssm[0].key_id
}

variable "env" {
  description = "The environment this part is applied for: one root, applied once per environment."
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.env)
    error_message = "env must be dev or prod."
  }
}

variable "region" {
  description = "Home region."
  type        = string
  default     = "eu-west-1"

  validation {
    condition     = var.region == "eu-west-1"
    error_message = "region must be eu-west-1 (ADR-0028, row 4)."
  }
}

variable "account_id" {
  description = "The shared AWS account. Not sensitive (ADR-0034, row 1)."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "account_id must be twelve digits."
  }
}

variable "bucket_suffix" {
  description = "Suffix of the bucket names; the same one the account part uses."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]{6,16}$", var.bucket_suffix))
    error_message = "bucket_suffix must be 6 to 16 lowercase letters or digits."
  }
}

variable "github_repository" {
  description = "owner/name of the public repository whose workflows assume the deploy and plan roles."
  type        = string
  default     = "Jemartri44/atlas-portfolio-tracker"

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must be owner/name, with no wildcard."
  }
}

variable "admin_principal_arn" {
  description = "The user's administration principal (C5): who may assume atlas-<env>-admin."
  type        = string

  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:(user|role)/.+$", var.admin_principal_arn))
    error_message = "admin_principal_arn must be the ARN of an IAM user or role."
  }
}

variable "admin_trust_mode" {
  description = "C5. iam_user_mfa: an IAM user with MFA assumes the role (aws:MultiFactorAuthPresent). identity_center_role: the reserved Identity Center role assumes it, with no MFA condition because such a session does not carry the key."
  type        = string
  default     = "iam_user_mfa"

  validation {
    condition     = contains(["iam_user_mfa", "identity_center_role"], var.admin_trust_mode)
    error_message = "admin_trust_mode must be iam_user_mfa or identity_center_role."
  }
}

variable "use_customer_managed_key" {
  description = "C2. A customer managed KMS key for the SecureStrings of prod. Only valid in prod; the account part has the same variable, which raises the budget to 2 USD."
  type        = bool
  default     = false

  validation {
    condition     = !var.use_customer_managed_key || var.env == "prod"
    error_message = "use_customer_managed_key is only valid for env = prod."
  }
}

variable "mail_sender" {
  description = "Atlas's own SES sender: the boundary lets the mail role send from it. Not sensitive (ADR-0034, row 1)."
  type        = string

  validation {
    condition     = can(regex("^[^@ ,<>]{1,64}@[^@ ,<>]{1,189}$", var.mail_sender))
    error_message = "mail_sender must be one plain address."
  }
}

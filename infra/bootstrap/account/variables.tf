variable "region" {
  description = "Home region of every resource that is not global."
  type        = string
  default     = "eu-west-1"

  validation {
    condition     = var.region == "eu-west-1"
    error_message = "region must be eu-west-1 (ADR-0028, row 4)."
  }
}

variable "account_id" {
  description = "The shared AWS account. Not sensitive: a sensitive value would hide every policy built with it from the plan (ADR-0034, row 1)."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "account_id must be twelve digits."
  }
}

variable "bucket_suffix" {
  description = "Suffix of the bucket names, which are global. It lives in terraform.tfvars, outside the repository."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]{6,16}$", var.bucket_suffix))
    error_message = "bucket_suffix must be 6 to 16 lowercase letters or digits."
  }
}

variable "admin_principal_arn" {
  description = "The user's administration principal (C5): the only one, besides the roles of each environment, that the state and artifact buckets let through."
  type        = string

  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:(user|role)/[A-Za-z0-9+=,.@_/-]+$", var.admin_principal_arn)) && try(split(":", var.admin_principal_arn)[4], "") == var.account_id
    error_message = "admin_principal_arn must be the ARN of one IAM user or role of this account, with no wildcard."
  }
}

variable "use_customer_managed_key" {
  description = "C2. When true the cost budget rises from 1 to 2 USD (the key costs 1 USD a month). It must match the variable of the same name in the prod environment part."
  type        = bool
  default     = false
}

variable "budget_alert_email" {
  description = "Where the atlas-cost budget writes. Sensitive: it is an address."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[^@ ,<>]{1,64}@[^@ ,<>]{1,189}$", var.budget_alert_email))
    error_message = "budget_alert_email must be one plain address."
  }
}

variable "cost_tag_activation" {
  description = "off: the project tag is activated by hand, or in a second pass; terraform: this part activates it (the key can take up to 24 hours to appear in Billing)."
  type        = string
  default     = "off"

  validation {
    condition     = contains(["off", "terraform"], var.cost_tag_activation)
    error_message = "cost_tag_activation must be off or terraform."
  }
}

variable "github_oidc_provider_mode" {
  description = "use_existing: another project already created the GitHub OIDC provider and Atlas only trusts it; create: this part creates it as a shared resource."
  type        = string
  default     = "use_existing"

  validation {
    condition     = contains(["use_existing", "create"], var.github_oidc_provider_mode)
    error_message = "github_oidc_provider_mode must be use_existing or create."
  }
}

variable "access_analyzer_mode" {
  description = "use_existing or create, for the IAM Access Analyzer of external access in the home region."
  type        = string
  default     = "use_existing"

  validation {
    condition     = contains(["use_existing", "create"], var.access_analyzer_mode)
    error_message = "access_analyzer_mode must be use_existing or create."
  }
}

variable "mail_sender" {
  description = "Atlas's own SES sender. Not sensitive (ADR-0034, row 1: only the domain and the recipient are); its outputs would be."
  type        = string

  validation {
    condition     = can(regex("^[^@ ,<>]{1,64}@[^@ ,<>]{1,189}$", var.mail_sender))
    error_message = "mail_sender must be one plain address."
  }
}

variable "mail_recipient" {
  description = "The user's address; only read when ses_verify_recipient_identity is true. Sensitive."
  type        = string
  default     = "unused@example.invalid"
  sensitive   = true

  validation {
    condition     = can(regex("^[^@ ,<>]{1,64}@[^@ ,<>]{1,189}$", var.mail_recipient))
    error_message = "mail_recipient must be one plain address."
  }
}

variable "ses_create_sender_identity" {
  description = "true: this part creates the sender identity (one per address, never per environment); false: it already exists and Atlas only uses it."
  type        = bool
  default     = true
}

variable "ses_verify_recipient_identity" {
  description = "C9. true when the account is still in the SES sandbox: the recipient's identity is created too."
  type        = bool
  default     = false
}

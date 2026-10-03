# One resource per way a guardian could be fooled, each of them an attempt to hide a
# wildcard, a managed policy, a secret or a personal value from a check that only
# read the text of the `.tf` files. The suite reads the rendered plan, and has to
# see every one of these by the rule that forbids it (prompt 017, §9, family 1).
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 6.67.0"
    }
  }
}

provider "aws" {
  region = "eu-west-1"

  default_tags {
    tags = { project = "atlas" }
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

variable "star" {
  type    = string
  default = "*"
}

variable "personal" {
  type      = string
  default   = "personal-value-0001"
  sensitive = true
}

locals {
  trust = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  doc = { for key, action in {
    star_variable = [var.star]
    star_concat   = concat(["s3:GetObject"], ["iam:*"])
    star_service  = ["s3:*"]
    } : key => jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Effect   = "Allow"
        Action   = action
        Resource = ["arn:aws:s3:::atlas-dev-data-abc123/*"]
      }]
  }) }
}

resource "aws_iam_role" "base" {
  name               = "atlas-dev-base"
  assume_role_policy = local.trust
}

# A wildcard that comes from a variable, from concat(), written plainly, and one
# per element of a for_each.
resource "aws_iam_role_policy" "elusion" {
  for_each = local.doc

  name   = each.key
  role   = aws_iam_role.base.name
  policy = each.value
}

# A wildcard that comes out of templatefile().
resource "aws_iam_role_policy" "star_template" {
  name   = "star-template"
  role   = aws_iam_role.base.name
  policy = templatefile("${path.module}/policy.json.tpl", { action = "ec2:*" })
}

# `Resource: "*"` for an action that does take a resource.
resource "aws_iam_role_policy" "star_resource" {
  name = "star-resource"
  role = aws_iam_role.base.name
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["s3:GetObject"], Resource = ["*"] }]
  })
}

# NotAction in an Allow.
resource "aws_iam_role_policy" "not_action" {
  name = "not-action"
  role = aws_iam_role.base.name
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", NotAction = ["iam:*"], Resource = ["arn:aws:s3:::atlas-dev-data-abc123/*"] }]
  })
}

# A policy built from a sensitive value: the plan would hide it.
resource "aws_iam_role_policy" "sensitive_policy" {
  name = "sensitive"
  role = aws_iam_role.base.name
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["s3:GetObject"], Resource = ["arn:aws:s3:::atlas-dev-${var.personal}/*"] }]
  })
}

# The inline policy of the role itself, plainly and through a dynamic block.
resource "aws_iam_role" "inline_static" {
  name               = "atlas-dev-inline-static"
  assume_role_policy = local.trust

  inline_policy {
    name = "wide"
    policy = jsonencode({
      Version   = "2012-10-17"
      Statement = [{ Effect = "Allow", Action = ["s3:GetObject"], Resource = ["arn:aws:s3:::atlas-dev-data-abc123/*"] }]
    })
  }
}

resource "aws_iam_role" "inline_dynamic" {
  name               = "atlas-dev-inline-dynamic"
  assume_role_policy = local.trust

  dynamic "inline_policy" {
    for_each = toset(["wide"])

    content {
      name = inline_policy.value
      policy = jsonencode({
        Version   = "2012-10-17"
        Statement = [{ Effect = "Allow", Action = [var.star], Resource = ["arn:aws:s3:::atlas-dev-data-abc123/*"] }]
      })
    }
  }
}

# A policy that somebody else manages.
resource "aws_iam_role_policy_attachment" "read_only" {
  role       = aws_iam_role.base.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy_attachment" "other_project" {
  role       = aws_iam_role.base.name
  policy_arn = "arn:aws:iam::111122223333:policy/someone-elses"
}

# Allow with Principal "*" and no condition on the principal.
resource "aws_s3_bucket" "open" {
  bucket = "atlas-dev-open-abc123"
}

resource "aws_s3_bucket_policy" "open" {
  bucket = aws_s3_bucket.open.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = ["s3:GetObject"]
      Resource  = ["arn:aws:s3:::atlas-dev-open-abc123/*"]
    }]
  })
}

# Secrets in Terraform.
resource "aws_ssm_parameter" "secret" {
  name  = "/atlas/dev/auth/google-client-secret"
  type  = "SecureString"
  value = "never-in-state"
}

resource "aws_lambda_function" "leaky" {
  function_name = "atlas-dev-leaky"
  role          = aws_iam_role.base.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  s3_bucket     = "atlas-dev-artifacts-abc123"
  s3_key        = "leaky.zip"

  environment {
    variables = {
      ATLAS_ORIGIN        = "https://app.example.invalid"
      GOOGLE_API_KEY      = "never-in-state"
      ATLAS_SESSION_TOKEN = "never-in-state"
    }
  }
}

# A type that cost.md does not list, a type in the wrong region, an output that leaks.
resource "aws_sns_topic" "unlisted" {
  name = "atlas-dev-unlisted"
}

resource "aws_s3_bucket" "wrong_region" {
  provider = aws.us_east_1
  bucket   = "atlas-dev-wrong-region-abc123"
}

output "leak" {
  value = "https://personal.example.invalid/abc123def456"
}

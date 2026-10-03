# A root that obeys every guardian of the suite: the guardians must say nothing about it.
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
    tags = { project = "atlas", env = "dev", managed_by = "terraform" }
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = { project = "atlas", env = "dev", managed_by = "terraform" }
  }
}

variable "personal" {
  type    = string
  default = "personal-value-0001"
}

resource "aws_iam_role" "worker" {
  name = "atlas-dev-worker"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "worker" {
  name = "worker"
  role = aws_iam_role.worker.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = ["arn:aws:s3:::atlas-dev-data-abc123/ledger/ledger.jsonl"]
      },
      {
        Effect   = "Allow"
        Action   = ["logs:DescribeLogGroups"]
        Resource = ["*"]
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "own" {
  role       = aws_iam_role.worker.name
  policy_arn = "arn:aws:iam::111122223333:policy/atlas-dev-worker-extra"
}

resource "aws_s3_bucket" "data" {
  bucket        = "atlas-dev-data-abc123"
  force_destroy = false
}

resource "aws_s3_bucket_policy" "data" {
  bucket = aws_s3_bucket.data.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = ["arn:aws:s3:::atlas-dev-data-abc123/*"]
        Condition = { ArnNotLike = { "aws:PrincipalArn" = "arn:aws:iam::111122223333:role/atlas-dev-*" } }
      },
      {
        Effect    = "Allow"
        Principal = "*"
        Action    = ["s3:GetObject"]
        Resource  = ["arn:aws:s3:::atlas-dev-data-abc123/ledger/*"]
        Condition = { ArnLike = { "aws:PrincipalArn" = "arn:aws:iam::111122223333:role/atlas-dev-worker" } }
      },
    ]
  })
}

resource "aws_ssm_parameter" "plain" {
  name  = "/atlas/dev/mail/amounts"
  type  = "String"
  value = "off"
}

resource "aws_acm_certificate" "edge" {
  provider          = aws.us_east_1
  domain_name       = "app.example.invalid"
  validation_method = "DNS"
}

output "bucket" {
  value     = aws_s3_bucket.data.bucket
  sensitive = true
}

output "public" {
  value = "nothing-personal-here"
}

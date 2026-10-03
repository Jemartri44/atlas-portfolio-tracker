terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 6.67.0"
    }
  }

  # Partial configuration: bucket and key come from `-backend-config` at `init`
  # (state key envs/<env>/terraform.tfstate, native S3 locking; research b0.9).
  backend "s3" {
    use_lockfile = true
  }
}

# Two providers: the home region and `us_east_1` for what is global (CloudFront,
# ACM and WAF for a distribution). Every resource of this part carries the three
# tags of ADR-0034, row 3.
provider "aws" {
  region              = var.region
  allowed_account_ids = [var.account_id]

  default_tags {
    tags = {
      project    = "atlas"
      env        = var.env
      managed_by = "terraform"
    }
  }
}

provider "aws" {
  alias               = "us_east_1"
  region              = "us-east-1"
  allowed_account_ids = [var.account_id]

  default_tags {
    tags = {
      project    = "atlas"
      env        = var.env
      managed_by = "terraform"
    }
  }
}

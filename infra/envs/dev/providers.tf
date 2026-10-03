# Two providers: the home region and `us_east_1` for CloudFront, ACM and the web ACL.
provider "aws" {
  region              = var.region
  allowed_account_ids = [var.account_id]

  default_tags {
    tags = {
      project    = "atlas"
      env        = "dev"
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
      env        = "dev"
      managed_by = "terraform"
    }
  }
}

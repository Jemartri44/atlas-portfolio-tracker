# One provider for the home region and one with the alias `us_east_1` for what is
# global (Budgets and Cost Explorer have their endpoint there). Every resource says
# which one it uses. The account part carries no `env` tag: it belongs to no
# environment (ADR-0034, rows 3 and 20).
provider "aws" {
  region              = var.region
  allowed_account_ids = [var.account_id]

  default_tags {
    tags = {
      project    = "atlas"
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
      managed_by = "terraform"
    }
  }
}

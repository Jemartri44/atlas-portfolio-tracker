# Layer B (E2): one `run` per output of C11 and C12 for this environment. Plans only:
# the data bucket of prod carries prevent_destroy, and an `apply` would fail on cleanup.
mock_provider "aws" {}

mock_provider "aws" {
  alias = "us_east_1"
}

variables {
  account_id                  = "111122223333"
  bucket_suffix               = "abc123def456"
  domain                      = "atlas.example.invalid"
  mail_recipient              = "user@example.invalid"
  oac_spa_id                  = "E2EXAMPLESPA000"
  oac_api_id                  = "E2EXAMPLEAPI000"
  artifact_key                = "builds/0000/lambda.zip"
  artifact_sha256_base64      = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
  mail_sender                 = "atlas@example.invalid"
  jobs_artifact_key           = "builds/0000/jobs.zip"
  jobs_artifact_sha256_base64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
}

run "prod_has_the_web_acl_and_is_enabled" {
  command = plan
  variables {
    edge_mode = "free_plan"
  }
  assert {
    condition     = module.atlas.web_acl_count == 1 && module.atlas.distribution_enabled == true
    error_message = "prod: always the web ACL, always enabled"
  }
}

run "c11_pay_per_use_is_refused_in_prod" {
  command = plan
  variables {
    edge_mode = "pay_per_use"
  }
  expect_failures = [var.edge_mode]
}

run "c12_reserved_by_default" {
  command = plan
  variables {
    edge_mode = "free_plan"
  }
  assert {
    condition     = module.atlas.api_reserved_concurrency == 5
    error_message = "reserved"
  }
}

run "c12_unreserved" {
  command = plan
  variables {
    edge_mode               = "free_plan"
    reserve_api_concurrency = false
  }
  assert {
    condition     = module.atlas.api_reserved_concurrency == -1
    error_message = "unreserved"
  }
}

run "c12_zero_is_refused" {
  command = plan
  variables {
    edge_mode                = "free_plan"
    api_reserved_concurrency = 0
  }
  expect_failures = [var.api_reserved_concurrency]
}

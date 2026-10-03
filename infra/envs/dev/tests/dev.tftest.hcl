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

run "c11_free_plan_dev" {
  command = plan
  variables {
    edge_mode = "free_plan"
  }
  assert {
    condition     = module.atlas.web_acl_count == 1
    error_message = "free_plan: dev has a web ACL"
  }
}

run "c11_dev_pay_per_use" {
  command = plan
  variables {
    edge_mode = "pay_per_use"
  }
  assert {
    condition     = module.atlas.web_acl_count == 0
    error_message = "pay_per_use: dev has no web ACL"
  }
}

run "dev_is_disabled_by_default" {
  command = plan
  variables {
    edge_mode = "free_plan"
  }
  assert {
    condition     = module.atlas.distribution_enabled == false
    error_message = "dev stays idle unless dev_active"
  }
}

run "dev_active_enables_it" {
  command = plan
  variables {
    edge_mode  = "free_plan"
    dev_active = true
  }
  assert {
    condition     = module.atlas.distribution_enabled == true
    error_message = "dev_active is the lever"
  }
}

run "c12_reserved_by_default" {
  command = plan
  variables {
    edge_mode = "free_plan"
  }
  assert {
    condition     = module.atlas.api_reserved_concurrency == 1
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

run "edge_mode_is_validated" {
  command = plan
  variables {
    edge_mode = "none"
  }
  expect_failures = [var.edge_mode]
}

run "c12_zero_is_refused" {
  command = plan
  variables {
    edge_mode                = "free_plan"
    api_reserved_concurrency = 0
  }
  expect_failures = [var.api_reserved_concurrency]
}

run "jobs_schedules_disabled_by_default" {
  command = plan
  variables {
    edge_mode = "free_plan"
  }
  assert {
    condition     = alltrue([for state in values(module.atlas.schedule_states) : state == "DISABLED"])
    error_message = "every schedule of dev is DISABLED unless the lever names it"
  }
}

run "jobs_schedule_lever_enables_only_the_named_one" {
  command = plan
  variables {
    edge_mode       = "free_plan"
    dev_active_jobs = ["ecb"]
  }
  assert {
    condition     = module.atlas.schedule_states["ecb"] == "ENABLED" && module.atlas.schedule_states["mail"] == "DISABLED"
    error_message = "only the family named in dev_active_jobs is ENABLED"
  }
}

run "jobs_lever_rejects_an_unknown_family" {
  command = plan
  variables {
    edge_mode       = "free_plan"
    dev_active_jobs = ["everything"]
  }
  expect_failures = [var.dev_active_jobs]
}

run "c12_jobs_reserved_by_default" {
  command = plan
  variables {
    edge_mode = "free_plan"
  }
  assert {
    condition     = alltrue([for value in values(module.atlas.jobs_reserved_concurrency) : value == 1])
    error_message = "each task reserves 1 execution"
  }
}

run "c12_jobs_unreserved" {
  command = plan
  variables {
    edge_mode                = "free_plan"
    reserve_jobs_concurrency = false
  }
  assert {
    condition     = alltrue([for value in values(module.atlas.jobs_reserved_concurrency) : value == -1])
    error_message = "unreserved when the account has no margin"
  }
}

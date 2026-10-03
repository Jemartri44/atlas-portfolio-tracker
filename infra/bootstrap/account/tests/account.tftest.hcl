# Layer B of the verification (prompt 017, section 4): a plan with a simulated provider,
# one `run` per output of the checks of ADR-0034 that changes the infrastructure. Every
# run is a plan, never an apply: three resources have `prevent_destroy`.
mock_provider "aws" {}

mock_provider "aws" {
  alias = "us_east_1"
}

variables {
  account_id          = "111122223333"
  bucket_suffix       = "abc123def456"
  admin_principal_arn = "arn:aws:iam::111122223333:user/example-admin"
  mail_sender         = "atlas@example.invalid"
  budget_alert_email  = "alerts@example.invalid"
}

run "c2_default_budget_is_one_dollar" {
  command = plan

  assert {
    condition     = aws_budgets_budget.atlas_cost.limit_amount == "1"
    error_message = "the budget must be 1 USD without the customer key"
  }
}

run "c2_customer_key_budget_is_two_dollars" {
  command = plan

  variables {
    use_customer_managed_key = true
  }

  assert {
    condition     = aws_budgets_budget.atlas_cost.limit_amount == "2"
    error_message = "the budget must be 2 USD with the customer key"
  }
}

run "c3_tag_activation_off" {
  command = plan

  assert {
    condition     = length(aws_ce_cost_allocation_tag.project) == 0
    error_message = "the tag is not activated by default"
  }
}

run "c3_tag_activation_on" {
  command = plan

  variables {
    cost_tag_activation = "terraform"
  }

  assert {
    condition     = length(aws_ce_cost_allocation_tag.project) == 1 && aws_ce_cost_allocation_tag.project[0].tag_key == "project"
    error_message = "the second pass activates the project tag"
  }
}

run "c13_use_the_existing_oidc_provider" {
  command = plan

  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 0
    error_message = "no provider is created when one is used"
  }
}

run "c13_create_the_oidc_provider" {
  command = plan

  variables {
    github_oidc_provider_mode = "create"
  }

  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 1
    error_message = "the provider is created when the mode says so"
  }
}

run "c19_use_the_existing_analyzer" {
  command = plan

  assert {
    condition     = length(aws_accessanalyzer_analyzer.external) == 0
    error_message = "no analyzer is created when one is used"
  }
}

run "c19_create_the_analyzer" {
  command = plan

  variables {
    access_analyzer_mode = "create"
  }

  assert {
    condition     = length(aws_accessanalyzer_analyzer.external) == 1
    error_message = "the analyzer is created when the mode says so"
  }
}

run "c9_sender_only" {
  command = plan

  assert {
    condition     = length(aws_sesv2_email_identity.sender) == 1 && length(aws_sesv2_email_identity.recipient) == 0
    error_message = "only the sender is verified outside the sandbox"
  }
}

run "c9_sandbox_verifies_the_recipient_too" {
  command = plan

  variables {
    ses_verify_recipient_identity = true
  }

  assert {
    condition     = length(aws_sesv2_email_identity.recipient) == 1
    error_message = "the recipient is verified in the sandbox"
  }
}

run "ses_use_the_existing_sender" {
  command = plan

  variables {
    ses_create_sender_identity = false
  }

  assert {
    condition     = length(aws_sesv2_email_identity.sender) == 0
    error_message = "an existing sender is used, not created"
  }
}

run "rejects_an_account_that_is_not_twelve_digits" {
  command = plan

  variables {
    account_id = "1234"
  }

  expect_failures = [var.account_id]
}

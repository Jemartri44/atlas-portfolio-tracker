# Layer B: one `run` per output of the checks that change this part, for both
# environments. Plans only (see account.tftest.hcl).
mock_provider "aws" {}

mock_provider "aws" {
  alias = "us_east_1"
}

variables {
  account_id          = "111122223333"
  bucket_suffix       = "abc123def456"
  admin_principal_arn = "arn:aws:iam::111122223333:user/example-admin"
  mail_sender         = "atlas@example.invalid"
}

run "dev_has_three_roles_and_two_oac_and_no_key" {
  command = plan

  variables {
    env = "dev"
  }

  assert {
    condition     = aws_iam_role.deploy.name == "atlas-dev-deploy" && aws_iam_role.plan.name == "atlas-dev-plan" && aws_iam_role.admin.name == "atlas-dev-admin"
    error_message = "the three roles of dev"
  }

  assert {
    condition     = aws_cloudfront_origin_access_control.spa.name == "atlas-dev-spa" && aws_cloudfront_origin_access_control.api.name == "atlas-dev-api"
    error_message = "the two OAC of dev"
  }

  assert {
    condition     = length(aws_kms_key.ssm) == 0
    error_message = "no key without C2"
  }
}

run "prod_has_its_own_names" {
  command = plan

  variables {
    env = "prod"
  }

  assert {
    condition     = aws_iam_role.deploy.name == "atlas-prod-deploy" && aws_iam_policy.boundary.name == "atlas-prod-boundary"
    error_message = "the names of prod"
  }
}

run "c2_customer_key_in_prod" {
  command = plan

  variables {
    env                      = "prod"
    use_customer_managed_key = true
  }

  assert {
    condition     = length(aws_kms_key.ssm) == 1 && aws_kms_key.ssm[0].enable_key_rotation
    error_message = "the key exists and rotates"
  }
}

run "c2_customer_key_is_refused_in_dev" {
  command = plan

  variables {
    env                      = "dev"
    use_customer_managed_key = true
  }

  expect_failures = [var.use_customer_managed_key]
}

run "c5_iam_user_with_mfa" {
  command = plan

  variables {
    env = "dev"
  }

  assert {
    condition     = strcontains(aws_iam_role.admin.assume_role_policy, "aws:MultiFactorAuthPresent")
    error_message = "the user variant requires MFA"
  }
}

run "c5_identity_center_has_no_mfa_condition" {
  command = plan

  variables {
    env              = "dev"
    admin_trust_mode = "identity_center_role"
  }

  assert {
    condition     = !strcontains(aws_iam_role.admin.assume_role_policy, "aws:MultiFactorAuthPresent")
    error_message = "an Identity Center session carries no such key"
  }
}

run "rejects_an_environment_that_is_not_dev_or_prod" {
  command = plan

  variables {
    env = "staging"
  }

  expect_failures = [var.env]
}

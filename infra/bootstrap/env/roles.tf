# The three roles of the bootstrap of an environment (ADR-0034, rows 5, 14 and 16).
# Their permissions boundary is written with a constructed ARN and an explicit
# `depends_on`, not with the attribute of the policy, so that the policies and the
# `iam:PermissionsBoundary` condition are fully known when the plan is rendered.

locals {
  github_oidc_arn = "${local.iam}:oidc-provider/token.actions.githubusercontent.com"

  # dev deploys from the branch `develop`; prod only from the GitHub environment
  # `prod`, which carries the mandatory approval (ADR-0028, row 13).
  deploy_sub = var.env == "dev" ? "repo:${var.github_repository}:ref:refs/heads/develop" : "repo:${var.github_repository}:environment:prod"
  # The sub of a pull request carries neither a branch nor an environment: the plan
  # job declares no `environment:` for that reason (research b0.4).
  plan_sub = "repo:${var.github_repository}:pull_request"

  oidc_trust = { for key, sub in { deploy = local.deploy_sub, plan = local.plan_sub } : key => jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AssumeFromGitHubActions"
      Effect    = "Allow"
      Principal = { Federated = local.github_oidc_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = sub
        }
      }
    }]
  }) }

  # The trust names the administration principal, never the account. An IAM user
  # session carries `aws:MultiFactorAuthPresent`; an Identity Center one does not
  # (research b0.5, SIN VERIFICAR for 018), so that variant cannot require it.
  admin_trust = jsonencode({
    Version = "2012-10-17"
    Statement = [merge(
      {
        Sid       = "AssumeFromTheAdministrationPrincipal"
        Effect    = "Allow"
        Principal = { AWS = var.admin_principal_arn }
        Action    = "sts:AssumeRole"
      },
      var.admin_trust_mode == "iam_user_mfa" ? { Condition = { Bool = { "aws:MultiFactorAuthPresent" = "true" } } } : {},
    )]
  })

  deploy_policy_documents = { for key, statements in local.deploy_groups : key => jsonencode({
    Version = "2012-10-17"
    Statement = [for s in statements : merge(
      { Sid = s.sid, Effect = s.effect, Action = s.actions, Resource = s.resources },
      try(s.condition, null) == null ? {} : { Condition = s.condition },
    )]
  }) }

  policy_documents = {
    plan = jsonencode({
      Version = "2012-10-17"
      Statement = [for s in local.plan_all : merge(
        { Sid = s.sid, Effect = s.effect, Action = s.actions, Resource = s.resources },
        try(s.condition, null) == null ? {} : { Condition = s.condition },
      )]
    })
  }
}

resource "aws_iam_role" "deploy" {
  name                 = local.role_names.deploy
  description          = "Deploys the ${var.env} stack from GitHub Actions."
  assume_role_policy   = local.oidc_trust.deploy
  permissions_boundary = local.boundary_arn

  depends_on = [aws_iam_policy.boundary]
}

resource "aws_iam_policy" "deploy" {
  for_each = local.deploy_policy_documents

  name        = "${local.prefix}-deploy-${each.key}"
  description = "Part ${each.key} of the permissions of the deploy role of ${var.env}."
  policy      = each.value
}

resource "aws_iam_role_policy_attachment" "deploy" {
  for_each = local.deploy_policy_documents

  role       = aws_iam_role.deploy.name
  policy_arn = "${local.iam}:policy/${local.prefix}-deploy-${each.key}"

  depends_on = [aws_iam_policy.deploy]
}

resource "aws_iam_role" "plan" {
  name                 = local.role_names.plan
  description          = "Reads the ${var.env} stack to plan it from a pull request."
  assume_role_policy   = local.oidc_trust.plan
  permissions_boundary = local.boundary_arn

  depends_on = [aws_iam_policy.boundary]
}

resource "aws_iam_role_policy" "plan" {
  name   = "plan"
  role   = aws_iam_role.plan.name
  policy = local.policy_documents.plan
}

# Its permissions arrive in E2, when the resources it names exist.
resource "aws_iam_role" "admin" {
  name                 = local.role_names.admin
  description          = "Administration of ${var.env}, assumed by the user's principal."
  assume_role_policy   = local.admin_trust
  permissions_boundary = local.boundary_arn
  max_session_duration = 3600

  depends_on = [aws_iam_policy.boundary]
}

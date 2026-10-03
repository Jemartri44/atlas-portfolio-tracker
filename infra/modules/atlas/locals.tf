# Everything is built from `var.env` and the variables, never from an attribute of
# another resource, so that each policy is known when the plan is rendered. There is
# no literal environment name in this module: the roots decide (prompt 017, §12.2 N2).
locals {
  prefix = "atlas-${var.env}"
  home   = var.region
  acct   = var.account_id
  iam    = "arn:aws:iam::${local.acct}"

  boundary_arn = "${local.iam}:policy/${local.prefix}-boundary"

  api_role_name = "${local.prefix}-api"
  api_role_arn  = "${local.iam}:role/${local.api_role_name}"
  job_role_arns = [for job in ["ecb", "prices", "mail", "backup", "integrity"] : "${local.iam}:role/${local.prefix}-job-${job}"]
  admin_arn     = "${local.iam}:role/${local.prefix}-admin"
  deploy_arn    = "${local.iam}:role/${local.prefix}-deploy"
  plan_arn      = "${local.iam}:role/${local.prefix}-plan"

  data_name = var.data_bucket_name
  data_arn  = "arn:aws:s3:::${var.data_bucket_name}"
  spa_name  = "${local.prefix}-spa-${var.bucket_suffix}"
  spa_arn   = "arn:aws:s3:::${local.spa_name}"

  ssm_base    = "arn:aws:ssm:${local.home}:${local.acct}:parameter/atlas/${var.env}"
  api_name    = "${local.prefix}-api"
  api_logs    = "arn:aws:logs:${local.home}:${local.acct}:log-group:/aws/lambda/${local.api_name}"
  has_web_acl = var.edge_mode == "free_plan"

  # The managed policies of CloudFront, by identifier (no `data`: it would call AWS).
  # Sources: docs.aws.amazon.com, CloudFront Developer Guide, "Use managed ... policies"
  # (read on 2026-10-03; specs/017 questions.md, E2 block 0, point 3).
  cache_policy_disabled     = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # CachingDisabled
  cache_policy_optimized    = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized
  origin_policy_all_no_host = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # AllViewerExceptHostHeader
  response_policy_security  = "67f7725c-6f97-4210-82d7-5512b31e9d03" # SecurityHeadersPolicy

  # Same policy as the <meta> of apps/web/index.html, plus frame-ancestors, which a
  # <meta> cannot carry (ADR-0028, row 14). A test compares them directive by directive.
  csp = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
}

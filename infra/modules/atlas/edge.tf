# The edge of one environment: certificate, web ACL, the two CloudFront functions (SPA routes and CSP) and distribution.
# CloudFront, ACM and the web ACL are global: provider `aws.us_east_1`.

resource "aws_acm_certificate" "this" {
  provider = aws.us_east_1

  domain_name       = var.domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# Waits for the DNS record the user creates by hand (a documented manual step).
resource "aws_acm_certificate_validation" "this" {
  provider = aws.us_east_1

  certificate_arn = aws_acm_certificate.this.arn
}

# Free flat-rate plan: the web ACL is mandatory with it, and carries at most 5 rules
# (CloudFront Developer Guide, E2 b0.2). One rate rule on /api/*, which protects the
# SSM read quota shared with the other projects of the account.
resource "aws_wafv2_web_acl" "this" {
  count    = local.has_web_acl ? 1 : 0
  provider = aws.us_east_1

  name  = "${local.prefix}-edge"
  scope = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "rate-limit-api"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.rate_limit_per_5_minutes
        aggregate_key_type = "IP"

        scope_down_statement {
          byte_match_statement {
            search_string         = "/api/"
            positional_constraint = "STARTS_WITH"

            field_to_match {
              uri_path {}
            }

            text_transformation {
              priority = 0
              type     = "NONE"
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = false
      metric_name                = "${local.prefix}-rate-limit-api"
      sampled_requests_enabled   = false
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = false
    metric_name                = "${local.prefix}-edge"
    sampled_requests_enabled   = false
  }
}

# The CSP of the web, with `frame-ancestors`, on the responses of the default behaviour
# only. It is NOT attached to /api/*: the Lambda's own pages carry their own CSP, two of
# them with `sandbox` (ADR-0033; docs/api.md section 8), and this must never overwrite it.
resource "aws_cloudfront_function" "csp" {
  provider = aws.us_east_1

  name    = "${local.prefix}-csp"
  runtime = "cloudfront-js-2.0"
  comment = "CSP of the SPA (ADR-0028, row 14)."
  publish = true
  code    = <<-EOT
    function handler(event) {
      var response = event.response;
      response.headers['content-security-policy'] = { value: "${local.csp}" };
      return response;
    }
  EOT
}

# Client-side routes (`/cartera`) have no object in the SPA bucket, and with OAC and no
# ListBucket S3 answers 403. A distribution-wide `custom_error_response` is NOT used: it
# would also rewrite the legitimate 403/404 of /api/*. This viewer-request function is
# attached to the default behaviour only and sends extension-less paths to the shell.
resource "aws_cloudfront_function" "spa_routes" {
  provider = aws.us_east_1

  name    = "${local.prefix}-spa-routes"
  runtime = "cloudfront-js-2.0"
  comment = "Serves index.html for client-side routes of the SPA."
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      var last = request.uri.split('/').pop();
      if (last.indexOf('.') === -1) {
        request.uri = '/index.html';
      }
      return request;
    }
  EOT
}

resource "aws_cloudfront_distribution" "this" {
  provider = aws.us_east_1

  enabled             = var.enabled
  comment             = "Atlas ${var.env}"
  default_root_object = "index.html"
  aliases             = [var.domain]
  http_version        = "http2and3"
  price_class         = "PriceClass_100"
  web_acl_id          = one(aws_wafv2_web_acl.this[*].arn)

  origin {
    origin_id                = "spa"
    domain_name              = "${local.spa_name}.s3.${local.home}.amazonaws.com"
    origin_access_control_id = local.oac_spa_id
  }

  origin {
    origin_id                = "api"
    domain_name              = trimsuffix(trimprefix(aws_lambda_function_url.api.function_url, "https://"), "/")
    origin_access_control_id = local.oac_api_id

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id           = "spa"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = local.cache_policy_optimized
    response_headers_policy_id = local.response_policy_security

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_routes.arn
    }

    function_association {
      event_type   = "viewer-response"
      function_arn = aws_cloudfront_function.csp.arn
    }
  }

  # `CachingDisabled` means no compression either (docs/decision-roadmap.md, "Lo que la
  # 015 le deja a la 017"). The origin request policy forwards every header but Host,
  # so the three of docs/api.md section 8 and `x-amz-content-sha256` reach the Lambda.
  ordered_cache_behavior {
    path_pattern             = "/api/*"
    target_origin_id         = "api"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = false
    cache_policy_id          = local.cache_policy_disabled
    origin_request_policy_id = local.origin_policy_all_no_host
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.this.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

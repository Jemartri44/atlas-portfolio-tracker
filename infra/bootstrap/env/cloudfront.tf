# What the deploy role cannot scope by tag or by name: the OAC of each origin. They
# admit no tag and their ARN is a generated identifier (research b0.3), so the
# bootstrap creates them and the deploy only reads them. The cache, origin request
# and response headers policies are the ones AWS manages, referenced by the stack,
# not created (prompt 017, §12 P4). CloudFront is global: the alias provider.

resource "aws_cloudfront_origin_access_control" "spa" {
  provider = aws.us_east_1

  name                              = "${local.prefix}-spa"
  description                       = "Signs the requests of the ${var.env} distribution to its SPA bucket."
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_origin_access_control" "api" {
  provider = aws.us_east_1

  name                              = "${local.prefix}-api"
  description                       = "Signs the requests of the ${var.env} distribution to the Function URL of its API."
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# The certificate of the distribution is requested here, by hand, and not by the deploy role:
# CloudFront and ACM resources carry a generated identifier, so the role could only be scoped
# over them by tag, and tagging an untagged certificate of another project is the hole this
# closes (security audit 03/11, finding 1). The stack receives its ARN, waits for the
# validation and attaches it; the deploy role can neither request nor delete a certificate.
# The DNS record to create by hand is the sensitive output `certificate_validation_records`.

resource "aws_acm_certificate" "edge" {
  provider = aws.us_east_1

  domain_name       = var.domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

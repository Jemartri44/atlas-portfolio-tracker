# The only parameters Terraform writes (ADR-0034, row 12; ssm-and-config.md section 1):
# two `String`. Every `SecureString` is created by `atlas admin secrets`, never here.
resource "aws_ssm_parameter" "mail_recipient" {
  name  = "/atlas/${var.env}/mail/recipient"
  type  = "String"
  value = var.mail_recipient
}

resource "aws_ssm_parameter" "mail_amounts" {
  name  = "/atlas/${var.env}/mail/amounts"
  type  = "String"
  value = var.mail_amounts
}

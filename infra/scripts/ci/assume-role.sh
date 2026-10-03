#!/usr/bin/env bash
# Assumes a role with the OIDC token of the job (feature 017, E4) with no action of third
# parties: the AWS CLI of the runner and curl. Every value is masked before it is used and
# nothing is printed. usage: assume-role.sh <role-arn>   (the ARN comes from a secret)
set -euo pipefail
role="${1:?role}"
token="$(curl -sSf -H "Authorization: bearer ${ACTIONS_ID_TOKEN_REQUEST_TOKEN}" "${ACTIONS_ID_TOKEN_REQUEST_URL}&audience=sts.amazonaws.com" | jq -r .value)"
printf '::add-mask::%s\n' "$token"
creds="$(aws sts assume-role-with-web-identity --role-arn "$role" --role-session-name atlas-ci \
  --web-identity-token "$token" --duration-seconds 3600 --query Credentials --output json)"
for pair in AWS_ACCESS_KEY_ID:AccessKeyId AWS_SECRET_ACCESS_KEY:SecretAccessKey AWS_SESSION_TOKEN:SessionToken; do
  value="$(jq -r ".${pair#*:}" <<<"$creds")"
  printf '::add-mask::%s\n' "$value"
  printf '%s=%s\n' "${pair%%:*}" "$value" >>"$GITHUB_ENV"
done

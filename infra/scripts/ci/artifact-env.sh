#!/usr/bin/env bash
# The Terraform variables of an artifact set (lambda.zip and jobs.zip under builds/<tree>/),
# read from its SHA256SUMS: the key and the base64 SHA-256. usage: artifact-env.sh <dir> <tree>
set -euo pipefail
dir="${1:?dir}"; tree="${2:?tree}"
[[ "$tree" =~ ^[0-9a-f]{40}$ ]] || { echo "árbol no válido" >&2; exit 64; }
digest() {
  local hex
  hex="$(awk -v f="$1" '$2 == f { print $1 }' "$dir/SHA256SUMS")"
  [[ "$hex" =~ ^[0-9a-f]{64}$ ]] || { echo "SHA256SUMS no lista $1 con un SHA-256 válido" >&2; exit 1; }
  printf '%s' "$hex" | xxd -r -p | base64
}
lambda_digest="$(digest lambda.zip)"; jobs_digest="$(digest jobs.zip)"
printf 'TF_VAR_artifact_key=builds/%s/lambda.zip\n' "$tree"
printf 'TF_VAR_artifact_sha256_base64=%s\n' "$lambda_digest"
printf 'TF_VAR_jobs_artifact_key=builds/%s/jobs.zip\n' "$tree"
printf 'TF_VAR_jobs_artifact_sha256_base64=%s\n' "$jobs_digest"

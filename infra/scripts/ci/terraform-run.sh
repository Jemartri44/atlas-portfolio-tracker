#!/usr/bin/env bash
# `plan` or `apply` of one environment with NO value in a public log (feature 017, E4;
# ADR-0034, row 1; prompt 017 §5): everything terraform prints goes to a file that is never
# uploaded; the log carries the addresses and the actions, and the exit code.
# usage: terraform-run.sh <dev|prod> <plan|apply>
# Needs: ATLAS_TFVARS_B64 and ATLAS_BACKEND_B64 (secrets), RUNNER_TEMP.
set -euo pipefail
env_name="${1:?env}"; mode="${2:?mode}"
case "$env_name" in dev | prod) ;; *) exit 64 ;; esac
[ -n "${ATLAS_TFVARS_B64:-}" ] && [ -n "${ATLAS_BACKEND_B64:-}" ] || { echo "faltan los secretos de $env_name: no se hace nada"; exit 1; }
tmp="${RUNNER_TEMP:?}"; log="$tmp/terraform.log"; : >"$log"
(umask 077; printf '%s' "$ATLAS_TFVARS_B64" | base64 -d >"$tmp/terraform.tfvars"; printf '%s' "$ATLAS_BACKEND_B64" | base64 -d >"$tmp/backend.hcl")
tf() { terraform -chdir="infra/envs/$env_name" "$@"; }
fail() { echo "terraform $1 fallo (codigo $2); su salida no se publica"; exit 1; }
tf init -input=false -backend-config="$tmp/backend.hcl" >>"$log" 2>&1 || fail init $?
lock=()
[ "$mode" = plan ] && lock=(-lock=false) # the plan role reads the state and never writes it (B2)
if [ "$mode" = plan ]; then
  # A plan has no built artifact: placeholders let it run, and the code of both Lambdas always
  # shows as an update in place. A deployment passes the real ones (artifact-env.sh).
  export TF_VAR_artifact_key="${TF_VAR_artifact_key:-builds/plan/lambda.zip}"
  export TF_VAR_jobs_artifact_key="${TF_VAR_jobs_artifact_key:-builds/plan/jobs.zip}"
  zero_digest="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
  export TF_VAR_artifact_sha256_base64="${TF_VAR_artifact_sha256_base64:-$zero_digest}"
  export TF_VAR_jobs_artifact_sha256_base64="${TF_VAR_jobs_artifact_sha256_base64:-$zero_digest}"
fi
tf plan -input=false "${lock[@]}" -var-file="$tmp/terraform.tfvars" -out="$tmp/plan.bin" >>"$log" 2>&1 || fail plan $?
tf show -json "$tmp/plan.bin" 2>>"$log" | "$(dirname "$0")/summarize-plan.sh"
if [ "$mode" = apply ]; then
  tf apply -input=false "$tmp/plan.bin" >>"$log" 2>&1 || fail apply $?
fi

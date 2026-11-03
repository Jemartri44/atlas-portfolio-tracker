#!/usr/bin/env bash
# Prod trusts the set it promotes only if the workflow of dev signed it: GitHub holds an
# attestation of each file that names `deploy-dev.yml` as its signer, and nobody who can write
# the artifacts bucket (but is not that workflow) can mint one. The SHA-256 list in the bucket
# is not a reference: it travels with the files. Needs `gh` and GH_TOKEN.
# usage: verify-attestation.sh <dir>   (GITHUB_REPOSITORY comes from the runner)
set -euo pipefail
dir="${1:?dir}"
repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY}"
for file in lambda.zip jobs.zip spa.tgz; do
  gh attestation verify "$dir/$file" --repo "$repo" \
    --signer-workflow "$repo/.github/workflows/deploy-dev.yml" >/dev/null 2>&1 ||
    { echo "$file no tiene una atestación del flujo de dev: no se despliega" >&2; exit 1; }
done
echo "atestación verificada"

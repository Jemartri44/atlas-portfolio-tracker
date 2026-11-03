#!/usr/bin/env bash
# Prod trusts the set it promotes only if the dev workflow signed THIS source tree: GitHub holds
# an attestation of each file whose signer is `deploy-dev.yml` on `refs/heads/develop`, and the
# commit it names has the tree that prod is deploying. A run of dev on another commit signs its
# own files only; nobody who can merely write the artifacts bucket can sign. The SHA-256 list in
# the bucket is not a reference (it travels with the files). Needs `gh`, `jq`, GH_TOKEN, and the
# repository checked out (the commit is fetched by SHA).
# usage: verify-attestation.sh <dir> <tree>   (GITHUB_REPOSITORY comes from the runner)
set -euo pipefail
dir="${1:?dir}"; tree="${2:?tree}"
[[ "$tree" =~ ^[0-9a-f]{40}$ ]] || { echo "árbol no válido" >&2; exit 64; }
repo="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY}"
for file in lambda.zip jobs.zip spa.tgz; do
  json="$(gh attestation verify "$dir/$file" --repo "$repo" \
    --signer-workflow "$repo/.github/workflows/deploy-dev.yml" \
    --source-ref refs/heads/develop --format json 2>/dev/null)" ||
    { echo "$file no tiene una atestación del flujo de dev en develop: no se despliega" >&2; exit 1; }
  matched=0; fetched=0
  for sha in $(jq -r '.[].verificationResult.signature.certificate.sourceRepositoryDigest // empty' <<<"$json" | sort -u); do
    [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || continue
    git fetch -q --no-tags --depth=1 origin "$sha" 2>/dev/null || continue
    fetched=1
    if [[ "$(git rev-parse 'FETCH_HEAD^{tree}')" == "$tree" ]]; then matched=1; break; fi
  done
  [[ "$matched" == 1 || "$fetched" == 1 ]] ||
    { echo "$file: no se pudo traer de GitHub el commit firmado (¿repositorio privado?)" >&2; exit 1; }
  [[ "$matched" == 1 ]] ||
    { echo "$file está firmado, pero no para este árbol de código: no se despliega" >&2; exit 1; }
done
echo "atestación verificada"

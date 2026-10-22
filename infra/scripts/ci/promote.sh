#!/usr/bin/env bash
# Prod does NOT build: it takes from the artifacts bucket the set that dev wrote for the same
# source tree and checks its SHA-256 before anything is deployed (feature 017, E4). The bucket
# comes from ARTIFACT_BUCKET (a secret); nothing is printed but the verdict.
# usage: promote.sh <out-dir> <tree>
set -euo pipefail
out="${1:?out}"; tree="${2:?tree}"
[[ "$tree" =~ ^[0-9a-f]{40}$ ]] || { echo "árbol no válido" >&2; exit 64; }
mkdir -p "$out"
aws s3 cp "s3://${ARTIFACT_BUCKET}/builds/${tree}/" "$out/" --recursive --only-show-errors >/dev/null 2>&1 ||
  { echo "no hay artefacto de dev para este árbol: despliega dev primero" >&2; exit 1; }
(cd "$out" && sha256sum --check --quiet SHA256SUMS >/dev/null 2>&1) ||
  { echo "el SHA-256 del artefacto no coincide con el que escribió dev" >&2; exit 1; }
# `--check` only verifies what is listed: both ZIPs must be on the list.
for zip in lambda.zip jobs.zip; do
  awk -v f="$zip" '$2 == f { found = 1 } END { exit !found }' "$out/SHA256SUMS" ||
    { echo "SHA256SUMS no lista $zip: el artefacto está incompleto" >&2; exit 1; }
done
echo "artefacto verificado"

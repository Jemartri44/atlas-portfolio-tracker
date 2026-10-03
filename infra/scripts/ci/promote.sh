#!/usr/bin/env bash
# Prod does NOT build: it takes from the artifacts bucket the set that dev wrote for the same
# source tree and checks its SHA-256 before anything is deployed (feature 017, E4). The bucket
# comes from ARTIFACT_BUCKET (a secret); nothing is printed but the verdict.
# usage: promote.sh <out-dir> <tree>
set -euo pipefail
out="${1:?out}"; tree="${2:?tree}"
[[ "$tree" =~ ^[0-9a-f]{40}$ ]] || { echo "tree no valido" >&2; exit 64; }
mkdir -p "$out"
aws s3 cp "s3://${ARTIFACT_BUCKET}/builds/${tree}/" "$out/" --recursive --only-show-errors >/dev/null 2>&1 ||
  { echo "no hay artefacto de dev para este arbol: despliega dev primero" >&2; exit 1; }
(cd "$out" && sha256sum --check --quiet SHA256SUMS >/dev/null 2>&1) ||
  { echo "el SHA-256 del artefacto no coincide con el que escribio dev" >&2; exit 1; }
echo "artefacto verificado"

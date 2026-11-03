#!/usr/bin/env bash
# Publishes the set built by dev under builds/<tree>/ WITHOUT ever overwriting: each object is
# written with `If-None-Match: *`, which the bucket policy requires (BuildsOnlyIfAbsent). The
# SHA256SUMS goes LAST, as the commit marker: a run that dies half way leaves no marker, and
# the next run keeps the objects already there (the stored one replaces the local file, since
# a build is not byte-identical) and writes the rest. If the tree already has its SHA256SUMS,
# the stored set is what dev deploys, the same one prod will promote. The bucket comes from
# ARTIFACT_BUCKET (a secret). usage: publish-set.sh <dir> <tree>
set -euo pipefail
dir="${1:?dir}"; tree="${2:?tree}"
[[ "$tree" =~ ^[0-9a-f]{40}$ ]] || { echo "árbol no válido" >&2; exit 64; }
log="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/publish-set.log"
key() { printf 'builds/%s/%s' "$tree" "$1"; }
# 0 = written, 1 = already there; anything else stops (only the AWS error code is shown).
put() {
  if aws s3api put-object --bucket "$ARTIFACT_BUCKET" --key "$(key "$1")" \
    --body "$dir/$1" --if-none-match '*' >"$log" 2>&1; then
    return 0
  fi
  grep -q 'PreconditionFailed' "$log" && return 1
  echo "no se pudo escribir $1 ($(grep -o 'An error occurred ([A-Za-z]*)' "$log" | head -1))" >&2
  exit 1
}
keep_stored() {
  aws s3 cp "s3://${ARTIFACT_BUCKET}/$(key "$1")" "$dir/$1" --only-show-errors >"$log" 2>&1 ||
    { echo "no se pudo leer $1 ya publicado" >&2; exit 1; }
}
for file in lambda.zip jobs.zip spa.tgz; do
  put "$file" || keep_stored "$file"
done
(cd "$dir" && sha256sum lambda.zip jobs.zip spa.tgz >SHA256SUMS)
if put SHA256SUMS; then
  echo "set publicado"
else
  keep_stored SHA256SUMS
  (cd "$dir" && sha256sum --check --quiet SHA256SUMS >/dev/null 2>&1) ||
    { echo "el set ya publicado para este árbol no coincide con su SHA256SUMS" >&2; exit 1; }
  echo "el árbol ya tenía su set: se despliega el guardado"
fi

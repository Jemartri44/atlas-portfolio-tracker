#!/usr/bin/env bash
# Publishes the set built by dev under builds/<tree>/ WITHOUT ever overwriting: each object is
# written with `If-None-Match: *`, which the bucket policy requires (BuildsOnlyIfAbsent). If the
# tree already has its set, that stored set replaces the local one, so dev deploys exactly what
# prod will later promote. The bucket comes from ARTIFACT_BUCKET (a secret).
# usage: publish-set.sh <dir> <tree>   (the SHA256SUMS goes first: it is the reference)
set -euo pipefail
dir="${1:?dir}"; tree="${2:?tree}"
[[ "$tree" =~ ^[0-9a-f]{40}$ ]] || { echo "árbol no válido" >&2; exit 64; }
log="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/publish-set.log"
existing=0
for file in SHA256SUMS lambda.zip jobs.zip spa.tgz; do
  if aws s3api put-object --bucket "$ARTIFACT_BUCKET" --key "builds/${tree}/${file}" \
    --body "$dir/$file" --if-none-match '*' >"$log" 2>&1; then
    continue
  fi
  grep -q 'PreconditionFailed' "$log" || { echo "no se pudo escribir $file en el bucket de artefactos" >&2; exit 1; }
  existing=1
done
if [[ "$existing" == 1 ]]; then
  # Already published (a re-run, or another run of the same tree): the stored set wins.
  aws s3 cp "s3://${ARTIFACT_BUCKET}/builds/${tree}/" "$dir/" --recursive --only-show-errors >"$log" 2>&1 ||
    { echo "no se pudo leer el set ya publicado para este árbol" >&2; exit 1; }
  (cd "$dir" && sha256sum --check --quiet SHA256SUMS >/dev/null 2>&1) ||
    { echo "el set ya publicado para este árbol no coincide con su SHA256SUMS" >&2; exit 1; }
  echo "el árbol ya tenía su set: se despliega el guardado"
else
  echo "set publicado"
fi

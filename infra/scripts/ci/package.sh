#!/usr/bin/env bash
# Builds ONCE the set that is promoted (feature 017, E4; ADR-0028, "construir una vez y
# promocionar"): the two Lambda ZIPs and the SPA, never `.vite/` nor a `*.map` (P11), with
# their SHA-256. usage: package.sh <out-dir>   (from the root, after `npm run build`)
set -euo pipefail
out="${1:?out}"
mkdir -p "$out"
cp apps/api/dist-lambda/lambda.zip apps/jobs/dist-lambda/jobs.zip "$out/"
tar -C apps/web/dist --exclude='.vite' --exclude='*.map' -czf "$out/spa.tgz" .
(cd "$out" && sha256sum lambda.zip jobs.zip spa.tgz >SHA256SUMS)

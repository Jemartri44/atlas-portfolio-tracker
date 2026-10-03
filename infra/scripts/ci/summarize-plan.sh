#!/usr/bin/env bash
# The only thing a public log carries of a plan (feature 017, E4; ADR-0034, row 1): the
# address of each resource and its action, from `terraform show -json` on stdin. No value.
set -euo pipefail
jq -r '.resource_changes[]? | select(.change.actions != ["no-op"] and .change.actions != ["read"]) | "\(.change.actions | join("+")) \(.address)"'

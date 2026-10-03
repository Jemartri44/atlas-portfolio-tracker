#!/usr/bin/env bash
# The CloudFront flat-rate (Free) plan of one environment (feature 017, E4; ADR-0028,
# exceptions; ADR-0034, rows 19 and 20). Not Terraform: the provider has no resource for
# it. RETIREMENT CONDITION: delete this script when a PUBLISHED version of
# hashicorp/terraform-provider-aws supports `aws_pricingplanmanager_subscription`
# (PR #49235, open at 2026-10-03; issues #45450 and #49232) and the plan is a resource.
#
# usage: flat-rate-plan.sh status|subscribe|cancel --env dev|prod \
#          --distribution-arn <arn> --web-acl-arn <arn>
#
# Idempotent: `subscribe` twice leaves one plan and says so. It refuses with three Free
# plans already in the account (ADR-0034, F9). `cancel` schedules the cancellation (it takes
# effect at the end of the billing period) and only with the environment typed on a
# terminal; there is no --yes. It prints no ARN, no identifier of an account.
set -euo pipefail

die() { printf '%s\n' "$1" >&2; exit "${2:-1}"; }

order="${1:-}"
[ -n "$order" ] && shift || die "uso: flat-rate-plan.sh status|subscribe|cancel --env dev|prod --distribution-arn <arn> --web-acl-arn <arn>" 64
case "$order" in status | subscribe | cancel) ;; *) die "orden desconocida" 64 ;; esac

env_name="" distribution="" web_acl=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --env) env_name="${2:-}"; shift 2 || die "falta el valor de --env" 64 ;;
    --distribution-arn) distribution="${2:-}"; shift 2 || die "falta el valor de --distribution-arn" 64 ;;
    --web-acl-arn) web_acl="${2:-}"; shift 2 || die "falta el valor de --web-acl-arn" 64 ;;
    *) die "opcion desconocida (no hay --yes: se confirma tecleando el entorno)" 64 ;;
  esac
done
case "$env_name" in dev | prod) ;; *) die "--env es dev o prod" 64 ;; esac
[[ "$distribution" =~ ^arn:aws:cloudfront::[0-9]{12}:distribution/[A-Z0-9]+$ ]] || die "--distribution-arn no es el de una distribucion" 64
[[ "$web_acl" =~ ^arn:aws:wafv2:us-east-1:[0-9]{12}:global/webacl/atlas-(dev|prod)-[A-Za-z0-9-]+/[0-9a-f-]+$ ]] || die "--web-acl-arn no es el de una web ACL global de Atlas" 64

region=us-east-1
tagged_for_env() { # $1 = jq expression yielding [{Key,Value}]
  jq -e --arg env "$env_name" "$1 | any(.[]; .Key == \"env\" and .Value == \$env)" >/dev/null
}
# Both resources must carry the tag env of this environment: the script never joins a plan
# to a resource of the other one.
aws --region "$region" cloudfront list-tags-for-resource --resource "$distribution" --output json |
  tagged_for_env '.Tags.Items' || die "la distribucion no lleva la etiqueta env=$env_name: no se toca nada"
aws --region "$region" wafv2 list-tags-for-resource --resource-arn "$web_acl" --output json |
  tagged_for_env '.TagInfoForResource.TagList' || die "la web ACL no lleva la etiqueta env=$env_name: no se toca nada"

subscriptions="$(aws --region "$region" pricing-plan-manager list-subscriptions --output json)"
covering="$(jq -c --arg d "$distribution" '[.subscriptionSummaries[] | select(.resourceArns | index($d))] | first // empty' <<<"$subscriptions")"
free_count="$(jq '[.subscriptionSummaries[] | select(.planFamily == "CloudFront" and .planTier == "FREE")] | length' <<<"$subscriptions")"

case "$order" in
  status)
    if [ -n "$covering" ]; then
      printf '%s\n' "$env_name: cubierto por un plan $(jq -r '.planTier' <<<"$covering"), estado $(jq -r '.status' <<<"$covering"); planes Free en la cuenta: $free_count de 3."
    else
      printf '%s\n' "$env_name: sin plan; planes Free en la cuenta: $free_count de 3."
    fi
    ;;
  subscribe)
    if [ -n "$covering" ]; then
      printf '%s\n' "$env_name: ya esta suscrito; no se hace nada."
      exit 0
    fi
    [ "$free_count" -lt 3 ] || die "$env_name: la cuenta ya tiene tres planes Free: no se suscribe (ADR-0034, F9)."
    aws --region "$region" pricing-plan-manager create-subscription \
      --plan-family CloudFront --plan-tier FREE --usage-level DEFAULT \
      --resource-arns "$distribution" "$web_acl" \
      --approval-mode IMMEDIATE --client-token "atlas-$env_name-flat-rate-free" --output json >/dev/null
    printf '%s\n' "$env_name: suscrito al plan Free."
    ;;
  cancel)
    [ -n "$covering" ] || { printf '%s\n' "$env_name: no hay plan que cancelar."; exit 0; }
    if [ "$(jq -r '.scheduledChange.type // ""' <<<"$covering")" = "CANCELLATION" ]; then
      printf '%s\n' "$env_name: la cancelacion ya esta programada."
      exit 0
    fi
    [ -t 0 ] || die "$env_name: hace falta teclear el entorno y no hay terminal: no se ha tocado nada." 4
    printf 'Cancelar el plan de %s (efectivo al final del periodo; la distribucion pasa a pago por uso). Escribe «%s» para seguir: ' "$env_name" "$env_name"
    read -r typed
    [ "$typed" = "$env_name" ] || { printf '%s\n' "Cancelado: no se ha tocado nada."; exit 0; }
    aws --region "$region" pricing-plan-manager cancel-subscription \
      --arn "$(jq -r '.arn' <<<"$covering")" --if-match "$(jq -r '.eTag' <<<"$covering")" --output json >/dev/null
    printf '%s\n' "$env_name: cancelacion programada."
    ;;
esac

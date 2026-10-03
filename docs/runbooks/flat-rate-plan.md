# El plan de tarifa plana de CloudFront de un entorno

Feature 017, E4 (ADR-0028, excepciones; ADR-0034, filas 19 y 20). **No es Terraform**: el proveedor no tiene el recurso. Guion: `infra/scripts/flat-rate-plan.sh`. **Condición de retirada**: se borra cuando una versión **publicada** de `hashicorp/aws` traiga `aws_pricingplanmanager_subscription` (PR hashicorp/terraform-provider-aws#49235, abierta el 2026-10-03; incidencias #45450 y #49232; la v6.67.0 no la tiene).

Se ensayó contra un `aws` simulado (`infra/test/scripts/flat-rate-plan.test.ts`). **Nada contra AWS en la 017.**

## Antes

La distribución y la *web ACL* del entorno existen (el `apply` de la pila) y llevan la etiqueta `env`. Los ARN salen de la consola de AWS o de `aws cloudfront list-distributions`; **no se escriben en ningún fichero versionado**.

## Pasos

1. `infra/scripts/flat-rate-plan.sh status --env dev --distribution-arn <arn> --web-acl-arn <arn>`: dice si el entorno está cubierto y cuántos planes Free hay en la cuenta (máximo 3).
2. `infra/scripts/flat-rate-plan.sh subscribe --env dev --distribution-arn <arn> --web-acl-arn <arn>`: **idempotente** (con un plan ya suscrito lo dice y no hace nada) y **se niega con tres planes Free** (ADR-0034, F9). Comprueba que los dos recursos llevan `env=<entorno>`.
3. Cancelar: `infra/scripts/flat-rate-plan.sh cancel …` pide **teclear el entorno** y sin terminal sale sin tocar nada. La cancelación se programa para el final del periodo de facturación (Pricing Plan Manager); no hay `--yes`.

Órdenes de la CLI (modelo de servicio `pricing-plan-manager` de botocore, 2025-08-05, región `us-east-1`): `list-subscriptions`, `create-subscription` (familia `CloudFront`, nivel `FREE`, con `--client-token atlas-<entorno>-flat-rate-free`), `cancel-subscription` (con `--if-match`).

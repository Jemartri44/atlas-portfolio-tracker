# Aplicar el *bootstrap* por partes y activar la CI de `infra/`

Feature 017, E4. **Ninguno de estos pasos se ejecuta en la 017**; los hace la persona en la 018, con el visto bueno y `specs/017-infrastructure-as-code/cost.md` delante.

## Aplicar el *bootstrap* (ADR-0034, filas 5 y 20)

1. Cuenta, luego `dev`, y `prod` solo cuando `dev` funciona: `terraform -chdir=infra/bootstrap/<account|env> init` y `apply -var-file=<ruta privada>/terraform.tfvars` (`env` con `env=dev` o `env=prod`). Los `tfvars` y el estado viven en `~/personal/atlas/privado/terraform/bootstrap/<account|dev|prod>/`, nunca en el repositorio.
2. **Respalda el estado local tras cada `apply`**, en el mismo disco que la copia fuera de AWS.
3. **La segunda pasada de la etiqueta**: la clave `project` tarda hasta 24 horas en aparecer en *Cost Allocation Tags*; pasado ese plazo, `cost_tag_activation = "terraform"` y otro `apply` de la cuenta.
4. Si cambia `infra/bootstrap/`, la casilla de la plantilla de PR dice qué partes se aplicaron y cuándo.

## Reconstruir el estado local del *bootstrap* si se pierde

Con las credenciales de administración y el `terraform.tfvars` de esa parte: `terraform init` y un `terraform import <dirección> <id>` por recurso (la lista sale de `terraform plan` sin estado: lo que propone crear y ya existe). Después, `plan` sin cambios. Si no hay copia, es esto o empezar de cero.

## Activar y desactivar `dev` (`dev_active`)

`dev` duerme: `dev_active = false`. La única palanca es la variable, desde el *pipeline* de `dev`; nada a mano en la consola.

## Activar los flujos de la CI (018)

1. Secretos del repositorio: `ATLAS_PLAN_{DEV,PROD}_{ROLE_ARN,TFVARS_B64,BACKEND_B64}`, `ATLAS_DEV_{DEPLOY_ROLE_ARN,TFVARS_B64,BACKEND_B64,SPA_BUCKET}` y `ATLAS_ARTIFACT_BUCKET`. Del *environment* `prod`: `ATLAS_PROD_{DEPLOY_ROLE_ARN,TFVARS_B64,BACKEND_B64,SPA_BUCKET}`. Los `*_B64` son el fichero en base64 (un valor de una línea).
2. El *environment* `prod`: aprobación obligatoria y **regla de rama que solo admite `main`** (configuración de GitHub).
3. Variables del repositorio `ATLAS_INFRA_PLAN_ENABLED` y `ATLAS_DEPLOY_ENABLED` a `true`. Hoy no existen y los flujos son inertes.
4. Un `plan` sale en el registro como direcciones y acciones; el completo se revisa en local antes de cada `apply`.

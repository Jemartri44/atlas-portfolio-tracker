# Variables de Terraform (propuesta, §11.2 b)

`S` = lleva `sensitive = true`. Todas con bloque `validation`. Los valores viven en `terraform.tfvars` fuera del repositorio; en el repositorio, solo `*.tfvars.example` con marcadores (`000000000000`, `example.invalid`, `atlas@example.invalid`). **La cuenta no es `S`** (ADR-0034, fila 1).

| Variable | Dónde | S | Validación |
|---|---|---|---|
| `env` | bootstrap/env, envs | no | `dev` o `prod` |
| `region` | todas | no | `eu-west-1` |
| `account_id` | todas | no | 12 cifras |
| `bucket_suffix` | todas | **S** | minúsculas y cifras, 6-16 |
| `domain` | envs | **S** | nombre DNS válido; subdominio |
| `mail_recipient` | envs | **S** | regla de `ssm-and-config.md` §1 (ASCII, una `@`, ≤ 254, sin espacios, comas, `<`, `>`, saltos) |
| `mail_sender` | envs, bootstrap/account | no (decisión de E1: el límite de permisos nombra la identidad; ADR-0034, fila 1, solo marca dominio y destinatario) | ídem |
| `mail_amounts` | envs | no | `on` u `off` (por defecto `off`) |
| `dev_active` | envs/dev | no | bool, por defecto `false` |
| `dev_active_jobs` | envs/dev | no | conjunto de familias (`ecb`, `prices`, `mail`, `backup`, `integrity`), por defecto vacío: las programaciones nombradas pasan a `ENABLED`; `prod` las activa todas |
| `edge_mode` | envs | no | `free_plan` o `pay_per_use` |
| `use_customer_managed_key` | bootstrap/env (`prod`) | no | bool; `true` solo con `env = prod` |
| `admin_principal_arn` | bootstrap/env y account | **S** | ARN de IAM de usuario o rol |
| `admin_trust_mode` | bootstrap/env | no | `iam_user_mfa` o `identity_center_role` |
| `github_repository` | bootstrap/env | no | `Jemartri44/atlas-portfolio-tracker` (público) |
| `github_oidc_provider_mode`, `access_analyzer_mode` | bootstrap/account | no | `use_existing` o `create` |
| `ses_create_sender_identity`, `ses_verify_recipient_identity` | bootstrap/account | no | bool |
| `cost_tag_activation` | bootstrap/account | no | `off` o `terraform` |
| `budget_alert_email` | bootstrap/account | **S** | dirección válida |
| `api_reserved_concurrency` | envs | no | entero ≥ 1 (por defecto 1 en `dev`, 5 en `prod`) |
| `reserve_api_concurrency`, `reserve_jobs_concurrency` | envs | no | bool, por defecto `true`; `false` deja sin reservar si la cuenta no tiene margen (C12). Cada tarea reserva siempre 1 (ADR-0029) |
| `prices_eodhd_daily_calls`, `prices_alpha_vantage_daily_calls`, `prices_failure_threshold` | envs | no | rangos de `ssm-and-config.md` §2 (0-20, 0-25, 1-30) |
| `prices_sources` | envs/prod | no | `eodhd` y/o `alpha_vantage` sin repetir; `simulated` rechazado (`dev` lo lleva fijo) |
| `oauth_idle_warning_days`, `ledger_size_warning_bytes` | envs | no | rangos de `ssm-and-config.md` §2 |
| `jobs_artifact_key`, `jobs_artifact_sha256_base64` | envs | no | clave relativa de `jobs.zip` en el bucket de artefactos y su SHA-256 en base64 |
| `state_key_prefix` | envs (config parcial) | no | `envs/<env>` |

**`ATLAS_ORIGIN`** (de la API y de la función de correo) deriva de `domain` (`S`): va como variable de entorno de las Lambdas, visible para quien lea la configuración de la función en la cuenta; se anota como riesgo en `questions.md` (Q-5).

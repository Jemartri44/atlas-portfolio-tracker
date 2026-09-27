# Contrato: parámetros de SSM y configuración de cada función (**aceptado** el 2026-09-27, §7.2 (a) y (b))

Con la forma de `docs/api.md` §9. `<entorno>` es `dev` o `prod`.

## 1. Parámetros de SSM

| Parámetro | Tipo | Quién lo escribe | Valor | Quién lo lee | Caché |
|---|---|---|---|---|---|
| `/atlas/<entorno>/mail/recipient` | `String` | **Terraform**, desde `terraform.tfvars` (ADR-0034, fila 12; §8.2 M3); nunca el guion de secretos | una dirección: ASCII, una sola `@`, sin espacios, comas, `<`, `>` ni saltos de línea, como mucho 254 caracteres. Lo mismo va a la condición `ses:Recipients` | solo el adaptador de SES (`aws/mail.ts`), en cada envío | ninguna |
| `/atlas/<entorno>/mail/amounts` | `String` | **Terraform**, desde `terraform.tfvars`, **por defecto `off`** (ADR-0028, fila 18; §8.2 M3) | `on` enciende los importes; **cualquier otra cosa, o ausente, los deja apagados** | solo la composición de la función de correo (§8.2 M2) | ninguna |
| `/atlas/<entorno>/prices/eodhd-key` | `SecureString` | el **guion de secretos**, con `atlas-<entorno>-admin` (ADR-0034, fila 21) | la clave, tal cual | solo la función de precios, en cada ejecución | ninguna |
| `/atlas/<entorno>/prices/alpha-vantage-key` | `SecureString` | ídem | ídem | ídem | ninguna |

- **`dev` no lleva las claves del usuario** (ADR-0034, fila 2): sin ellas, la función de precios no descarga (`prices_no_keys`).
- Un parámetro de clave ausente = esa fuente no está; vacío o con espacios = `price_key_invalid`, sin su valor.
- El destinatario y el interruptor **no son secretos** (`String`): no hacen falta permisos de KMS para leerlos.
- Ningún nombre de parámetro de esta feature cae bajo `/atlas/<entorno>/device-tokens/`, `/auth/` ni se solapa con ellos.

## 2. Variables de entorno de cada función

**Ningún secreto en una variable de entorno.** Una variable `ATLAS_*` desconocida, o un valor que no se entiende, impide arrancar (`jobs_config_invalid`, con `details.variable` y `details.reason`), como `parseApiConfig`. Todas las de la tabla son **obligatorias en la función que las usa y desconocidas en las demás**: una función de precios con `ATLAS_MAIL_FROM` no arranca.

| Variable | Funciones | Valor (Terraform) | Regla y techo fijo en el código |
|---|---|---|---|
| `ATLAS_ENV` | todas | `dev` / `prod` | uno de los dos |
| `ATLAS_DATA_BUCKET` | todas | `atlas-<entorno>-data-<sufijo>` | la regla de la API |
| `ATLAS_JOBS` | todas | la lista de su familia, separada por comas | tareas del catálogo, **de una sola familia** (`mixed_families`), sin repetidas |
| `ATLAS_MAIL_FROM` | correo | el remitente verificado, de `terraform.tfvars` | la regla del destinatario |
| `ATLAS_ORIGIN` | correo | el origen de la aplicación | la regla de la API (`https://…`); es lo único que un correo puede enlazar |
| `ATLAS_OAUTH_IDLE_WARNING_DAYS` | correo | `150` | entero de 1 a **179** (por debajo de los seis meses de Google, ADR-0027) |
| `ATLAS_PRICE_SOURCES` | precios | `eodhd,alpha_vantage` (el orden de la cascada) | fuentes conocidas, sin repetidas; `simulated` solo si `ATLAS_ENV=dev` (§8.1 P14, §8.2 m3) |
| `ATLAS_PRICES_EODHD_DAILY_CALLS` | precios | `18` | entero de 0 a **20** (el cupo del plan gratuito); `0` apaga la fuente |
| `ATLAS_PRICES_ALPHA_VANTAGE_DAILY_CALLS` | precios | `23` | entero de 0 a **25** |
| `ATLAS_PRICES_FAILURE_THRESHOLD` | precios | `3` | entero de 1 a 30 |
| `ATLAS_LEDGER_SIZE_WARNING_BYTES` | integridad | `1048576` | entero de 1.024 a 104.857.600 |

- **La fuente simulada**: `ATLAS_PRICE_SOURCES=simulated` con `ATLAS_ENV=prod` → `jobs_config_invalid` (`reason: simulated_in_prod`), y la función no arranca (§8.2 m3). En `dev`, la simulada **sustituye** a las reales: nunca se mezclan.
- **Por qué los presupuestos son variables y no un `prices/config.json` del bucket**: §8.2 M5. Cambiarlos es cambiar `terraform.tfvars` (procedimiento 3 de E4).

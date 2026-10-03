# Coste de la infraestructura (`017-infrastructure-as-code`)

> **Cualquier `apply` necesita el visto bueno del usuario con esta estimación delante.** Esta tabla es una **lista cerrada**: un tipo de recurso que no figura aquí hace fallar el test de `infra/test/` (prompt 017, §12.2 N1). Añadir un tipo es una decisión de coste: se escribe aquí, con su motivo, en el mismo commit que el recurso.

Estado: **cerrada en E4** (cuenta, datos y borde, tareas y correo, más lo que corre fuera de Terraform); las filas de E2 a E4 son las previstas en `plan.md` y se confirman con la fuente de cada servicio en el bloque 0 de su entrega. La suma esperada cae en 0,01-0,05 $/mes (ADR-0028, ADR-0034, fila 9); **si al verificar las fuentes no sale, se para**. Lo que mide el consumo real es la 018 (Cost Explorer), no esta tabla.

| Tipo de recurso | Parte | Entrega | Coste esperado | Qué lo haría crecer |
|---|---|---|---|---|
| `aws_s3_bucket` | cuenta (estado, artefactos), `dev`, `prod` (datos, SPA) | E1, E2 | céntimos al año con este tráfico | versiones no vigentes sin ciclo de vida; cargas multiparte a medias |
| `aws_s3_bucket_versioning` | las mismas | E1, E2 | incluido en el bucket | cada versión se cobra como un objeto |
| `aws_s3_bucket_server_side_encryption_configuration` | las mismas | E1, E2 | 0 (SSE-S3) | una clave KMS en lugar de SSE-S3 (no entra, ADR-0034, fila 8) |
| `aws_s3_bucket_public_access_block` | las mismas | E1, E2 | 0 | — |
| `aws_s3_bucket_ownership_controls` | las mismas | E1, E2 | 0 | — |
| `aws_s3_bucket_policy` | las mismas | E1, E2 | 0 | — |
| `aws_s3_bucket_lifecycle_configuration` | artefactos; datos (E2) | E1, E2 | 0; reduce el coste | — |
| `aws_budgets_budget` | cuenta (`atlas-cost`) | E1 | 0 (sin acciones ni informes, ADR-0034, fila 9) | acciones de Budgets o presupuestos de más |
| `aws_ce_cost_allocation_tag` | cuenta | E1 | 0 | — |
| `aws_iam_openid_connect_provider` | cuenta | E1 | 0 | — |
| `aws_accessanalyzer_analyzer` | cuenta | E1 | 0 (acceso externo, sin analizador de uso no utilizado) | el analizador de accesos no utilizados se factura: no se crea |
| `aws_sesv2_email_identity` | cuenta | E1 | 0 | el envío en sí lo cobra SES por mensaje (E3) |
| `aws_iam_policy` | `dev`, `prod` | E1 | 0 | — |
| `aws_iam_role` | `dev`, `prod` | E1, E2, E3 | 0 | — |
| `aws_iam_role_policy` | `dev`, `prod` | E1, E2, E3 | 0 | — |
| `aws_iam_role_policy_attachment` | `dev`, `prod` | E1 | 0 | — |
| `aws_cloudfront_origin_access_control` | `dev`, `prod` | E1 | 0 | — |
| `aws_kms_key` | `prod`, solo con C2 | E1 | **1 $/mes** (ADR-0034, fila 8; las 20.000 peticiones gratuitas al mes son de la cuenta, fila 13) | la alarma pasa de 1 a 2 $ con esta clave |
| `aws_kms_alias` | `prod`, solo con C2 | E1 | 0 | — |
| `aws_lambda_function` | `dev`, `prod`: 6 por entorno (la API y las cinco tareas) | E2, E3 | nivel gratuito compartido de la cuenta | concurrencia provisionada y VPC (no entran) |
| `aws_lambda_function_url` | `dev`, `prod` | E2 | 0 | — |
| `aws_lambda_permission` | `dev`, `prod` | E2, E3 | 0 | — |
| `aws_cloudwatch_log_group` | `dev`, `prod` | E2, E3 | céntimos; retención 30 y 7 días | retención sin límite |
| `aws_cloudfront_distribution` | `dev`, `prod` | E2 | 0 con el plan Free; de pago por uso en la salida sin plan | una *web ACL* fuera del plan (ver la fila de `aws_wafv2_web_acl`) |
| `aws_cloudfront_function` | `dev`, `prod` | E2 | 0 en el plan Free (SIN VERIFICAR, E2 b0.2) | — |
| `aws_wafv2_web_acl` | `dev`, `prod` | E2 | 0 con el plan Free | fuera del plan: 7-8 $/mes (estimación del plan, SIN VERIFICAR, E2 b0.2) |
| `aws_acm_certificate` | `dev`, `prod` | E2 | 0 | — |
| `aws_acm_certificate_validation` | `dev`, `prod` | E2 | 0 (espera el registro DNS que crea el usuario) | — |
| `aws_scheduler_schedule_group` | `dev`, `prod` | E3 | 0 (solo se facturan invocaciones, con 14 millones gratis al mes, `aws.amazon.com/eventbridge/pricing`, E3 b0) | — |
| `aws_scheduler_schedule` | `dev`, `prod`: 5 por entorno | E3 | 0: unas 300 invocaciones al mes entre los dos entornos, frente a 14 millones gratis (E3 b0) | programaciones de más o una frecuencia mayor que la diaria |
| `aws_lambda_function_event_invoke_config` | `dev`, `prod`: 5 por entorno | E3 | 0 (configuración de la función) | — |
| `aws_ssm_parameter` | `dev`, `prod`: solo `String` | E3 | 0 (estándar) | parámetros avanzados; rendimiento alto |

## Cierre (E4)

E4 no añade ningún tipo de recurso de Terraform: la orden `atlas admin secrets` escribe parámetros `SecureString` estándar (sin cargo, ADR-0033 F1; las 20.000 peticiones gratuitas de KMS son de la cuenta), el guion del plan de tarifa plana suscribe un plan Free (0 $; cancelarlo devuelve la distribución al pago por uso) y los flujos de Actions no cuestan en un repositorio público. El bucket de artefactos y su caducidad (90 días) ya están en `aws_s3_bucket*` de E1. **Suma esperada: del orden de 0,01-0,05 $ al mes** (S3 y Lambda a céntimos, SES unos 10 correos al mes, todo lo demás a 0), **más 1 $ al mes solo si C2 adopta la clave KMS del cliente**. Fuente de cada fila: la columna «Coste esperado», con las páginas de precios consultadas en E2 y E3. El consumo real lo mide la 018 con Cost Explorer.

## Cómo se comprueba

`infra/test/cost.test.ts` lee esta tabla (la primera columna, entre comillas inversas) y la cruza con los tipos de recurso del `plan` renderizado de cada raíz: un tipo que no está aquí falla, y un tipo de esta tabla que ninguna entrega construye aún se marca con su entrega prevista (`E2`, `E3`), nunca en silencio.

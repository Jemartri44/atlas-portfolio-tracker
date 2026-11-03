# Comprobaciones del primer despliegue (018, `dev`)

Lo que las features 015, 016 y 017 dejaron **sin verificar contra AWS real**. Cada punto se comprueba en `dev`, con datos sintéticos, y lo que se encuentre se escribe en el ADR que corresponda el mismo día. Es la parte de la 018 de [`decision-roadmap.md`](decision-roadmap.md); los procedimientos que dependen de AWS real están en [`runbooks/`](runbooks/README.md) y se probaron solo con dobles. La prueba de extremo a extremo es la de ADR-0035: dos dispositivos escribiendo contra la nube, con un `412` y su reintento guiado.

## Antes del primer `apply`

- Reaplicar a mano el *bootstrap* de **la cuenta y de cada entorno**, `dev` primero y `prod` después (cambiaron el límite y las políticas de despliegue; sin ello el primer `apply` recibe `AccessDenied`). La parte `env` crea ahora el bucket de datos y el certificado: su `terraform.tfvars` lleva `domain` (el mismo que el del *stack*, nada lo comprueba), y de sus salidas `certificate_arn` va al `tfvars` del *stack* y `certificate_validation_records` es el registro DNS que se crea a mano.
- **Object Lock del bucket de datos (irreversible).** Al reaplicar el *bootstrap* de cada entorno, `dev` primero, el `plan` debe mostrar `aws_s3_bucket_object_lock_configuration.data` **creándose** y el bucket **sin reemplazar** (si el `plan` quisiera reemplazar el bucket, parar y avisar). Una vez aplicado, Object Lock no se desactiva y el versionado no se suspende. Comprobar con `aws s3api get-object-lock-configuration --bucket <bucket>` (`ObjectLockEnabled: Enabled`, sin `Rule`) y, tras la primera copia mensual, con `aws s3api get-object-retention` sobre un objeto de `backups/` (`GOVERNANCE`, fecha a un año). **Orden**: aplicar el *bootstrap* **antes** de desplegar la Lambda nueva de copias; con la política nueva, la Lambda vieja (que escribe sin bloqueo) falla al copiar. Un `PutObject` con Object Lock exige suma de comprobación: el SDK la envía por defecto (3.1141.0); confirmarlo en la primera copia real. Quitar `use_customer_managed_key` de los `terraform.tfvars` locales (Terraform avisa de que ya no existe, sin fallar).
- `gh attestation verify` acepta la atestación de `deploy-dev.yml` en el primer despliegue de `prod`. Hay que mirar el JSON real de `gh attestation verify --format json` (el campo `verificationResult.signature.certificate.sourceRepositoryDigest` se da por supuesto) y, si no está, `verify-attestation.sh` falla cerrado y se corrige el nombre (ADR-0034, nota del 2026-11-03); si el plan de GitHub no la ofrece para este repositorio, queda sin referencia fuera del bucket y se vuelve a decidir.
- El usuario hace las comprobaciones C1-C19 de ADR-0034 y contesta sus preguntas: C2 ya no decide nada (sin clave KMS propia, ADR-0034 nota del 2026-11-03), C11 si `dev` va con plan Free o CloudFront de pago por uso, C5 la confianza del rol de administración.
- El **simulador de políticas de IAM** con los tres escenarios de ADR-0034, fila 5: condición para aplicar. Lo que la 017 comprobó por análisis estático lo hizo con un evaluador propio de tests (`infra/test/lib/iam.ts`), solo de tests y con lista cerrada de operadores.
- Estimación de coste de `infra/test/contract/cost.md` delante, y visto bueno del usuario al primer `apply`.
- Tareas del usuario: verificación en dos pasos de Google, clientes OAuth de `dev` y `prod`, remitente en SES (y destinatario si sigue en el *sandbox*), secretos con el guion de administración (ADR-0034, fila 21) y, en `terraform.tfvars`, subdominios, remitente, destinatario e interruptor de importes ([`runbooks/mail-recipient-and-amounts.md`](runbooks/mail-recipient-and-amounts.md)).
- El *environment* `prod` de GitHub lleva una regla de rama que solo admite `main`.
- La Lambda se despliega **antes** que los clientes que escriban una versión nueva del esquema (ADR-0026, caso 6).

## Comprobaciones contra AWS real

**Acceso y sesión**
- **Cookies de la Function URL:** si una misma `__Host-atlas_session` llega en `cookies` **y** en la cabecera `cookie`. La API lo trata como `session_invalid`, así que toda sesión fallaría. Se comprueba con un inicio de sesión real.
- **`Sec-Fetch-Site` y `Origin`** llegan a la Lambda en `/api/*`. Sin ellas el inicio de sesión de la web crea un dispositivo nuevo cada vez y toda escritura con cookie da `origin_rejected`. Dos inicios de sesión seguidos desde el mismo navegador tienen que conservar el `device_id`.
- **Uso único del código de la consola:** dos canjes simultáneos de `POST /api/auth/console/token`; solo uno prospera (el otro, `409 console_code_used` o `503 remote_unavailable`) y queda un solo registro en `/atlas/dev/device-tokens/`.
- **Revocar surte efecto al instante:** un `GetParameter` justo después del `PutParameter` de revocación lee el valor revocado; usar el token en la petición siguiente da `401 device_token_revoked`.
- **Vuelta a `http://127.0.0.1`** en el navegador real del usuario, incluido que el reenvío de WSL en modo NAT escuche en el literal `127.0.0.1`.
- **Qué principal asume el rol de administración** (C5): con IAM Identity Center, `aws sso login`; con un usuario IAM con MFA, la sesión se abre antes por la CLI (`aws configure export-credentials`). Y que `aws:PrincipalArn` de una sesión de Identity Center deje al administrador dentro de las cerraduras de los buckets.

**Libro y permisos de S3**
- **`404` y no `403`:** un `s3:ListBucket` con la condición `s3:prefix` basta para que un `GetObject` de una clave inexistente dé `404` (la condición no existe en el contexto de `GetObject`). Si da `403`, la salida es un `s3:ListBucket` sin condición sobre el bucket de datos. Hay que comprobarlo también en el primer `init`.
- **Carrera real de dos `PutObject` condicionales** sobre el libro: una escribe y la otra recibe `412` (S3 responde `412` o `409`, la API traduce los dos).
- El refresco del bucket de datos funciona para los roles de despliegue y de `plan` con solo `s3:ListBucket` y lecturas de configuración (ADR-0034, fila 25), y el rol de despliegue acepta `aws s3 sync --delete` sobre el bucket de la SPA.
- `s3:ObjectCreationOperation` vale `true` en un `PutObject` simple, para la política de `backups/*`; si no, basta la condición `Null`. Escribir en `backups/` sin `If-None-Match` tiene que dar `403`.
- IAM acepta `eu-west-1` y `us-east-1` en `aws:RequestedRegion` de las llamadas globales; el nombre IAM exacto de S3 Metadata v2 y su disponibilidad en `eu-west-1`; `wafv2:AssociateWebACL` y las lecturas de políticas gestionadas de CloudFront en el `apply`.

**KMS, SES y SSM**
- `kms:Decrypt` sobre `aws/ssm` para la API, las claves de precios y los tokens (la documentación se contradice; la salida, una declaración con `kms:ViaService`, está en el bloque 0.4 de E2 de la 017). «Sin descifrar» no lo impone IAM.
- Qué ARN evalúa SES con dominio y dirección verificados a la vez, y si el *sandbox* exige permiso sobre la identidad del destinatario. Un correo llega de verdad solo a la dirección de la condición.
- `GetParameter` sin descifrar basta para comprobar la existencia con `aws/ssm`; `PutParameter` con `Overwrite` y el mismo `Type` no cambia el tipo.

**Borde, planes y tareas**
- Que la cuenta no sea inelegible para el plan Free por usar Free Tier; el nivel gratuito del pago por uso de `dev`; los nombres exactos de las opciones de `aws pricing-plan-manager`; el efecto del `client-token` fijo por entorno tras cancelar y rehacer una suscripción.
- Que la distribución con `CachingDisabled` entregue las *cookies* y las cuatro cabeceras; que la regla de ritmo del WAF (300 por IP y 5 minutos, provisional y sin fuente) sea adecuada.
- La función `viewer-request` `spa_routes` (reescribe a `/index.html` las rutas sin extensión; `/api/*` no se toca) se despliega con la 018: sin ella, recargar `/cartera` recibe el 403 XML de S3.
- Que Scheduler asuma el rol con la condición del grupo (ARN exacto de `atlas-<entorno>-jobs` y `aws:SourceAccount`, fila 29); que la cuenta tenga margen para reservar 1 + 1 + 5 + 10 ejecuciones y que las cifras de concurrencia (1 en `dev`, 5 en `prod`) sean las buenas; el tiempo y la memoria de la API (256 MB, 30 s) y de las cinco funciones, sobre todo el volcado y la integridad con un libro de tamaño real.
- Las órdenes `get-schedule` y `update-schedule` de [`runbooks/ecb-history-in-the-cloud.md`](runbooks/ecb-history-in-the-cloud.md) con `iam:PassRole`.
- Que una PR de *fork* no reciba OIDC; el enmascarado de un `tfvars` en base64 decodificado.
- Al mes: contrastar el coste etiquetado `project=atlas` en Cost Explorer, incluida la atribución de SES y de Scheduler (ADR-0034, Consecuencias).

## Ensayos contra `dev`

Con datos sintéticos: restaurar el libro, **revocar todos los tokens** y **la cuenta de Google robada** ([`runbooks/`](runbooks/README.md)); la lista permitida con `file://` desde `~/.config/atlas`, la clave de sesión con `--value="$(…)"`, el programa de `jq` contra SSM de verdad y `atlas admin` contra el versionado real del bucket (`restore --from s3-version:<id>`). Después, vaciar el bucket de `dev` con su rol de administración, destruir `dev` y levantarlo restaurando desde la copia fuera de AWS (ADR-0032). Los procedimientos de los runbooks `bootstrap-and-ci.md` y `atlas-admin-secrets.md` solo se comprobaron por lectura. Lo que no cuadre vuelve al procedimiento.

## Decisiones que la 017 dejó abiertas (propuestas, las decide el usuario)

- **Acción de credenciales en el flujo:** el flujo obtiene el token OIDC con `curl` y `aws sts assume-role-with-web-identity` (`infra/scripts/ci/assume-role.sh`) para no añadir `aws-actions/configure-aws-credentials`. Propuesta: mantenerlo, o adoptar la acción oficial fijada por SHA y anotarla en [`dependencies.md`](dependencies.md).
- **Fuentes de `tfvars`:** los secretos de la CI y los ficheros locales de `privado/` pueden divergir; elegir una o aceptar el riesgo por escrito. El artefacto se identifica por el *tree* de git (`builds/<tree>/`) y no por el SHA del commit; el SHA-256 viaja en `SHA256SUMS` junto a los ZIP, así que quien pueda escribir el bucket de artefactos podría cambiar ambos.
- **Nota pendiente de ADR-0034:** el estado de las raíces solo lo leen y escriben `atlas-<env>-deploy`, `atlas-<env>-plan` y el administrador; la caducidad de 90 días de los artefactos es provisional y sin fuente; las creaciones sobre `"*"` con `aws:RequestTag/env` (`CreateDistribution`, `CreateFunction`, `RequestCertificate`) y su riesgo frente a otros proyectos de la cuenta; la lista de acciones de configuración del bucket de datos (fila 6) no es cerrada; y `managed_by=atlas-admin-secrets` en lo que crea el guion.
- La política del rol de correo sale `(sensitive value)` en el `plan` de la CI, y un cambio de ella no se ve al revisar: aceptarlo o separar la sentencia de envío en una política propia. La identidad SES del destinatario en el *sandbox* se concede si C9 dice que la cuenta está en él, o se resuelve con el primer envío.
- Lo que la 017 no ejecutó: varios mutantes (lo que no figura como «visto morir» no se ha visto morir), la revisión por zonas Z7 y Z8 y el SHA congelado de E4. El token Flex de IBKR no lo incluye `atlas admin secrets` porque ningún contrato le da nombre.

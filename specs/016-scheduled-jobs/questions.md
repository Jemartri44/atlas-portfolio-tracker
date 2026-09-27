# Preguntas y verificaciones de la feature 016

Fechas en `Europe/Madrid`. Todo lo ejecutado está en el *scratchpad* de la sesión, en ficheros con el sufijo o el prefijo `016` (`016-build-baseline.log`, `016-gate.sh`, `016-pipeline.sh`, y las páginas descargadas del bloque 0 en `aws-research-016/`), nunca en el repositorio. Las citas son literales.

---

## 0. Estado: alto del plan (2026-09-27)

`spec.md`, `plan.md` y los artefactos del plan (`research.md`, `data-model.md`, `contracts/` y `quickstart.md`) están escritos. **No hay ninguna línea de código de producción.** `/speckit-clarify` no se ha ejecutado: el encargo llega con sus diecinueve preguntas respondidas (§8.1) y la ronda 1 decidida (§8.2), y lo que queda abierto son decisiones de la dirección, que van aquí (§5), no preguntas al usuario.

- **Bloque 0 de E1**: hecho (§1). **El punto 1, el único que para, sale bien**: la acción es `ses:SendEmail` y las claves `ses:FromAddress` y `ses:Recipients` se aplican a `SendEmail` de la API v2. Los puntos 2, 3 y 6 dejan riesgos escritos, que no paran.
- **Paquete web**: la partida coincide con el encargo tras E5 de la 015 (§4).
- **Worktree**: `.claude/worktrees/016-scheduled-jobs`, rama `feature/016-scheduled-jobs` desde `origin/develop` (`ae66814`), `core.hooksPath` en `.githooks` y `npm ci` limpio (0 vulnerabilidades).
- **Preguntas nuevas**: diez (§5). Dos tocan el dominio de la 013 (Q1) y el contrato de la API (Q4); ninguna para E1 salvo Q2 y Q3, que fijan formatos de E1.

---

## 1. Bloque 0 de E1: las verificaciones, con su fuente

Consultadas el 2026-09-27. Las páginas se descargaron con `curl` y se leyeron como texto (`aws-research-016/`). Nada se pidió a AWS.

### 1.1 Punto 1: la condición de IAM sobre el remitente y el destinatario con `SendEmail` de la API v2 (**el que para: sale bien**)

- **Acción.** *Service Authorization Reference*, «Amazon Simple Email Service v2» (`docs.aws.amazon.com/service-authorization/latest/reference/list_sesv2.html`): «(service prefix: ses) provides the following service-specific operations». Fila: «SendEmail – Grants permission to send an email message – Write». **La acción es `ses:SendEmail`**: no existe el prefijo `sesv2:` en IAM, que es solo el nombre del SDK y de la CLI.
- **Recursos y claves de condición de `SendEmail`** (misma página): `identity*` (obligatorio), `configuration-set` y `template` (opcionales, solo si se usan), con las claves `aws:ResourceTag/${TagKey}`, `ses:ApiVersion`, `ses:FeedbackAddress`, `ses:FromAddress`, `ses:FromDisplayName`, `ses:MultiRegionEndpointId`, `ses:Recipients` y `ses:TenantName`. Descripciones literales: «ses:Recipients – Filters access by the recipient addresses of a message, which include the "To", "CC", and "BCC" addresses – ArrayOfString»; «ses:FromAddress – Filters access by the "From" address of a message – String».
- **Guía de SES** (`docs.aws.amazon.com/ses/latest/dg/control-user-access.html`): «You can set the Action element to any SES API action by prefixing the API name with the lowercase string ses:»; la tabla de claves pone `ses:Recipients` en «SendEmail, SendRawEmail» y `ses:FromAddress` en «SendEmail, SendRawEmail, SendBounce». Trae además el ejemplo «Allowing Access to only SES API version 2» con `"StringEquals": {"ses:ApiVersion": "2"}`. **Su ejemplo de destinatarios usa `ForAllValues:StringLike` sin la condición `Null`.**
- **La trampa de `ForAllValues`** (`docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-single-vs-multi-valued-context-keys.html`): «It also returns true if there are no context keys in the request» y «You should always include the Null condition operator in your policy with a false value to check if the context key exists». En la API v2, `Destination` es «Required: No».
- **Conclusión:** la condición de ADR-0034, fila 12, **se aplica** a `SendEmail` de la v2. La política del rol de correo, en `contracts/iam-permissions.md` §3, lleva `StringEquals ses:FromAddress`, `ForAllValues:StringEquals ses:Recipients`, `Null ses:Recipients = false` y, como refuerzo, `StringEquals ses:ApiVersion = 2`.
- **Sin verificar**: qué ARN de identidad evalúa SES cuando se envía desde una dirección y solo está verificado su dominio. La documentación no lo dice. **Lo seguro**: el recurso de la política nombra las dos, `identity/<dominio>` y `identity/<dirección>`. Es de la 017.

### 1.2 Punto 2: si una política de identidad de SES impide, dentro de la cuenta, que otro proyecto envíe como Atlas (**no para: riesgo escrito**)

- `docs.aws.amazon.com/ses/latest/dg/policy-anatomy.html`: «Each policy has to include at least one valid principal», el principal es «A valid AWS account ID, user ARN, or AWS service», y «SES implements only the following AWS-wide policy keys: aws:CurrentTime, aws:EpochTime, aws:SecureTransport, aws:SourceIp, aws:SourceVpc, aws:SourceVpce, aws:UserAgent, aws:VpcSourceIp».
- `…/identity-authorization-policy-examples.html`: un ejemplo con `"Effect":"Deny"` contra un usuario **nombrado** de la misma cuenta.
- `…/control-user-access.html`: «only sending authorization policies can grant cross-account access».
- Evaluación de IAM (`…/reference_policies_evaluation-logic_policy-eval-basics.html`): «An explicit deny in any of the policies overrides the allow».
- **Conclusión:** una denegación explícita que **nombra** a un principal de la misma cuenta sí se aplica (deducción de las tres fuentes: ninguna lo dice en una frase). Lo que **no** se puede escribir es «todos menos el rol de Atlas»: `aws:PrincipalArn` no está entre las claves que SES admite, y ni `Principal: "*"` con excepciones ni `NotPrincipal` están documentados. **Un principal de otro proyecto con `ses:SendEmail` sobre `*` en su propia política puede enviar como el remitente de Atlas.** Es un riesgo de la cuenta compartida, como el de ADR-0034 «Riesgo que queda». Lo que Atlas controla es que **su** rol no pueda escribir a nadie más (punto 1), que es lo que pide la fila 12.

### 1.3 Punto 3: si el coste de SES se atribuye por la etiqueta de asignación de costes (**no para: sin verificar**)

- SES v2 admite etiquetas en `identity` y `configuration-set` (`list_sesv2.html`, recursos de `TagResource`).
- **No hay ninguna página** de SES ni de facturación que diga que el cargo por correo lleva las etiquetas del recurso a Cost Explorer. La guía de facturación dice «The behavior of cost allocation tags varies across AWS services… refer to the service's documentation» (`…/aboutv2/custom-tags.html`), y SES no lo documenta.
- Un dato de paso para ADR-0034 (fila 9): «Only the management account in an organization and single accounts that aren't members of an organization have access to the cost allocation tags manager in the Billing console» (`…/aboutv2/cost-alloc-tags.html`), que confirma lo que ya dice la fila sobre una organización ajena.
- **Conclusión:** SES sigue **sin verificar**, y hay que tratar su coste como posiblemente no etiquetado: el presupuesto `atlas-cost`, filtrado por `project=atlas`, puede no verlo. A unos 0,001 $/mes, no cambia nada.

### 1.4 Punto 4: cómo invoca EventBridge Scheduler a Lambda, y cómo reintenta Lambda

- **Invocación asíncrona** (`docs.aws.amazon.com/lambda/latest/dg/with-eventbridge-scheduler.html`): «EventBridge Scheduler invokes your Lambda function asynchronously» y «If you don't enter a payload, EventBridge Scheduler uses an empty event to invoke the function». El evento es el `Input` de la programación: «The text, or well-formed JSON, passed to the target… The maximum size of the Input field is 256 KB» (`scheduler/latest/APIReference/API_Target.html`).
- **Política de reintentos de Scheduler** (`API_RetryPolicy.html`): `MaximumEventAgeInSeconds` de 60 a 86.400 y `MaximumRetryAttempts` de 0 a 185, los dos opcionales. **Los valores por defecto no están en la documentación**: solo en el blog de AWS Compute («By default, EventBridge Scheduler tries to send the event for 24 hours and a maximum of 185 times»). **Se fijan siempre explícitos** (plan §6).
- **Cola de fallidos** (`scheduler/latest/UserGuide/configuring-schedule-dlq.html`): una cola SQS estándar, nunca FIFO, en `Target.DeadLetterConfig.Arn`. **Deducción**, no dicha en la documentación: como la invocación es asíncrona, Scheduler da por hecho el envío cuando Lambda encola el evento; un fallo **de la función** lo gestiona Lambda, no Scheduler.
- **Zona horaria** (`schedule-types.html`): `ScheduleExpressionTimezone` admite zonas como `Europe/Madrid`. «When time shifts forward in the Spring, if a cron expression falls on a non-existent date and time, your schedule invocation is skipped. When time shifts backwards in the Fall, your schedule runs only once». **Ninguna programación de esta feature cae entre las 02:00 y las 03:00** (plan §6).
- **Ventana flexible** (`API_FlexibleTimeWindow.html`): `Mode` obligatorio, `OFF` o `FLEXIBLE`; `MaximumWindowInMinutes` de 1 a 1.440. Propuesta: `OFF`.
- **Atributos de contexto** (`managing-schedule-context-attributes.html`): `<aws.scheduler.scheduled-time>`, `<aws.scheduler.execution-id>` («for each attempted invocation»), `<aws.scheduler.attempt-number>` y `<aws.scheduler.schedule-arn>` se pueden poner en el `Input`. Si `execution-id` se conserva entre reintentos es ambiguo. **El plan no los usa** (Q6).
- **Reintentos de Lambda** (`lambda/latest/dg/invocation-async-error-handling.html`): «If the function returns an error, by default Lambda attempts to run it two more times, with a one-minute wait between the first two attempts, and two minutes between the second and third attempts»; «For throttling errors (429) and system errors (500-series), Lambda returns the event to the queue and attempts to run the function again for up to 6 hours by default»; «it's possible for it to receive the same event from Lambda multiple times». Configurables con `PutFunctionEventInvokeConfig`: `MaximumRetryAttempts` de 0 a 2 y `MaximumEventAgeInSeconds` de 60 a 21.600.
- **Conclusión para la idempotencia:** una tarea puede ejecutarse **más de una vez** por varias vías (reintento de Lambda por error, reencolado por limitación, reintento de Scheduler si la llamada a Lambda falla, entrega duplicada). El diseño supone **más de una** y se defiende con el registro de ejecución (plan §5). Propuesta para la 017, con P10: Scheduler con `MaximumRetryAttempts = 2` y `MaximumEventAgeInSeconds = 3600`; Lambda asíncrona con `MaximumRetryAttempts = 0` y `MaximumEventAgeInSeconds = 3600`; concurrencia reservada 1 (P11). **El manejador nunca devuelve error por un fallo previsto**: lo cierra en su registro con código (plan §5.3), así que el reintento de Lambda por error solo cubre lo imprevisto.

### 1.5 Punto 5: los límites de SES

- `docs.aws.amazon.com/ses/latest/dg/quotas.html`: «Using the SES v2 API or SMTP - Maximum message size (including attachments) 40 MB per message (after base64 encoding)»; «Maximum number of recipients per message 50 recipients per message»; en el *sandbox*, «up to 200 emails per 24-hour period» y «1 email per second».
- `API_Message` (v2): «You can specify an HTML version of the message, a text-only version of the message, or both»; el asunto «can only contain 7-bit ASCII characters. However, you can specify non-ASCII characters in the subject line by using encoded-word syntax, as described in RFC 2047». `API_Content`: «Amazon SES uses 7-bit ASCII by default. If the text includes characters outside of the ASCII range, you have to specify a character set».
- **Conclusión:** un mensaje `Simple` con solo `Body.Text` se admite; se envía con `Charset: "UTF-8"` en el cuerpo **y en el asunto**. Un destinatario, muy por debajo de 50; unos KB, muy por debajo de 40 MB.
- **Sin verificar**: que un mensaje solo de texto salga como `text/plain` de una sola parte («Amazon SES automatically assembles a properly formatted multi-part MIME email message», `send-email-concepts-email-format.html`), y que `Subject.Charset` baste para que SES codifique el asunto según RFC 2047. **El plan lo cubre sin depender de ello** (Q5): el asunto se redacta en ASCII.

### 1.6 Punto 6: si las programaciones de Scheduler se etiquetan una a una (**se deja a la 017, con fuente**)

- `scheduler/latest/APIReference/API_TagResource.html`: «You can only assign tags to schedule groups». `API_CreateSchedule` no tiene `Tags` en el primer nivel.
- **Conclusión:** **solo se etiqueta el grupo**. La 017 crea un grupo `atlas-<entorno>-jobs` con las etiquetas de ADR-0034, fila 3. Si el uso de Scheduler se atribuye a las etiquetas del grupo en facturación **no está documentado**: sin verificar, y vale ≈ 0 $.

### 1.7 Otros hechos que el plan usa, de la misma consulta

- **Límites de Lambda** (`gettingstarted-limits.html`): tiempo máximo 900 s; memoria de 128 a 10.240 MB; paquete ZIP 50 MB subido, 250 MB descomprimido. «New AWS accounts have reduced concurrency and memory quotas for Lambda». **Concurrencia reservada** (`configuration-concurrency.html`): «You can reserve up to the Unreserved account concurrency value minus 100»; en una cuenta con la cuota reducida no se puede reservar (ADR-0034, fila 13, comprobación C12).
- **S3** (`AmazonS3/latest/userguide/conditional-writes.html`, `API_HeadObject.html`, `API_ListObjectsV2.html`): lo mismo que verificó la 015 (§23.1: `If-Match` pide `s3:PutObject` y `s3:GetObject`; `404` con `If-Match` sin objeto; sin `s3:ListBucket`, una clave que falta da `403`). **Nuevo para E4:** una política de bucket puede **exigir** la escritura condicional con las claves `s3:if-none-match` y `s3:if-match` (`conditional-writes-enforce.html`: «You can use the condition keys s3:if-match or s3:if-none-match as the optional Condition element»). Propuesta para la 017 en `contracts/iam-permissions.md` §7.
- **SSM** (`API_GetParametersByPath.html`, `list_ssm.html`): `MaxResults` como mucho 10, y una página puede venir vacía con `NextToken` (el adaptador de la 015 ya pagina); la acción se concede sobre el ARN de la ruta; «If a user has access to a path, then the user can access all levels of that path», y existe la clave `ssm:Recursive`. **KMS con `aws/ssm`**: «you cannot establish access control policies for the default aws/ssm KMS key» (`secure-string-parameter-kms-encryption.html`), y las claves administradas por AWS permiten a la cuenta a través del servicio (`kms:ViaService`). **Deducción**: con `aws/ssm` no hace falta `kms:Decrypt` en la política del rol. La misma página dice también «the user needs kms:Decrypt permission», así que sigue **sin verificar** y es de la 017 (ADR-0028, nota de ADR-0033).

### 1.8 Lo que la dirección tiene que escribir en cada ADR, del bloque 0 de E1

- **ADR-0034, fila 12** (con nota fechada del riesgo residual, decidido el 2026-09-27, §9): la condición **verificada** para `SendEmail` de la v2 (acción `ses:SendEmail`, claves de condición, `Null`, `ses:ApiVersion`), con las fuentes de §1.1; lo sin verificar del ARN de identidad con un dominio verificado; y el riesgo del punto 2: la política de identidad no aísla a Atlas de otro proyecto con `ses:SendEmail` sobre `*`.
- **ADR-0034, fila 9**: Scheduler **solo se etiqueta por grupo** (verificado); si su uso y el de SES se atribuyen por etiqueta, **sin verificar**.
- **ADR-0031** (el cupo compartido): los presupuestos de la nube como variables de la función de precios (§8.2 M5) y, si se acepta Q1, la opción de `updatePrices` que no contrasta ni escribe `symbols.json`.
- **ADR-0032** (el volcado): el contenido de `backups/<YYYY-MM>/`, `positions.json` y la conducta del reintento (plan §8), al cerrar E4.
- **ADR-0028, nota de ADR-0033**: los permisos de KMS para `aws/ssm` siguen sin verificar, ahora con la frase contradictoria de la documentación (§1.7).

## 2. Bloque 0 de E2 a E4: qué se verifica y cuándo

Cada uno, **antes del primer commit de código de su entrega**, escrito aquí con fuente, fecha y salida.

| Entrega | Punto | Qué | Si sale mal |
|---|---|---|---|
| E2 | 1 | El cupo compartido de ADR-0031: EODHD se reinicia a medianoche GMT y Alpha Vantage no documenta la hora; los presupuestos de la nube (18 y 23) como variables de la función. Se relee la documentación de las dos fuentes por si cambió desde la 013 | No para; se escribe |
| E2 | 2 | Qué nombres escribe la tarea en `prices/` y cuáles sirve `GET /api/reference/prices/<name>` con el código de hoy y con la regla decidida (ida y vuelta con `priceFileName`, 255 como máximo): `%`, `! ' ( ) * ~`, `_` y `-` al principio, `%2Ex.jsonl`, más de 128 y más de 255 caracteres. Y qué admite hoy el cargador como `asset_id` | **Para E2** si un nombre que un dispositivo necesita no pasa |
| E2 | 3 | Tiempo y memoria de la Lambda frente a la descarga del BCE (unos 600 KB de ZIP) y a veinte llamadas a EODHD más el segundo de espera de Alpha Vantage; lo mismo para el libro entero cargado en memoria | No para; fija `timeout` y memoria para la 017 |
| E2 | 4 | **Nuevo**: qué escribe `updatePrices` en `symbols.json` (contraste y días de nuevo) y si la opción de Q1 basta para que la tarea no lo escriba nunca, con el código de `cascade.ts` delante | **Para E2** hasta que la dirección conteste Q1 |
| E3 | 1 | **Nuevo**: el `ETag` de `GET /api/reference/*` a través de CloudFront (la 015, §23.3: débil al comprimir `text/csv` y `application/json`) frente al `If-None-Match` de la web y de la consola | No para |
| E3 | 2 | **Nuevo**: `crypto.subtle.digest("SHA-256")` en los navegadores objetivo, en un contexto seguro, para el SHA-256 del manifiesto | No para: sin él, no se usa la copia de la nube y se dice |
| E4 | 1 | Que el rol de una tarea puede escribir `backups/<YYYY-MM>/` solo con `If-None-Match: *`, qué permisos exige, y la política de bucket que lo impone (`s3:if-none-match`, §1.7) | No para; va a la lista de la 017 |
| E4 | 2 | Cómo lee la tarea el tamaño del libro sin descargarlo si no hace falta. **Adelantado**: la tarea de integridad lo descarga igualmente para recalcular, así que el tamaño es el de los bytes leídos (plan §9) | — |

## 3. Lo que el encargo afirma del código, comprobado sobre esta rama

`git log origin/develop..origin/feature/015-api-access` sale vacío, y la rama sale de `ae66814`. **Cierto**:

- los nueve puertos de `packages/domain/src/ports/`, y que no existe `Notifier` ni ningún adaptador de SES;
- `updateEcbHistory` (`ecb/update-history.ts:45`), `updatePrices` (`quotes/cascade.ts:186`), el almacén de carpeta del BCE y el de precios;
- lo que hay en `packages/adapters/src/aws/`, detrás de `@atlas/adapters/aws`, `aws-sdk` y `aws-admin`;
- `REFERENCE_NAME` (`access/sync-routes.ts:60`) y `priceFileName` (`quotes/line.ts:33`, con `encodeURIComponent` y el punto inicial como `%2E`);
- `notification_email` en Ajustes (`view-models/settings.ts:177`, `format/labels.ts:269`) y sus tests;
- `Settings` (`settings.ts:144-145`), la lista congelada (`architecture.test.ts:596-597`) y el generador (`synth/scenario.ts:397-398`);
- `ARITY` (`main.ts:117`), con `fx`, `prices` y `admin`;
- el techo del arranque (**74.134**) y el total (**294 × 1024 + 440 = 301.496**), los de la rama de la 015 tras E5.

**Matices que el plan tiene en cuenta**:

- **`Thesis` está en `projections/state.ts:246`**, no en `:252`; `horizon_exceeded`, en `bucket.ts:156`, como dice el encargo.
- **`confirm` está en `shared.ts:96`** y devuelve `true` con `ctx.yes`; la confirmación que exige teclear el entorno es `confirmEnvironment` (`commands/admin.ts:101`), y `--yes` se rechaza como `UsageError` (`:515`).
- **`manifest()` no está en el puerto `EcbHistoryStore`**: solo en el adaptador de carpeta. El almacén de S3 lo necesita para recuperar una activación a medias (plan §7.1).
- **`updatePrices` escribe `symbols.json` en dos sitios**: al contrastar una fuente sin `currency_check` (`cascade.ts:258`) y al limpiar los días de nuevo de una purga (`clearRefetched`, `:170`). Con el caso de uso tal cual, la tarea de la nube **escribiría** `symbols.json` y **contrastaría**, contra §8.1 P18 y §8.2 M4. Es la pregunta **Q1**.
- **`updatePrices` lee `config.json` del almacén** (`:188`). El almacén de S3 no lo lee del bucket: lo construye con la configuración de la función (§8.2 M5; plan §7.2).
- **El informe de `updatePrices` no trae los recuentos de fallos seguidos**: solo `failing` (las fuentes en el umbral o por encima). Los recuentos viven en `_status.json`, que la tarea lee al terminar (plan §7.3).
- **Los avisos del dominio llevan importes en su `message`** (`weights.ts:175`, `bucket-stats.ts:387-476`). **La redacción del correo usa solo el `code` y los `details` que el plan enumera, nunca `message`**, y un mutante lo comprueba (regla R3 del plan).
- **No existe ningún test que prohíba `new Date()` ni `Date.now()`**. El dominio no los usa; los adaptadores y las aplicaciones, sí (nombres de temporales, `systemClock`, `compose.ts:40`). El guardián nuevo cubre **los ficheros nuevos** de esta feature (plan §4, G6).
- **`tests/api-access.test.ts` fija** que las dependencias de `packages/adapters` son **exactamente** los dos clientes del SDK (`:305`), que `@aws-sdk` solo lo importa `adapters/src/aws/sdk-*` (`:465`) y la lista cerrada de órdenes del SDK (`:760`). Instalar `@aws-sdk/client-sesv2` **cambia esos guardianes a propósito**, en el mismo commit que la instalación y con su motivo (plan §4, G4). Además, `productSources()` (`:31`) no incluye `apps/jobs`: se amplía en el bloque 1 de E1.
- **`apps/api/scripts/build-lambda.mjs` tiene la entrada fijada a `apps/api`**. Propuesta P-H del plan: sacar la parte común a un módulo que usen las dos aplicaciones.
- **`referenceReader` se niega a leer `reference/ecb/previous/` y `rejected/`** (`reference-reader.ts:13-16`). Ninguna tarea lo necesita: el volcado copia solo el fichero en vigor y su manifiesto (ADR-0032, §1 del esquema).
- **Cuenta de tests de los guardianes en `develop`** (`grep -cE '^\s*it\('`): `tests/architecture.test.ts` **49**, `tests/api-access.test.ts` **28**; y el resto de `tests/`: `messages` 10, `lambda-package` 4, `fiscal-criteria` 4, `test-outputs` 3, `runbook-revoke-all` 2. Es la línea contra la que se cuenta antes de cada PR.

## 4. El paquete web: la partida, medida

`npm run build` sobre `ae66814` (`016-build-baseline.log`), con la misma regla que `check-bundle.mjs`, en bytes exactos (una copia temporal del guion con una línea que imprime `gzipBoot` y `gzipTotal`, borrada después; `git status` limpio):

```
EXACT boot 74125 total 301439
```

**Arranque 74.125 (techo 74.134, 9 de margen); total 301.439 (techo 301.496, 57 de margen).** Coincide con el cierre de la 015 (su §36.2).

**La autorización de esta feature** (§8.1 P13): el arranque, **+0** (techo 74.134); el total, lo medido y **hasta 3.072 bytes** por encima del techo de partida, es decir, **como mucho 304.568**. Estimación trozo a trozo en plan §12: **entre 2,2 y 3,4 KB**, así que los precios del móvil **pueden no caber** (Q8).

## 5. Preguntas nuevas a la dirección

Cada una con mi recomendación. Ninguna es fiscal.

- **Q1 — `updatePrices` escribe `symbols.json` y contrasta (§3).** El caso de uso de la 013 contrasta una fuente sin `currency_check` antes de su primera descarga y limpia `refetch_days` al terminar, y las dos cosas escriben `symbols.json`. §8.1 P18 y §8.2 M4 dicen que la tarea **nunca** escribe `symbols.json` y **nunca** contrasta. Opciones:
  - **(a)** una opción nueva de `UpdatePricesInput`, por ejemplo `symbols: "read_only"`, que en la nube **no contrasta** (una fuente sin `currency_check` se salta con el resultado `currency_unchecked`, que la tarea deja como hallazgo) y **no persigue `refetch_days`** (son de una purga local; la nube nunca guardó cierres mal, porque solo escribe desde la 016 con el formato 2). La consola sigue igual. El almacén de S3 **se niega** a `writeSymbols` y a `rewriteCloses`, como segunda cerradura;
  - (b) que el almacén de S3 descarte en silencio esas escrituras: la cascada creería que contrastó, y descargaría con una divisa sin contrastar;
  - (c) reescribir la cascada para la nube, que el encargo prohíbe.

  **Recomendación: (a)**. Reutiliza el caso de uso, con una rama nueva que el dominio cubre al 100 %, y la cerradura doble hace que un mutante que quite cualquiera de las dos muera por la otra con su propio test. El resultado nuevo `currency_unchecked` es del informe, no de `_status.json`, que no cambia de formato. **Para el bloque 2 de E2 hasta la respuesta.**

- **Q2 — Las claves y los valores de `job_frequencies`** (§7.2 (c) y §8.1 P5). Propongo el conjunto cerrado de plan §5.2: `ecb` (`daily`, `weekly`), `prices` (`daily`, `weekly`), `reminder` (`monthly`, fijo), `backup` (`monthly`, fijo), `integrity` (`quarterly`, `monthly`), `review` (`weekly`, `monthly`), `tax_return` (`yearly`, fijo) e `informative_thresholds` (`yearly`, fijo); **sin `off` en ninguna**, porque apagar un aviso es la forma de silenciar una alarma que la constitución (IV) pide advertir y que esta feature no tiene cómo advertir. **`reconciliation`**, que está en el *golden* con `quarterly`, **se reserva** para la Ronda 6: no se usa y se dice como `job_not_available`, distinto de una clave desconocida (`job_frequency_unknown_key`). **Recomendación: así.** Si la dirección prefiere un `off` para `review`, es una línea y un código más.

- **Q3 — Dónde vive y cómo se llama el objeto del último inicio de sesión web** (§8.1 P6). Propongo `access/last-web-sign-in.json` con `{ "web_sign_in_format": 1, "last_web_sign_in": "YYYY-MM-DD" }` (fecha de `Europe/Madrid`), escrito por la API tras emitir la cookie de una sesión web, **sin hacer fallar el inicio de sesión** si la escritura falla (se registra con código). Un prefijo propio, `access/`, para que el permiso de la API sea exactamente ese objeto y el del correo, solo leerlo. **Recomendación: así**, con la fecha y no el instante: el correo cuenta días, y un instante diría a qué hora se conecta el usuario, que no hace falta.

- **Q4 — `REFERENCE_NAME` para los nombres que no son de precios.** §8.2 M1 fija la ida y vuelta con `priceFileName` para `prices/`. Para `reference/ecb/` los nombres son fijos (`manifest.json`, `eurofxref-hist.csv`, `api-exr.csv`). Propongo **dos reglas**: en `prices/`, un nombre vale si termina en `.jsonl`, tiene como mucho 255 caracteres y `priceFileName(decodeURIComponent(base)) === nombre` (con `decodeURIComponent` dentro de un `try`: una secuencia `%` rota se niega), más `symbols.json` por su nombre; en `reference/ecb/`, la regla de hoy. `_status.json` y `config.json` no se sirven. **Recomendación: así**, con el cambio de `docs/api.md` §6 que escribe la dirección al cerrar E2.

- **Q5 — El asunto del correo en ASCII.** SES exige RFC 2047 para un asunto con tildes, y no está verificado que `Subject.Charset` lo haga solo (§1.5). Propongo **asuntos en ASCII** (`[Atlas] Recordatorio mensual 2026-10`, `[Atlas] Aviso: fuente de precios`), con el identificador del periodo en el asunto (§8.1 P10), y el cuerpo en UTF-8. Un test fija que todo asunto es ASCII imprimible. **Recomendación: así**; evita codificar a mano y un asunto ilegible en el buzón.

- **Q6 — El periodo sale del reloj, no del evento.** Scheduler puede poner `<aws.scheduler.scheduled-time>` en el evento (§1.4). Propongo **no usarlo**: el periodo sale del `Clock` inyectado, las programaciones quedan lejos de la medianoche de Madrid y la edad máxima del evento es de una hora, así que un reintento no cruza de día; y un registro reclamado y sin cerrar de un periodo anterior se termina antes de empezar el nuevo (plan §5.3). El evento queda en `{ "event_format": 1, "tasks": [...] }`. **Recomendación: así**; si la dirección lo prefiere, `scheduled_at` es un campo obligatorio más.

- **Q7 — La tarea de integridad: qué es «recalcular todo desde cero y comparar»** (§9.5, ADR-0032). Propongo: `deepCheck` del libro vivo (la misma de `atlas check --deep`), cuyos **errores** son hallazgo; más el ensayo de restauración, que compara la proyección del último volcado con la del libro vivo **restringido a los eventos del volcado por identificador** (plan §9.2). No hay un tercer término que comparar (ningún agregado se guarda, principio I), así que «comparar» es eso. **Recomendación: así**. Si la dirección quiere además comparar `positions.json` del volcado con la proyección del mismo libro, es barato y lo añado.

- **Q8 — Los precios en el móvil pueden no caber** en los 3 KB de §8.1 P13 (§4 y plan §12: entre 2,2 y 3,4 KB con los precios). Propongo **construir primero el BCE** (obligatorio), medirlo con un prototipo, y **solo si cabe** añadir los precios en la misma entrega. Si no caben, paro y lo digo, como manda P7. **Recomendación: así**, sin pedir más margen.

- **Q9 — Una programación por función, y cuántas funciones.** §8.1 P4 dice cinco funciones. Propongo que **el correo reúna cinco tareas** (`dispatch_findings`, `monthly_reminder`, `weekly_review`, `tax_return_ready` e `informative_thresholds`) porque las cuatro últimas solo leen y envían, y **ninguna** alcanza una clave; y que la función se niegue a arrancar si `ATLAS_JOBS` mezcla tareas de dos familias (`jobs_config_invalid`, `mixed_families`). **Recomendación: así.**

- **Q10 — La Renta de enero, ni con el interruptor.** El encargo (§3, E4, bloque 3) dice «sin la base ni ninguna cifra salvo el interruptor». Propongo que el correo de la Renta **no lleve ninguna cifra fiscal ni con el interruptor encendido** (`contracts/mail.md` §2): una base o una cuota en un buzón de correo son lo más sensible que Atlas calcula, y el correo solo tiene que decir que los datos están listos. **Recomendación: así**; si la dirección prefiere la letra del encargo, son dos líneas y su test.

## 6. Documentos (para que los traslade la dirección)

Se completa en cada entrega. Hoy:

- **`CLAUDE.md`**: ya tiene `apps/jobs` y `@atlas/jobs` (la PR del encargo). Sin cambios.
- **`docs/dependencies.md`**: ya dice `@aws-sdk/client-sesv2@3.1141.0`. Sin cambios hasta E1.
- **ADR-0034, filas 9 y 12; ADR-0031; ADR-0028 (nota de ADR-0033)**: §1.8.
- **`docs/specification.md` §5** (`alert_channels`): la redacción propuesta llega con E3 (§8.1 P17).
- **`docs/specification.md` §9.5**: la tabla, con las claves de `job_frequencies` (Q2) y la hora de cada programación (plan §6), al cerrar E1.
- **`docs/business-rules.md` §7**: `job_frequencies{}` con sus claves y valores (Q2), al cerrar E1; `notification_email`, la nota de P12, al cerrar E3.
- **`docs/data-schema.md` §1**: `jobs/` y el registro de ejecución, `access/last-web-sign-in.json` (Q3), al cerrar E1; quién escribe `prices/` y `reference/ecb/` en la nube, al cerrar E2; `positions.json` y el contenido de `backups/`, al cerrar E4.
- **`docs/api.md`**: §6 (Q4), al cerrar E2; el objeto que escribe la API al iniciar sesión (Q3) y los parámetros de SSM y las variables de las tareas en §9 (plan §6 y `contracts/ssm-parameters.md`), al cerrar E1.
- **`docs/decision-roadmap.md`**: la 017 con la lista de permisos de `contracts/iam-permissions.md`, en cada entrega.

## 7. Gemelos `.js`

Antes de escribir nada, sobre `ae66814` (todo `.js` fuera de `dist`, `vendor`, `dev-dist` y `dist-lambda` con un `.ts` o `.tsx` hermano): **ninguno**.

## 8. Predicción fiscal (antes de correr ninguna suite)

**No se mueve nada.** `atlas tax` (con `--lots`, `--boxes` y `--json`), `gains`, `income`, `m720`, `m721` y `filed` darán los mismos bytes con y sin `prices/` de la nube en cada entrega, y `git diff origin/develop -- tests/fixtures` saldrá vacío. Motivo: ninguna tarea escribe en el libro; la puerta del 720 sigue cerrada por estructura (ADR-0031, segunda enmienda); el aviso del 720 y el 721 usa la misma función del modelo, que no alcanza la puerta de precios; y retirar `notification_email` de la web y de las fotos nuevas no toca el generador ni el *golden*, porque `mergeSettings` no está en el camino del generador (plan §10.3).

## 9. Respuestas de la dirección al alto del plan (2026-09-27)

La dirección da el visto bueno a `spec.md` y `plan.md`. Decisiones:

- **Propuestas del alto (a)-(i), P-H y la tabla de permisos: aceptadas tal cual.** Además, aceptadas y llevadas a `contracts/iam-permissions.md`:
  - la política del bucket que exige `s3:if-none-match` en `backups/*` (§4, ya no «propuesta»);
  - los dos ARN de identidad de SES en el recurso de `ses:SendEmail` (el del remitente y el de su dominio);
  - los reintentos: Scheduler con 2 reintentos y 3.600 s; Lambda asíncrona con 0 reintentos y 3.600 s; concurrencia reservada 1.
- **Riesgo del punto 2 del bloque 0** (otro proyecto con `ses:SendEmail` sobre `*` puede enviar como Atlas): **aceptado como riesgo residual**; la dirección lo anota en ADR-0034 con una nota fechada. `kms:Decrypt` con `aws/ssm` y la atribución del coste de SES por etiqueta pasan a la lista de comprobaciones de la **018**; las etiquetas de Scheduler (solo por grupo), a la **017**.
- **Q1 a Q9: como se recomendaban.** En Q1, `symbols: "read_only"` en `updatePrices`, con `currency_unchecked` convertido en hallazgo, y el almacén de S3 que se niega a `writeSymbols` y `rewriteCloses` como segunda cerradura.
- **Q10: aceptada la versión más estricta que el encargo.** El correo de la Renta **nunca** lleva cifras, esté como esté el interruptor. **Desviación anotada** respecto de `docs/prompts/016-scheduled-jobs.md` §3, E4, bloque 3 («sin la base ni ninguna cifra salvo el interruptor»): la regla aplicada es «sin la base ni ninguna cifra, nunca». `contracts/mail.md` §2 lo dice así.
- **Discrepancias de §3**: se corrigen donde toca (los números de línea del encargo son del encargo, en `docs/`, que no toco; quedan anotadas en §3 y en «Documentos») y se sigue.

### 9.1 Errores del encargo, para su §8.3

- `Thesis` está en `packages/domain/src/projections/state.ts:246`, no en `:252`.
- `confirm` está en `apps/cli/src/commands/shared.ts:96`; la línea 97-99 es su cuerpo.
- El techo total tras E5 de la 015 es `294 * 1024 + 440` = 301.496 bytes, que el encargo escribe «294 KB + 440»: coincide; no es un error, solo otra forma.

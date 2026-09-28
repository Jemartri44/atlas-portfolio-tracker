# Preguntas y verificaciones de la feature 016

Fechas en `Europe/Madrid`. Todo lo ejecutado está en el *scratchpad* de la sesión, en ficheros con el sufijo o el prefijo `016` (`016-build-baseline.log`, `016-gate.sh`, `016-pipeline.sh`, y las páginas descargadas del bloque 0 en `aws-research-016/`), nunca en el repositorio. Las citas son literales.

---

## 0. Estado: E1 terminada, a la espera de revisión (2026-09-27)

E1 construida, tubería verde sobre `1d80be4`, congelada (§10.9). Lo que sigue es el estado del alto del plan, que se conserva.

### 0.1 Estado del alto del plan (2026-09-27)

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
- **Del cierre de E1** (2026-09-27):
  - `docs/api.md`: el objeto `access/last-web-sign-in.json` que escribe la API tras un inicio de sesión web, y los cuatro valores de la razón de esa línea de registro (`sign_in_date_written`, `_unchanged`, `_conflict`, `_unavailable`); §9, los parámetros `mail/recipient` y `mail/amounts` y las variables de las tareas (`contracts/ssm-and-config.md`).
  - `docs/data-schema.md` §1: `jobs/<familia>/<tarea>/<periodo>.json`, `jobs/mail/notices/<código>--<asunto>.json` y `access/last-web-sign-in.json` (`data-model.md` §1-§3).
  - `docs/specification.md` §9.5 y `docs/business-rules.md` §7 (`job_frequencies{}`): las claves y los valores de Q2, sin `off`, y `reconciliation` reservada.
  - `docs/dependencies.md`: `@aws-sdk/client-sesv2@3.1141.0` ya instalado (E1, `17f3259`).
  - `CLAUDE.md` («Code architecture»): la puerta `@atlas/domain/jobs` y las de los adaptadores `aws-jobs` y `aws-ses`, si la dirección quiere nombrarlas.
  - Los códigos de las tareas en `tests/messages.test.ts` (`JOBS_ONLY`): la lista de lo que solo dicen el registro y el correo.
- **Del cierre de E2** (2026-09-27):
  - `docs/api.md` §6: `REFERENCE_NAME` de `prices/` por ida y vuelta con `priceFileName` (≤ 255, id no vacío), `symbols.json` por su nombre, `_status.json` y `config.json` no se sirven (400 `reference_name_invalid`); el índice solo lista lo que se serviría (Q4, M1).
  - `docs/api.md` §9 o `docs/data-schema.md`: las variables de la función de precios (`contracts/ssm-and-config.md`) y los parámetros `/atlas/<entorno>/prices/eodhd-key` y `…/alpha-vantage-key`.
  - `docs/data-schema.md` §1: en la nube, `reference/ecb/` (con `manifest.json`, `previous/`, `rejected/`) y `prices/` (cierres y `_status.json`) los escriben solo las tareas diarias; `prices/symbols.json`, solo `atlas admin prices push`; en la nube no hay `prices/config.json` (`data-model.md` §5).
  - ADR-0031 (segunda o tercera enmienda): `symbols: "read_only"` y el resultado `currency_unchecked` (Q1); la nube nunca contrasta.
  - `docs/specification.md` §9.5: los hallazgos de E2 y su texto (`contracts/mail.md` §2).
  - `CLAUDE.md` («Code architecture»): la puerta `@atlas/adapters/aws-daily`, si la dirección quiere nombrarla.
  - La orden nueva de la consola, `atlas admin prices push --env <entorno>`, donde se listen las órdenes de `atlas admin` (el procedimiento 3 de E4 la explica).
  - **De la ronda 1 de la revisión de la PR #106**: `docs/api.md` §6, `GET /api/reference/prices/symbols.json` responde `404 not_found` con `reason: "unknown_key"` si el objeto tiene una clave de primer nivel que no es `symbols_format` ni `assets`; ADR-0029 (o `docs/data-schema.md`), la reconstrucción de un histórico dañado desde el ZIP oficial (`ecb_history_rebuilt`, sin `previous`); `docs/data-schema.md`, `prices/symbols.json` sin claves de primer nivel ajenas (`symbols_file_unknown_key`); la variable `ATLAS_DATA_BUCKET` debe empezar por `atlas-<ATLAS_ENV>-`.
- **Del cierre de E3** (2026-09-28):
  - **`docs/specification.md` §5, `alert_channels`** (§8.1 P17). La redacción que propongo sustituye el párrafo «Previsión, todavía fuera de la lista normativa»:
    > **`alert_channels{}` no existe y no entra en §7.** Qué avisa por correo y qué se queda solo en la interfaz lo decide hoy el código de las tareas (feature 016): cada aviso tiene su canal fijo. Si algún día se configura, **vive fuera del libro, junto al destinatario del correo**, en SSM (ADR-0028, ADR-0034): es configuración operativa que ninguna cifra del libro lee (constitución, principio IV, enmienda 1.6.0), y en `Settings`, que es una foto completa, un cliente antiguo la borraría al escribir la foto siguiente. **Nunca en `docs/business-rules.md` §7.**
  - `docs/business-rules.md` §7 (fila de `notification_email`) y `docs/specification.md` (el párrafo de la lista permitida y el destinatario) dicen «La web todavía lo ofrece en Ajustes; se retira con la feature 016». Pasa a: **retirado de Ajustes y de toda foto nueva de `settings_changed`**, escrita desde la web o desde la consola (`mergeSettings`), y el cargador lo sigue aceptando en las líneas antiguas (§8.1 P12). La nota de P12 que escribe la dirección.
  - `docs/data-schema.md` §1: el fichero nuevo `prices/_cloud.json` (`{ cloud_format: 1, origin, pulled_at, versions }`), que escribe solo la consola bajo el cerrojo y nunca se sirve ni se sube; las líneas que baja de la nube conservan `source` y `fetched_at`. En la fila de `reference/ecb/`, la web lo baja de la nube con sesión (tercera procedencia, `origin: "cloud"` en la copia del navegador).
  - ADR-0031 (enmienda): en una carpeta sincronizada, `atlas prices update` baja de la API y no llama a ninguna fuente; `--from-sources` las llama y gasta el cupo compartido, con 2 y 2 por defecto (`SHARED_WITH_CLOUD_DAILY_CALLS`) salvo lo que diga `config.json`.
  - `docs/api.md` §6: los clientes de la consola y de la web (`@atlas/adapters/reference-http`), con `If-None-Match` sobre la versión que tienen.
  - `docs/runbooks/`: el procedimiento `specs/016-scheduled-jobs/runbooks/ecb-history-in-the-cloud.md`; y, para la 017, `s3:DeleteObject` sobre `reference/ecb/manifest.json` en el rol de administración, que ese procedimiento pide.
  - El mensaje de uso de `atlas` y el apartado de la consola que liste `atlas prices update`: la opción `--from-sources`.

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

## 10. E1: el esqueleto, el correo y el recordatorio mensual (2026-09-27)

### 10.1 Qué hay en la rama

| Commit | Qué |
|---|---|
| `17f3259` | `@aws-sdk/client-sesv2@3.1141.0` en `packages/adapters`, con el guardián de dependencias y el de las órdenes del SDK cambiados en el mismo commit (G4) |
| `994b529` | Las reglas de las tareas en el dominio, detrás de la puerta `@atlas/domain/jobs`: catálogo, periodos de Madrid, evento, configuración, registro de ejecución, rachas, interruptor, dirección de correo, hechos y texto del recordatorio, aviso de tarea fallida; `settings/job-frequencies.ts` (fuera de `jobs/`, para que Ajustes lo lea en E3); `access/web-sign-in.ts`; el puerto `Notifier` |
| `4ad8af2` | Los adaptadores: `aws/mail.ts` (`sesNotifier` sobre la interfaz estrecha `MailSender`), `aws/sdk-ses.ts` (el único con el SDK de SES), `aws/jobs-store.ts` (registros y rachas, escritura condicional solo bajo `jobs/<familia>/`), `aws/web-sign-in.ts`; puertas `@atlas/adapters/aws-jobs` y `@atlas/adapters/aws-ses`; el doble `test-only-fake-ses.ts` |
| `5afe1a6` | La API escribe `access/last-web-sign-in.json` al terminar un inicio de sesión web; la razón de su línea de registro dice qué pasó (`sign_in_date_written`, `_unchanged`, `_conflict`, `_unavailable`), y el inicio de sesión nunca falla por ello |
| `00f97dd` | P-H: `scripts/lambda-package.mjs`, el constructor común de los dos ZIP, con `absWorkingDir` en la raíz |
| `febbca7` | `activeHistoryOf`: el fichero en vigor del manifiesto del BCE, leído estricto |
| `3e0575f` | `apps/jobs` (`@atlas/jobs`): composición, manejador, motor de periodos, registro, `monthly_reminder` y `dispatch_findings`, `jobs.zip`; los guardianes G1, G2, G3, G5, G6, G7 y G8; `FORBIDDEN_IN_WEB` con `apps/jobs/` y las reglas de las tareas; el `Notifier` de fichero |
| `1d80be4` | El periodo del recordatorio con la hora de Madrid, de principio a fin (mutante 6) |
| `bd1a526` | Solo un comentario: qué protege un registro `failed` y qué no (§10.7, familia 4). No cambia código; la tubería corrió sobre `1d80be4` |

### 10.2 Desviaciones del plan, dichas

- **El manejador no puede ver una clave repetida ni un suplente suelto del evento**: el *runtime* de Lambda parsea la carga antes de entregarla. `parseJobEvent` recibe el objeto; los nombres de las tareas se comparan con el catálogo, que ninguno de los dos podría pasar. R12 queda con los demás motivos. *(Corregido en la ronda 1 de la revisión, B2: esta frase decía que el contrato ya lo aclaraba, y no lo hacía; ahora `contracts/scheduler-event.md` lo dice.)*
- **`JOBS_ONLY` en `tests/messages.test.ts`**: los códigos de las tareas no llegan ni a la consola ni a la web en E1; se declaran con su motivo, y un test impide que quede uno muerto. Los de `job_frequencies` saldrán de la lista en E3, cuando Ajustes los diga.
- **Un código escrito con un ternario escapa al guardián de los mensajes** (`code: cond ? "a" : "b"`): el escáner no lo ve. Lo encontró el propio test «no dead entry» al añadir `JOBS_ONLY`; `readJobFrequencies` escribe ahora cada código entero. Lección para las entregas siguientes.
- **El ZIP de la API dependía de la carpeta desde la que se construía**: esbuild escribe en el paquete rutas relativas a su carpeta de trabajo. Con el constructor común, `absWorkingDir` es la raíz, y el ZIP es el mismo desde cualquier carpeta (comprobado: `d844c900…` desde la raíz y desde `apps/api`). El tamaño del paquete de la API bajó de 1.447.023 a 1.440.348 bytes por eso, no por un cambio de código.
- **`ecb_stale_currency_days` en la nube**: no hay `atlas.config.json`; la lectura de los precios del recordatorio usa `DEFAULT_LOCAL_CONFIG` (30 días). Si la dirección lo quiere configurable en la nube, es una variable más de la función de correo.
- **El aviso del cliente OAuth**: la fecha límite es la del último inicio de sesión más seis meses (`addMonths`), y el aviso sale a partir de `ATLAS_OAUTH_IDLE_WARNING_DAYS` (150), con techo fijo de 179.
- **Los registros que no se leen**: un registro de una tarea ilegible nunca cuenta como libre (`job_record_unreadable`, y no se hace nada).

### 10.3 Cómo se vio cada test en rojo

- **Los guardianes G1-G8**, contra los módulos vacíos (`export {};` en `apps/jobs/src/{lambda,compose,handler,tasks/mail}.ts`, `domain/src/jobs.ts`, `ports/notifier.ts`, `aws/{mail,sdk-ses}.ts`): `jobs-access` 3 de 6 en rojo (el correo que no alcanza nada, ningún lector del interruptor, menos de diez ficheros para el reloj) y `jobs-package` 3 de 3 (sin guion de construcción) — `016-red-guards.log`. Después, cada uno visto morir por su regla en la mutación (§10.4).
- **El guardián de dependencias del SDK (G4)**: la versión anterior de `tests/api-access.test.ts` contra el manifiesto con `@aws-sdk/client-sesv2` falla («+ "@aws-sdk/client-sesv2": "3.1141.0"», `016-g4-red.log`); se cambió en el mismo commit que la instalación.
- **La fecha del último inicio de sesión web (R16)**: los tres tests nuevos de `apps/api/test/sign-in.test.ts` contra el `handler.ts` anterior: 3 en rojo (`016-api-red.log`). Y dos tests existentes que fijaban las claves exactas del bucket tras iniciar sesión fallaron con el cambio y se pusieron al día a propósito (ahora llevan `access/last-web-sign-in.json`).
- **El dominio**: la primera pasada falló en el texto exacto del recordatorio (el sangrado de los porcentajes, que el test fijaba mal) y la cobertura dejó cuatro ramas sin cubrir (`strict.ts:29`, el suplente suelto de verdad; `format.ts`, el signo y los cero decimales; `mail/reminder.ts:40`, el correo sin aproximación), que se cubrieron o se quitaron.
- **Los tests de `apps/jobs`** pasaron a la primera: su rojo es la mutación (§10.4), donde cada regla de §4.2 que atan cayó con su mutante.

### 10.4 Mutación (guion `016-mutate.mjs`, copia del de la 015: afirma cada sustitución, restaura, compara byte a byte, se niega con gemelos `.js`; lotes de ocho, uno a uno, tras la puerta de memoria)

`016-e1-b1.json`, `-b2.json`, `-b3.json`, `-g.json` y `-b2x.json`; veredictos en sus `.out`. **34 ejecuciones, 32 muertos**; `E1-5b` sobrevivió con su argumento escrito debajo y lo mata el test de su regla (`E1-5b2`); `G-sesraw` no se aplicó y se repitió como `G-sesraw2`, muerto:

| Id | Mutante (§6 del encargo) | Test que lo mata | Veredicto |
|---|---|---|---|
| E1-1a | los euros del reparto con el interruptor apagado [1] | `domain/test/jobs/reminder.test.ts`, `apps/jobs/test/reminder.test.ts` | KILLED |
| E1-1b | una línea de clase dice euros en vez de porcentaje [1] | `reminder.test.ts` (dominio) | KILLED |
| E1-2a | el interruptor encendido si está presente [2] | `event-config.test.ts`, `apps/jobs/test/reminder.test.ts` | KILLED |
| E1-2b | el interruptor comparado tras `trim()` [2] | `event-config.test.ts` | KILLED |
| E1-2c | un segundo lector del interruptor, en el adaptador de SES [2] | `tests/jobs-access.test.ts` (por su regla) | KILLED |
| E1-3a | el `Notifier` envía al destinatario que trae el mensaje [3] | `adapters/test/aws/mail.test.ts` | KILLED |
| E1-3b | un destinatario que no es una dirección envía [3] | `mail.test.ts` | KILLED |
| E1-4a | el recordatorio mensual se puede apagar [4] | `frequencies.test.ts`, `apps/jobs/test/reminder.test.ts` | KILLED |
| E1-4b | una clave desconocida invalida la lectura [4] | ídem | KILLED |
| E1-4c | lo ignorado no se dice en el registro [4] | `apps/jobs/test/reminder.test.ts` | KILLED |
| E1-4d | sin recordatorio con el libro que no carga [4] | ídem | KILLED |
| E1-5a | un aviso cortado tras `sending` se retoma [5] | `run-record.test.ts` | KILLED |
| E1-5b | un periodo reclamado se toma por libre [5] | `apps/jobs/test/reminder.test.ts` | **SURVIVED** (ver abajo) |
| E1-5b2 | el mismo mutante, con el test de su regla | `run-record.test.ts` | KILLED |
| E1-5d | el manejador reclama con `If-None-Match` un periodo abierto [5] | `apps/jobs/test/reminder.test.ts` | KILLED |
| E1-5c | una racha se envía antes de marcarla `sending` [5] | `apps/jobs/test/dispatch.test.ts` | KILLED |
| E1-6 | el día de las tareas en UTC [6] | `apps/jobs/test/reminder.test.ts` | KILLED |
| E1-7a | un evento con un campo desconocido se ejecuta [7] | `event-config.test.ts`, `apps/jobs/test/reminder.test.ts` | KILLED |
| E1-7b | una tarea de otra función se ejecuta [7] | `apps/jobs/test/reminder.test.ts` | KILLED |
| E1-8a | los registros ilegibles de los tokens se omiten [8] | `reminder.test.ts` (dominio) | KILLED |
| E1-8b | un token revocado cuenta como vivo [8] | ídem | KILLED |
| E1-9a | el registro copia el mensaje de un error ajeno (las dos defensas a la vez) [9] | `apps/jobs/test/sentinels.test.ts` | KILLED |
| E1-9b | el objeto del inicio de sesión web lleva algo más que la fecha [9] | `web-sign-in.test.ts`, `apps/api/test/sign-in.test.ts` | KILLED |
| E1-9c | la fecha del inicio de sesión web retrocede [9] | ídem | KILLED |
| E1-10 | el `Notifier` de fichero alcanzable desde el artefacto [10] | `tests/jobs-package.test.ts` («would carry tests or doubles») | KILLED |
| E1-R20 | un asunto que no es ASCII (R20) | `reminder.test.ts` (dominio) | KILLED |
| G-mailkeys | la tarea de correo alcanza una fuente de precios (B2) | `jobs-access.test.ts`, por su regla | KILLED |
| G-apirel | la API alcanza las tareas por ruta relativa | `jobs-access.test.ts`, por su regla | KILLED |
| G-webdoor | la web alcanza las reglas de las tareas por su puerta | `jobs-access.test.ts`, por su regla | KILLED |
| G-relay | la consola reexporta las tareas por un relevo | `architecture.test.ts` («is imported by nothing») | KILLED |
| G-clock | un módulo de las tareas lee la hora real | `jobs-access.test.ts`, por su regla | KILLED |
| G-dynamic | las tareas importan con un `import()` no literal | `architecture.test.ts`, por su regla | KILLED |
| G-sesraw | el adaptador de SES toma una segunda orden | — | NOT APPLIED (el `find` no casaba tras el formateo de Biome) |
| G-sesraw2 | el mismo, con el `find` real | `api-access.test.ts` («takes from the SDK only») | KILLED |

**E1-5b no es un mutante equivalente, y su supervivencia contra el test del manejador tiene un argumento escrito**: `runPeriod` hace lo mismo con `start` y con `resume` — reclama con `claimRecord(…, found)` y escribe sobre el ETag leído (`If-Match` si había registro, `If-None-Match: *` si no). La distinción vive solo en la regla del dominio, y su test la mata (E1-5b2). El mutante que sí rompería «al menos una vez» es reclamar con `If-None-Match` un periodo que tiene registro, y lo mata el test de corte (E1-5d).

### 10.5 Capturas de los correos (texto, con el `Notifier` de SES sobre el doble y la composición entera; `~/personal/atlas/privado/capturas/2026-09-27-016-e1/`)

Guion `016-capture-mails.mjs` sobre el arnés compilado: `01-recordatorio-sin-importes`, `02-recordatorio-con-importes`, `03-recordatorio-sin-libro-ni-tokens`, `04-recordatorio-aviso-cliente-oauth` y `05-aviso-tarea-fallida`. Mirados uno a uno: sin importes, ni activos, ni cuentas con el interruptor apagado; con él, solo los euros del reparto; el recordatorio degradado dice sus tres códigos; el aviso del cliente OAuth sale a los 162 días con la fecha límite. Una primera versión del escenario 3 limitaba SSM también para el destinatario, y **no salió ningún correo**, que es lo correcto (`mail_recipient_unavailable`, el periodo queda abierto); se cambió el escenario para que falle solo el registro de los tokens.

### 10.6 El paquete web

E1 no toca la web salvo `FORBIDDEN_IN_WEB` en `check-bundle.mjs`. Medido en la tubería (§10.8): el arranque y el total, iguales a la partida (74.125 y 301.439).

### 10.7 Autocomprobación de §5, familia a familia

| Familia | Qué miré | Con qué | Resultado |
|---|---|---|---|
| 1. Guardianes eludibles | Que las tareas, el `Notifier`, SES y las claves no se alcancen desde la API ni la web, y que la regla muera por sí misma | `tests/jobs-access.test.ts` y `architecture.test.ts` sobre el grafo parseado (reexportación, ruta relativa, puerta del paquete, relevo, `import()` no literal) y `FORBIDDEN_IN_WEB` en el grafo del paquete; mutantes G-* vistos morir **por su regla** (`expect` del guion) | Todo muerto. Cuenta de tests de guardianes: `architecture` 49 → 51, `api-access` 28 → 28, `jobs-access` 0 → 6, `jobs-package` 0 → 3, `messages` 10 → 11. Ninguno baja. Los comentarios que afirman un guardián (`aws/jobs.ts`, `compose.ts`, `test-only-file-notifier.ts`) tienen su test (G3, G8) |
| 2. Reglas sin test o sin valor exacto | Cada cifra del correo con el interruptor encendido, cada recuento (tokens vivos, emitidos, ilegibles; días) y cada umbral (150/179 días) con su valor exacto | `reminder.test.ts` fija el cuerpo entero con el interruptor apagado y las líneas exactas que añade encendido; recuentos y bordes (149/150 días) | Cada regla de §4.2 con su mutante muerto (§10.4) |
| 3. Reloj y red | Ningún `new Date()` ni `Date.now()` en lo nuevo; bordes de Madrid; ninguna red | G6 sobre las carpetas y ficheros de la feature; `periods.test.ts` (marzo, octubre, fin de mes, Nochevieja) y la prueba de extremo a extremo a las 23:30 UTC; todos los dobles en memoria, ningún `setTimeout` | Limpio; G-clock muerto |
| 4. Documentos desalineados | Que cada afirmación de un comentario cite y cuadre con el código; lista de «Documentos» al día; la descripción de la PR contra el último commit | Relectura de las cabeceras de cada fichero nuevo contra su código; §6 ampliada; la descripción de la PR releída sobre el SHA congelado | Un comentario inexacto, corregido: la cabecera de `run-record.ts` decía que un `failed` no había enviado nada; en `dispatch_findings` un correo puede haber salido antes del fallo, y lo que impide el reenvío es la racha marcada `sending`, no el registro. Ahora lo dice así |
| 5. Techo del paquete | Si E1 mueve el paquete web | La tubería (`build` con `check-bundle.mjs`) | No aplica: E1 no añade nada a la web; el techo no se toca |
| 6. Registros con datos sensibles | Destinatario, remitente, asunto, cuerpo, importes, ids, clave, `sub`, mensaje de error ajeno, en los caminos de fallo | `apps/jobs/test/sentinels.test.ts`: `stdout` y `stderr` capturados; SSM limitado, SES que rechaza y que pierde, S3 que deniega con un mensaje lleno de centinelas, una tarea que lanza, un evento y una configuración con centinelas; `compose.test.ts` con un `AccessDenied` con ARN | Limpio; E1-9a muerto. La API: la razón de su línea es uno de cuatro literales |
| 7. Entradas sin validar | Evento, parámetros de SSM, registros y rachas del bucket, claves construidas desde el exterior | `parseJobEvent` (objeto plano, `Object.hasOwn`, sin prototipo); destinatario con `isMailAddress`; registros y rachas con lectura estricta, UTF-8 `fatal`, claves repetidas y suplentes; `noticeKey` sin recorrido de rutas; `JobsStore` solo escribe bajo `jobs/<familia>/` | Limpio. Límite dicho: la clave repetida del evento no se puede ver (§10.2) |
| 8. Dos pasos sin corte | Reclamar/hacer, hacer/cerrar, `sending`/enviar, enviar/apuntar | Tests de corte en `apps/jobs/test/reminder.test.ts` (entre enviar y cerrar: reenvío) y `dispatch.test.ts` (racha en `sending` tras un corte: `send_unknown` sin reenvío; y el estado en el momento del envío es `sending`) | E1-5c, E1-5d y E1-5a muertos |
| 9. Procedimientos | — | — | No aplica en E1: ningún procedimiento nuevo (los de esta feature son de E4) |
| 10. `--yes` | — | — | No aplica en E1: ninguna orden nueva de la consola (`atlas admin prices push` es de E2) |

### 10.8 Tubería

`016-pipeline.sh` (cada paso tras la puerta de memoria, nada en paralelo), sobre `1d80be4`:

```
lint 0 2s
typecheck 0 1s
cov1-domain 0 211s   (1.646 tests; dominio al 100 % de sentencias 8.750, ramas 5.368, funciones 1.964 y líneas 8.322)
cov1-others 0 632s   (1.643 tests)
cov2-domain 0 187s   (1.646 tests)
cov2-others 0 662s   (1.643 tests)
build 0 17s          (arranque 74.125 y total 301.439 bytes gzip, iguales a la partida; lambda.zip 1.442.269 bytes; jobs.zip 1.559.641 bytes, 1.376 entradas)
```

Además: `git diff origin/develop -- tests/fixtures` vacío; ningún gemelo `.js`; la cuenta de tests de los guardianes, en §10.7.

**Predicción fiscal** (§8, escrita antes de correr nada): cumplida. E1 no toca ningún camino fiscal, `tests/fixtures` no cambia y la suite de la salida fiscal pasa entera en las dos pasadas.

### 10.9 Congelado

**Código congelado en `bd1a526`**; la entrega queda congelada en el commit que añade esta sección, cuyo SHA dice la descripción de la PR. Mientras dura la revisión no se empuja nada a la rama.

## 11. Preguntas nuevas de E1

- **Q11 — `ecb_stale_currency_days` en la nube.** La lectura de los precios del recordatorio usa el valor por defecto (30 días) de `DEFAULT_LOCAL_CONFIG`, porque en la nube no hay `atlas.config.json`. Recomendación: dejarlo así en E1 y, si hace falta, una variable de la función de correo en E2, cuando la nube tenga precios de verdad.
- **Q12 — Los códigos de las tareas y el guardián de los mensajes.** En E1 se declaran en `JOBS_ONLY` (§10.2). Recomendación: aceptarlo, y que E3 saque de la lista los de `job_frequencies` cuando Ajustes los diga.


## 12. Revisión de la PR #104, ronda 1: decisiones de la dirección y arreglos (2026-09-27)

Revisiones sobre `89e983a`: privacidad (comentario 5858145560) e idempotencia (comentario 5858284784). Decisiones de la dirección, del mismo día. Cada arreglo de lógica lleva su test visto en rojo y su mutante, que sobrevive antes y muere después.

### 12.1 Decisiones

**Privacidad**

- **B1.** `task_failed` solo admite como `subject` una tarea de `PRODUCER_TASKS` (con `Object.hasOwn`); con cualquier otro, ningún aviso. Un `task_failed` dentro de `findings` se rechaza. La función de correo solo envía los códigos de `PRODUCER_CODES[productor]`. Cambia `notice-mail.test.ts:27-30`, y un test de `dispatch` comprueba que `ses.sent` queda vacío ante un `subject` desconocido (un ISIN, `ast_xau`, `constructor`).
- **N1.** Resuelto con B1.
- **N2.** El correo de `task_failed` lleva la tarea, el periodo y el código, como dice el contrato, todo de listas cerradas.
- **N3.** Los centinelas cubren `dispatch_findings` enviando, con SES que rechaza y con el envío perdido.

**Idempotencia**

- **B1.** `run.ts` recuerda si llegó a marcar `sending`; si el *runner* lanza después, cierra como `send_unknown`, no como `failed`. Se corrige la fila `failed` de plan §5.3 (el recordatorio se rehace; un aviso, solo si no llegó a `sending`), se renombra el test y se añade el caso `sending → throw → send_unknown`.
- **B2.** Solo documento: el contrato del evento pierde la viñeta de UTF-8 y claves repetidas y los dos motivos, y describe la limitación; se corrige §10.2.
- **N1.** `markSending` se queda. El arnés permite inyectar *runners*, y `cuts.test.ts` prueba un *runner* de prueba que se entrega como mucho una vez: corte tras `sending` y reintento. Mata M1 y M2.
- **N2.** El guardián del reloj cubre carpetas enteras (`apps/jobs/`, `packages/domain/src/jobs/`, `packages/adapters/src/aws/jobs*` y los ficheros de la API que toca la 016) y amplía el patrón a `globalThis.Date`, `Reflect.construct(Date` y la desestructuración de `Date`. Mata M3 y M4.
- **N3.** Un registro `claimed` más reciente que el tiempo máximo de la Lambda (15 min, configurable) es `job_in_progress` y no se retoma. Test con los dos casos.
- **N4.** Si el propio registro del recordatorio es ilegible, el recordatorio lo reclama con `If-Match` sobre su ETag, registra un `ERROR` y sigue: el mes no se pierde. El registro ilegible de otro productor se avisa como `record_unreadable`, con la tarea de la lista cerrada. Dos tests.

### 12.2 Mapa hallazgo → commit

| Hallazgo | Commit | Qué |
|---|---|---|
| Privacidad B1, N1, N2, N3; idempotencia N4 (la parte del correo) | `929c7ed` | `conditionsOf` descarta de los `findings` los códigos que fabrica el correo (`task_failed`, `record_unreadable`); `ownFindings` y `producerOf` solo aceptan de cada productor sus códigos con sus asuntos, de listas cerradas (`ProducerFindings`: código → asuntos); `noticeMail` exige `Object.hasOwn(TASKS, subject)`, y dice el periodo solo si tiene forma de periodo (`PERIOD_SHAPE`) y el código solo si es uno de los nuestros; `dispatch_findings` avisa un registro ilegible de un productor como `record_unreadable`; los centinelas cubren los avisos enviados, rechazados y perdidos |
| Idempotencia B1, N1, N3, N4 (la parte del recordatorio) | `186bee4` | `run.ts` recuerda si marcó `sending` y, si el *runner* lanza después, cierra como `send_unknown`; `nextStep` recibe el instante y `ATLAS_JOB_MAX_RUN_SECONDS` (común a las cinco funciones, de 1 a 900, techo fijo) y da `job_in_progress` a un `claimed` o `sending` más reciente; el recordatorio reclama su propio registro ilegible con `If-Match` sobre su ETag (nunca uno de un formato más nuevo); `composeWith` y el arnés admiten *runners* de prueba; `cuts.test.ts` |
| Idempotencia N2 | `994e4a4` | El guardián del reloj, por carpetas enteras (`apps/jobs/`, `packages/domain/{src,test}/jobs/`, `packages/adapters/test/jobs/`, todo `aws/jobs*`) y por los ficheros que la 016 añade o toca fuera (la API incluida, y `scripts/lambda-package.mjs`), sobre el código sin comentarios del analizador; el patrón cubre `globalThis.Date`, `Reflect.construct(Date`, la desestructuración y el alias de `Date`, con un test propio de lo que caza y lo que no |
| Idempotencia B2 y la fila `failed` de B1 | `8bd1a2a` | `contracts/scheduler-event.md` pierde la viñeta de los bytes y los motivos `not_json` y `duplicate_key`, y dice el límite; `plan.md` §5.3 rehace la tabla (en curso, `failed`, ilegible); `data-model.md` §1; `contracts/mail.md` (`task_failed` y `record_unreadable`); `contracts/ssm-and-config.md` (`ATLAS_JOB_MAX_RUN_SECONDS`); §10.2 corregido |

### 12.3 Cómo se vio cada test en rojo

- **Dominio**: `notice-mail.test.ts` y `notices.test.ts` nuevos contra el código de `89e983a`: 7 en rojo (`016-r1-red1.log`); `run-record.test.ts` y `event-config.test.ts` contra el dominio con los arreglos de privacidad: 4 en rojo, el de «en curso» y los tres de la configuración (`016-r1-red2.log`).
- **`apps/jobs`**: los tests nuevos y cambiados de `cuts`, `reminder` y `dispatch` contra `run.ts`, `tasks/mail.ts`, `jobs-store.ts` y las reglas del dominio de `89e983a` (con el arnés nuevo): 8 en rojo (`016-r1-jobs-red.log`) — el corte con reenvío, el propio registro ilegible, el periodo en curso, el texto del aviso, el aviso forjado, el registro ilegible de un productor, el corte tras `sending` y el `send_unknown` tras lanzar.
- **El guardián del reloj**: M3 y M4 sobrevivían a `89e983a` (revisión de idempotencia, tabla de mutantes); ahora mueren por su regla.

### 12.4 Mutación (lotes `016-r1-a.json` y `016-r1-b.json`, uno a uno tras la puerta de memoria)

| Id | Mutante | Antes | Después |
|---|---|---|---|
| R1-M1 | `markSending` no escribe (M1 del revisor) | sobrevivía (revisión) | KILLED por `cuts.test.ts` |
| R1-M2 | un `sending` como mucho una vez se retoma (M2) | sobrevivía | KILLED por `cuts.test.ts` |
| R1-M3 | `new globalThis.Date()` en `run.ts` (M3) | sobrevivía | KILLED por `jobs-access.test.ts`, por su regla |
| R1-M4 | `Date.now()` en `aws/jobs.ts` (M4) | sobrevivía | KILLED por `jobs-access.test.ts`, por su regla |
| R1-B1i | cerrar como `failed` tras `sending` (B1) | no existía la distinción | KILLED por `cuts.test.ts` |
| R1-N3 | retomar una ejecución en curso | no existía la regla | KILLED por `run-record.test.ts` y `reminder.test.ts` |
| R1-N4a | el recordatorio se salta su propio registro ilegible | era la conducta | KILLED por `reminder.test.ts` |
| R1-N4b | el recordatorio reescribe un registro de un formato más nuevo | — | KILLED por `reminder.test.ts` |
| R1-N4c | el correo se salta el registro ilegible de un productor | era la conducta | KILLED por `dispatch.test.ts` |
| R1-P1 | un código fabricado se toma de los `findings` | era la conducta | KILLED por `notices.test.ts` y `dispatch.test.ts` |
| R1-P2 | un aviso nombra un `subject` que no es un productor | era la conducta | KILLED por `notice-mail.test.ts` |
| R1-P3 | los `findings` de un productor, sin filtrar | era la conducta | KILLED por `notices.test.ts` |
| R1-P4 | el código del resultado, tal como vino | — | KILLED por `notice-mail.test.ts` |

13 de 13 muertos.

### 12.5 Lo que se volvió a mirar alrededor

- **Defensa en profundidad del correo**: con B1 hay tres cerraduras independientes — `conditionsOf` (nunca un código fabricado de un registro), `ownFindings` (solo los códigos y asuntos del productor) y `noticeMail` (solo tareas de la lista y códigos conocidos). R1-P3 muere por su test propio porque `noticeMail` también lo pararía en `dispatch`: por eso cada cerradura tiene el suyo.
- **El `subject` de las rachas**: `producerOf` usa las mismas listas, así que una racha de un código o un asunto que ya no se admite no se cierra ni se reabre: queda como está.
- **E2 hereda el formato**: `PRODUCER_FINDINGS` (código → asuntos) es donde E2 y E4 declararán sus códigos (`source_failing` con `eodhd`/`alpha_vantage`, `ecb_update_rejected` con `ecb`, `thesis_horizon_exceeded`…), y la redacción de cada uno entra en `mail/notice.ts` con su test.
- **Los tiempos de los tests de corte**: con `job_in_progress`, un reintento inmediato ya no reenvía; los tests de corte avanzan el reloj más allá de los 15 minutos y comprueban también el lado de dentro (06:14:59 en curso, 06:15:00 fuera).
- **El test de los mensajes**: `job_in_progress` entra en `JOBS_ONLY`; `record_unreadable` lo dice el correo con su frase.

### 12.6 Tubería

`016-pipeline.sh` sobre `8bd1a2a` (cada paso tras la puerta de memoria, nada en paralelo):

```
lint 0 3s
typecheck 0 1s
cov1-domain 0 214s   (dominio al 100 %: sentencias 8.784, ramas 5.393, funciones 1.974, líneas 8.355)
cov1-others 0 615s   (1.653 tests)
cov2-domain 0 223s
cov2-others 0 703s   (1.653 tests)
build 0 14s          (arranque y total del paquete web sin cambios; jobs.zip 1.562.981 bytes)
```

`tests/fixtures` sin cambios; ningún gemelo `.js`. Tests de los guardianes: `architecture` 51, `api-access` 28, `jobs-access` 6 → 7 (el de las formas del reloj), `jobs-package` 3, `messages` 11. Ninguno baja.

### 12.7 Congelado

**Congelada la ronda 1 en el commit que añade esta sección**, cuyo SHA dice el mapa de la PR. Código en `8bd1a2a`. No se empuja nada más hasta la palabra de la dirección.

## 13. Revisión de la PR #104, ronda 2: decisiones de la dirección y arreglos (2026-09-27)

Revisión sobre `003ee81` (comentario 5858858950): un bloqueante pequeño, residuo de la B1 de idempotencia. Decisiones de la dirección, del mismo día:

- **R2-B1.** En `run.ts`, si se llegó a marcar `sending` y el *runner* **devuelve** `failed`, se escribe `send_unknown`, igual que si hubiera lanzado. Test en `cuts.test.ts` (`weekly_review` con un *runner* de prueba: `ses.attempts` se queda en 1) y su mutante.
- **R2-N1.** El guardián del reloj cubre también `packages/adapters/src/aws/index.ts` y los tests de `packages/adapters/test/aws/jobs*`. Mata el mutante con `Date.now()` en `aws/index.ts`.
- **R2-N2.** Se deja como está.
- **Textos de E4 en `contracts/mail.md` §2** (se construyen en E4; el contrato se corrige ya):
  - `weekly_review`: los porcentajes y los puntos de desviación se quedan (P9 permite porcentajes);
  - `informative_thresholds`: texto neutro, por ejemplo «Revisa si te corresponde presentar el modelo 720/721 de <año>», sin la palabra «umbral», sin cifras y sin decir si se supera: el correo no deja deducir ninguna cota del patrimonio.

### 13.1 Mapa y evidencia

| Hallazgo | Commit | Qué | Rojo y mutante |
|---|---|---|---|
| R2-B1 | `553332f` | `run.ts`: con `sending` marcado, un `failed` **devuelto** por el *runner* se escribe `send_unknown`, igual que uno lanzado | `cuts.test.ts`, «returns `failed` after `sending`»: en rojo contra `8bd1a2a` (quedaba `failed` y el segundo día reenviaba). Mutante R2-B1 (`const state = result.state`): KILLED |
| R2-N1 | `bc24072` | El guardián del reloj añade `packages/adapters/src/aws/index.ts` y los tests `packages/adapters/test/aws/jobs*` (por patrón, con la lista que encuentra fijada) | M5 del revisor (`Date.now()` en `aws/index.ts`, R2-N1a) y `new Date()` en `jobs-store.test.ts` (R2-N1b): KILLED, por su regla |
| R2-N2 | — | Se deja como está, por decisión | — |
| Textos de E4 | `07c2f4a` | `contracts/mail.md` §2: `weekly_review` conserva porcentajes y puntos; `informative_thresholds` pasa a un texto neutro («Revisa si te corresponde presentar el modelo 720 de 2026.»), sin «umbral», sin cifras, sin decir si se supera, y sin cifras tampoco con el interruptor | — (se construye en E4) |

Comprobado sobre el último commit de código (`bc24072`): `lint` 0, `typecheck` 0, y los proyectos `jobs` y `repo` con `--pool=forks --maxWorkers=1`: 151 tests en verde. `jobs-access` sigue en 7 tests (el guardián crece por dentro). La dirección pidió para esta ronda lint, typecheck y los tests de `jobs`, no la tubería entera; la CI de la PR pasa la tubería completa.

**Congelada la ronda 2 en el commit que añade esta sección**, cuyo SHA dice el mapa de la PR.

## 14. E2: los datos del día en la nube (2026-09-27)

E1 fusionada en `develop` (PR #104, `2f1afbf`); la rama la trae con `29af456`. Ese `develop` traía también la PR #102 (`fix/prices-live-findings`), que cambia la cascada: `prices/config.json` gana `market_days` y `refetch_recent_days` por tipo de activo, y la cascada vuelve a pedir los últimos días de la cripto. E2 lo tiene en cuenta (§14.2, Q13).

### 14.1 Bloque 0 de E2

Las verificaciones se hicieron antes de escribir el código de cada punto; este apartado se escribió tras los dos primeros commits de E2 (`b9e349f` y `d318153`), que aplican lo que aquí se verifica. Lo digo como desviación del orden del §6 del encargo.

**Punto 1 — el cupo compartido** (documentación releída el 2026-09-27):

- **EODHD**: `https://eodhd.com/financial-apis/api-limits`: «Free plan — 20 API calls per day»; «For subscription plans the daily limit resets at midnight GMT. The counter itself is reset lazily: it is zeroed by your first request after midnight»; «Failed lookups are charged. A request for a ticker that does not exist returns HTTP 404 and still costs its normal price»; agotado el día, «requests are refused with HTTP 402»; por minuto, 429 con `Retry-After`, a 1.000 por minuto.
- **Alpha Vantage**: `https://www.alphavantage.co/support/`: «standard API usage limit (25 API requests per day)». La hora de reinicio, un límite por segundo o por minuto y la forma del error **siguen sin documentar**: el segundo de espera y el 200 con `Note`/`Information` salen de la observación en vivo de la 013.
- **Usar la misma clave desde dos máquinas del mismo usuario**: EODHD prohíbe compartirla con **otras personas** (`…/terms-conditions`), no nombra dispositivos; Alpha Vantage concede el uso «on any computer or mobile device … that you own or control, for personal, non-commercial use» (`terms_of_service`, §2.a, PDF leído a mano). Que una función en la nube cuente como un dispositivo que el usuario controla es interpretación.
- **Conclusión**: nada cambia desde el 2026-09-24. Los presupuestos de la nube quedan en **18 y 23** (§8.2 M5), que dejan 2 y 2 a la consola del mismo día GMT (EODHD) o de las mismas 24 horas (Alpha Vantage), con la regla de la 013: la reserva se escribe antes de llamar, en `_status.json` del almacén de cada uno. **Los dos almacenes no se ven**: la consola cuenta en su `prices/_status.json` y la nube en el del bucket, así que la suma la garantiza el reparto 18+2 y 23+2, no un contador común. Es lo que decidió M5; lo digo porque la consola, con la opción explícita de E3, puede gastar sus 2 y nada la para en 20.

**Punto 2 — los nombres de `prices/` que se sirven** (código de `2f1afbf`, guion `016-names.mjs` sobre `priceFileName` compilado):

| `asset_id` | nombre (`priceFileName`) | regla de la 015 | regla nueva (ida y vuelta, ≤ 255) |
|---|---|---|---|
| `ast_world`, `IE00B4L5Y983` | igual + `.jsonl` | sí | sí |
| `ast%x` | `ast%25x.jsonl` | no | sí |
| `ast(b)`, `ast!b`, `ast'b`, `ast*b`, `ast~b` | sin codificar | no | sí |
| `_x`, `-x` | `_x.jsonl`, `-x.jsonl` | no | sí |
| `.x` | `%2Ex.jsonl` | no | sí |
| `..` | `%2E..jsonl` | no (`..`) | sí: sin `/`, es una clave plana |
| `a b`, `a/b`, `ñandú` | `a%20b.jsonl`, `a%2Fb.jsonl`, `%C3%B1and%C3%BA.jsonl` | no | sí |
| 123 y 124 caracteres | 129 y 130 caracteres | no (> 128) | sí |
| 250 caracteres o más | 256 o más | no | **no** |
| — | `symbols.json` | sí | sí, por su nombre |
| — | `_status.json`, `config.json` | `_status` no; `config` sí | **no** (Q4) |

- **Qué admite el cargador como `asset_id`**: cualquier cadena (`schema/validate.ts:73`, `asset_id: req("string")`); la regla nueva exige además que no sea vacía (`.jsonl` no se sirve).
- **Lo único que sigue sin pasar** es un `asset_id` cuyo nombre de fichero pasa de 255 caracteres. **No es una restricción nueva**: la consola tampoco puede guardar ese fichero, porque el sistema de ficheros no admite nombres de más de 255 bytes, y el nombre codificado es ASCII. Ningún dispositivo necesita, por tanto, un nombre que la regla no sirva: **no para**.
- **Sin verificar, para la 018**: que CloudFront y la Function URL entreguen `rawPath` sin decodificar las secuencias `%XX` (el manejador compara el segmento tal como llega). Si las decodificaran, `ast%25x.jsonl` llegaría como `ast%x.jsonl` y se negaría (400), nunca serviría otro fichero.

**Punto 3 — tiempo y memoria de la Lambda** (límites en §1.7):

- **BCE**: un ZIP de unos 600 KB y un CSV de unos 7.100 días por unas 40 divisas; leerlo y compararlo en el dominio tarda menos de un segundo en la máquina de desarrollo. Propuesta: 300 s y 256 MB.
- **Precios**: como mucho 18 + 23 = 41 llamadas, con un segundo entre las de Alpha Vantage. **Los adaptadores de la 013 no ponen tiempo máximo a `fetch`**: en la nube, una fuente colgada consumiría la Lambda entera. La composición de la tarea les pasa un `fetch` con `AbortSignal.timeout(15 s)`: el peor caso son 41 × 15 s = 615 s, por debajo de 900 s. Propuesta: 900 s y 256 MB para la función de precios, y `ATLAS_JOB_MAX_RUN_SECONDS` igual a su `timeout` en cada función.

**Punto 4 — `updatePrices` y `symbols.json`** (`cascade.ts` de `2f1afbf`): escribe `symbols.json` al contrastar una fuente sin `currency_check` (`contrast`) y al limpiar los días de una purga (`clearRefetched`). Con `symbols: "read_only"` (Q1, aceptada): una fuente sin contrastar se deja fuera como `currency_unchecked` (informe, nunca `_status.json`), y los días de una purga no se persiguen; así ninguno de los dos caminos escribe. El almacén de S3 se niega además a `writeSymbols` y a `rewriteCloses` (segunda cerradura). **Sale bien: E2 sigue.**

### 14.2 Qué hay en la rama

| Commit | Qué |
|---|---|
| `29af456` | `develop` traído a la rama tras la fusión de E1 (con la PR #102) |
| `b9e349f` | Q1: `updatePrices({ symbols: "read_only" })`: una fuente sin `currency_check` queda fuera como `currency_unchecked` (con `unchecked` en el informe), no se contrasta y no se persiguen los días de una purga; la consola dice el nuevo resultado |
| `d318153` | M1: `REFERENCE_NAME` de `prices/` por ida y vuelta con `priceFileName` (≤ 255, id no vacío); `symbols.json` se sirve por su nombre, `_status.json` y `config.json` no; el índice filtra lo que no se serviría |
| `af26191` | §14.1, el bloque 0 |
| `5fa7429` | El cupo de la nube en variables (`ATLAS_PRICE_SOURCES`, `ATLAS_PRICES_EODHD_DAILY_CALLS` 0-20, `ATLAS_PRICES_ALPHA_VANTAGE_DAILY_CALLS` 0-25, `ATLAS_PRICES_FAILURE_THRESHOLD` 1-30), `simulated` negada en `prod`, y `cloudPriceConfigText`, que las convierte en el texto de un `prices/config.json` para la cascada |
| `484a6ae` | Los hallazgos de E2 en el dominio (`PRODUCER_FINDINGS` de `ecb_update` y `prices_update`, `ecbFindings`, `pricesFindings`) y su redacción en `mail/notice.ts`, con los recuentos de una lista cerrada («algunos» si no es un entero) |
| `17d8333` | `ecbRecovery`: nada, deshacer desde `previous/` o dañado |
| `1cdaa2c` | Los adaptadores: `S3EcbHistoryStore` (activar, conservar un rechazo, recuperar), `S3PriceStore` (cada escritura con `If-Match` sobre lo que leyó la misma transacción; se niega a `writeSymbols` y a `rewriteCloses`), las claves de SSM (`/atlas/<entorno>/prices/eodhd-key` y `…/alpha-vantage-key`) y la fuente simulada; puerta `@atlas/adapters/aws-daily` |
| `d0effc2`, `ec868ed` | `apps/jobs`: la composición construye las fuentes (con `fetch` limitado a 15 s) y las tareas `ecb_update` y `prices_update`, que no envían nada y dejan sus hallazgos en su registro |
| `34f25ee` | La tarea de correo alcanzaba el adaptador de las claves por un `import type` de `run.ts`: lo vio el guardián B2 al ampliarlo; ahora el tipo de las claves es un registro simple |
| `7632013` | Guardián: los escritores diarios y la fuente simulada, fuera de la API, la web, la consola y la tarea de correo; y los ficheros de E2 bajo el guardián del reloj |
| `271a267` | La fuente simulada pasa de `adapters/src/prices/simulated.ts` a `adapters/src/aws/simulated-prices.ts` (§14.3) |
| `74cbb9e`, `d5963aa` | `atlas admin prices push` (bloque 3): `symbolsPushPlan` en el dominio y la orden en la consola |
| `f29d171` | Guardián: un solo escritor por objeto en `prices/` (la nube nunca escribe `symbols.json` ni nombra `config.json`) |
| `b159121`, `2639a4b`, `2de2671` | Tests: centinelas en los caminos de fallo de las dos tareas diarias; los activos, solo del libro; el aviso de tesis, solo por el horizonte |
| `48a8355` | El plan y `contracts/mail.md` al día con lo construido |
| `5506399`, `187954c` | Los dos huecos que abrió la mutación (§14.5): los centinelas capturan también la consola de Node; `push` con otro escritor justo después de su lectura |
| `9e28eea` | `contracts/iam-permissions.md` §8 (el rol de administración para `push`) y §9 (tiempo y memoria de las dos funciones); `tasks.md` de E2 |

### 14.3 Desviaciones del plan, dichas

- **`symbolsPushPlan` vive en `domain/src/quotes/symbols-push.ts`**, no en `domain/src/jobs/` como decía el plan: la consola no puede alcanzar el código de las tareas (guardián de 016), y la regla es de la correspondencia de símbolos, no de una tarea.
- **Los hallazgos van en un fichero, `domain/src/jobs/findings.ts`**, y no en `prices-findings.ts` y `ecb-findings.ts`: las dos funciones son cortas y comparten la lista cerrada `PRODUCER_FINDINGS`.
- **La fuente simulada vive en `adapters/src/aws/simulated-prices.ts`**, no en `adapters/src/prices/`: un test de arquitectura de la 013 exige que ningún *subpath* del paquete que la web podría importar alcance `prices/`, donde viven las direcciones de las fuentes, y la puerta `aws-daily` es uno. El guardián de los dobles la nombra con su nueva ruta; sigue siendo **la única excepción declarada**.
- **`atlas admin prices push` y un remoto que no se lee**: el encargo dice qué hacer con un fichero local ilegible (negarse), no con un remoto ilegible. La orden **lo sustituye, diciéndolo** en la diferencia («no se puede leer: se sustituye entero»), con la misma confirmación tecleando el entorno: es la única forma de arreglarlo sin la CLI de AWS. Un remoto **de un formato más nuevo** se niega (`symbols_push_remote_newer`): una consola vieja nunca reescribe un fichero más nuevo. Q14.
- **`atlas admin prices push` sube los bytes locales tal cual**, sin volver a escribirlos: un fichero de formato 1 se sube como está (la nube lee el formato 1); uno de formato 1 cuya confirmación deja cierres mal guardados se niega como `misstored`, porque el lector lo convierte así.
- **Un conflicto de `push`** (otro escritor entre la lectura y la escritura) sale con el código 1 (`symbols_push_conflict`), como `forget_contention`, y nunca reintenta: la diferencia nueva hay que verla.
- **El registro de la tarea de precios** lleva recuentos por resultado (`updated`, `up_to_date`, `failed`, `out_of_budget`, `unchecked`, `no_symbol`) y ningún id; el del BCE, `undone`, `new_days`, `calendar` o `conflicts`.
- **Un historial del BCE dañado** (el manifiesto no cuadra y `previous/` no deja deshacer) es un hallazgo más, `ecb_history_damaged`, con su frase en el correo; el plan lo nombraba en §7.1 y no en la tabla del contrato del correo, que ya lo tiene.

### 14.4 Cómo se vio cada test en rojo

- **La cascada con `read_only`** (Q1): los tres tests nuevos de `cascade.test.ts` contra la cascada de `2f1afbf`: 3 en rojo (`016-e2-red1.log`).
- **Los nombres de `prices/`** (M1): los casos nuevos de `sync-routes.test.ts` contra la regla de la 015; y dos tests de la API que fijaban la respuesta anterior (`prices/notes.txt` daba 404 `type`; ahora da 400 `reference_name_invalid`) fallaron con el cambio y se pusieron al día a propósito (el caso del 404 `type` pasa a `reference/ecb/`).
- **El guardián de los mensajes** se puso en rojo con los cinco códigos nuevos de los hallazgos y se declararon en `JOBS_ONLY`; con los tres de `push`, en `CLI_ONLY`.
- **Los guardianes, en rojo de verdad**: el B2 ampliado encontró que la tarea de correo alcanzaba `aws/price-keys.ts` por un `import type` (`34f25ee`); el test de arquitectura de la 013 encontró la fuente simulada bajo `prices/` alcanzable por un *subpath* (`271a267`). Los nuevos se vieron morir con una importación de `aws-daily` en la API y con una escritura de `symbols.json` y un `config.json` en el código de la nube.
- **Las tareas y los almacenes**: sus tests pasaron tras ajustar el arnés (las compras del libro de prueba estaban fechadas después del día de la tarea, y el cargador ahora proyecta al día); su rojo es la mutación (§14.5), donde cada regla de §4.2 que atan cayó con su mutante.

### 14.5 Mutación (lotes `016-e2-a.json` a `016-e2-e.json`, uno a uno tras la puerta de memoria)

**30 ejecuciones: de los 28 mutantes, 26 muertos a la primera; los dos que sobrevivieron descubrieron dos huecos de los tests, que se cerraron, y murieron al repetirlos** (`15-2`, `13bis-b-2`; lote `016-e2-e.json`):

| Id | Mutante (§6 del encargo) | Test que lo mata | Veredicto |
|---|---|---|---|
| 11 | pedir el día en curso (`to = today`) [11] | `apps/jobs/test/daily.test.ts` | KILLED |
| 12 | llamar a una fuente sin reservar antes la llamada [12] | `daily.test.ts` (conflicto: la reserva se queda) | KILLED |
| 13a | el almacén de la nube escribe `symbols.json` [13] | `adapters/test/aws/s3-daily.test.ts`, `tests/jobs-access.test.ts` | KILLED |
| 13b | el almacén lee un `prices/config.json` del bucket [13] | ídem | KILLED |
| 14a | descargar una correspondencia sin contrastar (la cascada) [14] | `daily.test.ts` | KILLED |
| 14b | la tarea corre la cascada en lectura y escritura (contrasta en la nube) [14] | `daily.test.ts` | KILLED |
| 15 | las claves impresas con `console.log` [15] | `apps/jobs/test/sentinels.test.ts` | **SURVIVED** (ver abajo) |
| 15-2 | el mismo, con los centinelas que capturan la consola de Node | `sentinels.test.ts` | KILLED |
| 16 | sin claves, la ejecución falla (y el correo lo diría) [16] | `daily.test.ts` | KILLED |
| 17a | la fuente simulada aceptada en `prod` [17] | `daily.test.ts`, `domain/test/jobs/prices-config.test.ts` | KILLED |
| 17b | un segundo doble, sin nombrar, en el artefacto [17] | `tests/jobs-package.test.ts` | KILLED |
| 18a | `not_found` cuenta como fallo de la fuente [18] | `domain/test/quotes` | KILLED |
| 18b | una fuente avisada por debajo de su umbral [18] | `daily.test.ts`, `findings.test.ts` | KILLED |
| 18bis | un aviso de tesis por algo que no es el horizonte [18 bis] | `daily.test.ts` | KILLED |
| 18bis-b | la tarea de correo alcanza el adaptador de las claves [18 bis] | `jobs-access.test.ts`, por su regla | KILLED |
| 19a | el BCE activado sin copia en `previous/` [19] | `s3-daily.test.ts` | KILLED |
| 19b | un lector que da por bueno el fichero en vigor sin su hash [19] | `s3-daily.test.ts` | KILLED |
| 19c | el manifiesto escrito antes que el fichero [19] | `s3-daily.test.ts` | KILLED |
| 20a | un conflicto de `prices/` reintentado sobre una lectura nueva [20] | `s3-daily.test.ts`, `daily.test.ts` | KILLED |
| 20b | un conflicto de `reference/ecb/` reintentado [20] | `s3-daily.test.ts` | KILLED |
| 21 | los activos sacados también de `symbols.json` [21] | `daily.test.ts` (`ast_stranger`) | KILLED |
| 13bis-a | `push` sube un `symbols.json` con `misstored` [13 bis] | `apps/cli/test/admin/prices-push.test.ts` | KILLED |
| 13bis-b | `push` escribe sobre una lectura posterior, no sobre la que enseñó la diferencia [13 bis] | `prices-push.test.ts` | **SURVIVED** (ver abajo) |
| 13bis-b-2 | el mismo, con el test de otro escritor tras la lectura | `prices-push.test.ts` | KILLED |
| 13bis-c | `push` acepta `--yes` [13 bis] | `prices-push.test.ts` | KILLED |
| 13bis-d | `push` confirma sin teclear el entorno [13 bis] | `prices-push.test.ts` | KILLED |
| 13bis-e | `push` sube también `config.json` [13 bis] | `prices-push.test.ts` | KILLED |
| 13bis-f | `push` deja un fichero de estado en la carpeta [13 bis] | `prices-push.test.ts` | KILLED |
| 13bis-g | `push` reescribe un remoto de un formato más nuevo | `prices-push.test.ts` | KILLED |
| M1 | se sirve un nombre de `prices/` que no hace la ida y vuelta | `domain/test/access/sync-routes.test.ts`, `apps/api/test/sync.test.ts` | KILLED |

- **15 sobrevivió por un hueco de E1**: los centinelas espiaban `process.stdout.write` y `process.stderr.write`, pero vitest se queda con `console.*` antes de que llegue a un flujo, así que un `console.log` nunca se veía. §10.7 (familia 6) decía «`stdout` y `stderr` capturados»: era cierto de los flujos y no de la consola. Ahora se espían también `console.log`, `info`, `warn`, `error` y `debug` (`5506399`); `15-2` muere.
- **13bis-b sobrevivió porque el test del conflicto metía al otro escritor dentro de la escritura**: la lectura nueva del mutante también veía el ETag viejo y la escritura fallaba igual. El test nuevo mete al otro escritor justo después de la lectura que enseña la diferencia (mientras se pide confirmación); con el mutante, la segunda lectura ve su ETag y lo pisa. `13bis-b-2` muere (`187954c`).

### 14.6 Autocomprobación de §5, familia a familia

| Familia | Qué miré | Con qué | Resultado |
|---|---|---|---|
| 1. Guardianes eludibles | Que las claves, los almacenes diarios y la fuente simulada no se alcancen desde la API, la web, la consola ni la tarea de correo; que la nube no escriba `symbols.json` ni nombre `config.json`; que el guardián del reloj cubra lo nuevo | `jobs-access.test.ts` sobre el grafo parseado (también los `import type`), el test de arquitectura de la 013 sobre los *subpaths*, `jobs-package.test.ts` sobre las entradas del paquete; cada regla nueva vista morir por sí misma | **Dos hallazgos reales** (§14.4): la tarea de correo alcanzaba `price-keys.ts` por un `import type`, y la fuente simulada quedaba bajo `prices/`, alcanzable por un *subpath*. Cuenta de tests: `architecture` 51 → 51, `api-access` 28 → 28, `jobs-access` 7 → 12, `jobs-package` 3 → 3, `messages` 11 → 11. Ninguno baja |
| 2. Reglas sin test o sin valor exacto | Cada techo (20, 25, 30), cada valor por defecto (18, 23, 3), cada recuento del registro y de los hallazgos, el día de la descarga, el umbral de fallos seguidos, el texto de cada aviso | `prices-config.test.ts` (bordes 0, techo y techo + 1), `findings.test.ts`, `notice-mail.test.ts` (asunto y cuerpo exactos), `daily.test.ts` (`to=2026-09-30`, recuentos exactos, el aviso el día 03 y ninguno más del 04 al 06) | Cada regla con su mutante muerto (§14.5) |
| 3. Reloj y red | Ningún `new Date()` ni `Date.now()` en lo nuevo; ninguna red en los tests; un tiempo máximo en cada llamada real | El guardián del reloj con los ficheros de E2; `fetch` inyectado en la composición (el de los tests rechaza lo que no espera); `AbortSignal.timeout(15 s)` en `compose.ts` | Limpio. La fuente simulada usa `new Date(fecha)` y `Date.parse`, nunca la hora real |
| 4. Documentos desalineados | Las cabeceras de cada fichero nuevo contra su código; el plan y los contratos contra lo construido | Relectura; el plan tenía nombres de ficheros que no existen (`prices-findings.ts`, `ecb-findings.ts`, `jobs/symbols-push.ts`, `prices/simulated.ts`) y los tests de R22-R33 con nombres viejos | Corregidos en `48a8355`; §10.7, familia 6, decía «`stdout` y `stderr` capturados» sin la consola de Node: lo corrige §14.5 |
| 5. Techo del paquete | Si E2 mueve el paquete web | La tubería (`build` con `check-bundle.mjs`) | La web no importa nada nuevo; arranque y total en §14.7 |
| 6. Registros con datos sensibles | La clave (también en la URL), los símbolos, los `asset_id`, el mensaje de un error ajeno, en los caminos de fallo de las dos tareas | `sentinels.test.ts` (red que rechaza con un mensaje lleno de centinelas, un 500 con ellos en el cuerpo, una respuesta ilegible; BCE y precios; registros de `jobs/` incluidos) y `daily.test.ts` (401: la clave en la URL pedida y en ningún registro ni log) | Limpio tras cerrar el hueco de la consola (15-2) |
| 7. Entradas sin validar | Las variables de la función, las claves de SSM, los nombres de `prices/`, el `symbols.json` del bucket y el local | `parseJobsConfig` (enteros, techos, fuentes conocidas y sin repetir); `readPriceKeys` (imprimibles, 1-256, nunca el valor en el error); `isPriceFileName` (ida y vuelta, `decodeURIComponent` en un `try`); `parseSymbols` estricto; `push` con UTF-8 `fatal` a los dos lados | Limpio |
| 8. Dos pasos sin corte | Reservar y llamar; escribir cierres y estado; activar el BCE (tres escrituras); leer y escribir en `push` | `s3-daily.test.ts` (un corte en cada hueco de la activación, un conflicto a mitad de transacción), `daily.test.ts` (conflicto: la reserva se queda), `prices-push.test.ts` (otro escritor entre la lectura y la escritura) | 12, 19a-c, 20a-b y 13bis-b-2 muertos |
| 9. Procedimientos | — | — | No aplica en E2: los procedimientos son de E4 (el de `push` es el 3) |
| 10. `--yes` | `atlas admin prices push` | `prices-push.test.ts`: `--yes` rechazado antes de leer nada; sin terminal, salida 4; lo tecleado que no es el entorno, cancelado; la diferencia en pantalla antes de preguntar | 13bis-c y 13bis-d muertos |

### 14.7 Tubería

`016-pipeline.sh` sobre `9e28eea` (cada paso tras la puerta de memoria, nada en paralelo):

```
lint 0 5s
typecheck 0 4s
cov1-domain 0 217s   (1.699 tests; dominio al 100 %: sentencias 8.936, ramas 5.520, funciones 2.014, líneas 8.502)
cov1-others 0 678s   (1.710 tests)
cov2-domain 0 171s   (1.699 tests)
cov2-others 0 729s   (1.710 tests)
build 0 13s          (lambda.zip 1.442.976 bytes; jobs.zip 1.627.481 bytes, 1.408 entradas)
```

- **El paquete web, igual a `develop`**: arranque 74.194 y total 301.825 bytes gzip, medidos con una copia de `check-bundle.mjs` que imprime los bytes, sobre este `build` y sobre un `vite build` de `2f1afbf` en la carpeta principal (que ya lleva la PR #102). E2 no añade nada a la web: la regla de nombres está en el servidor y en un módulo que la web no arranca, y `symbolsPushPlan` no lo importa la web.
- `git diff origin/develop -- tests/fixtures` vacío; ningún gemelo `.js`; la cuenta de tests de los guardianes, en §14.6.
- **Predicción fiscal** (escrita antes de correr nada): E2 no toca ningún camino fiscal; la cascada solo gana una rama que la consola no usa. Cumplida: `tests/fixtures` no cambia y la suite de la salida fiscal pasa entera en las dos pasadas.

### 14.8 Congelado

**Código congelado en `9e28eea`**; la entrega queda congelada en el commit que añade esta sección, cuyo SHA dice la descripción de la PR. Mientras dura la revisión no se empuja nada a la rama.

### 14.9 Preguntas nuevas de E2

- **Q13 — `market_days` y `refetch_recent_days` en la nube.** La PR #102 los añadió a `prices/config.json` con valores por tipo de activo. `cloudPriceConfigText` escribe solo `source_order`, `daily_calls` y el umbral, así que la nube usa **los valores por defecto** de `parsePriceConfig` (los mismos que la consola sin `config.json`). Recomendación: dejarlo así; si la dirección los quiere configurables en la nube, son variables más de la función de precios, con su techo.
- **Q14 — `atlas admin prices push` y un remoto ilegible** (§14.3). La orden lo sustituye, diciéndolo en la diferencia y con la misma confirmación; uno de formato más nuevo se niega. Recomendación: así.
- **Q15 — ~~La consola de Node en los centinelas de la API~~. Retirada** (revisión de la PR #106, N3 de `push`): era falsa. `apps/api/test/sentinels.test.ts:33-38` ya espía `console.log`, `info`, `warn`, `error` y `debug` desde `57fcfa0`, anterior a esta PR; yo leí solo las líneas 31-32. El hueco de §14.5 era solo de los centinelas de las tareas, y está cerrado.
- **Q16 — El tiempo máximo de cada llamada (15 s)** es una constante de la composición (`SOURCE_TIMEOUT_MS`), no una variable: con 41 llamadas cabe en 900 s. Recomendación: constante; si la dirección lo quiere configurable, es una variable más con techo.

## 15. Revisión de la PR #106, ronda 1: decisiones de la dirección y arreglos (2026-09-27)

Revisiones sobre `eab6ae9`: fuentes y S3 (comentario 5859690207) y `push` y guardianes (comentario 5859773419). Decisiones de la dirección, del mismo día. Cada arreglo de lógica lleva su test visto en rojo y su mutante, que sobrevive antes (es el código anterior, o el revisor lo vio sobrevivir) y muere después.

### 15.1 Decisiones

**Fuentes y S3**

- **B1 (a).** El paso 2 de la activación del BCE se condiciona al ETag del fichero leído junto al manifiesto, no a un `get` nuevo. Test con el entrelazado del revisor (A y B verifican, A escribe, B escribe…): B falla sin mezclar nada. Además se corrigen la cabecera y el plan.
- **B1 (b).** Autorreparación: si `recover()` da `damaged`, la tarea del BCE no se queda parada. Reconstruye el histórico entero desde el ZIP oficial del BCE, que es la fuente de verdad y es reproducible, con una generación nueva escrita con escrituras condicionales, y deja el hallazgo `ecb_history_rebuilt`. Test con el estado mezclado del revisor. También se corrigen la cabecera y el plan.
- **N1.** `parseJobsConfig` exige que `ATLAS_DATA_BUCKET` empiece por `atlas-<ATLAS_ENV>-`, y la fuente simulada exige `ATLAS_ENV=dev` y un bucket `atlas-dev-`. Con su test.
- **N2.** Se resuelve en E3: cuando la consola baje los precios de la nube, su presupuesto por defecto pasa a ser el sobrante del plan (2 y 2), salvo que `config.json` diga otra cosa. Anotado en E3 y para su revisión.
- **N3.** Para E4: quien use `manifest.previous` verifica el SHA.

**`push` y guardianes**

- **B1.** `symbolsPushPlan` rechaza cualquier clave de nivel superior que no sea `symbols_format` ni `assets`, con un código nuevo que nombra la clave y nunca su valor. El mismo rechazo se aplica en `parseSymbols`, al leer el fichero en la nube y en la API. Test con un centinela.
- **N1.** Un especificador que empieza por `#` falla cerrado en `resolveAcross` (`<unresolved #…>`), y un test prohíbe `imports` en los `package.json` del producto. Tiene que matar M5.
- **N2.** Un test de conducta en `daily.test.ts` comprueba que, con un `symbols.json` legible en el S3 falso, ninguna escritura nombra `prices/symbols.json`. Tiene que matar M7.
- **N3.** Q15 era falsa: se corrige §14.9.
- **N4.** `Object.create(null)` y `Object.hasOwn` en `parseSymbols` y en la diferencia. Mutantes con `constructor` y `__proto__`.
- **N5.** `push` imprime el ETag y la versión que sustituye, y el contrato de IAM añade `s3:GetObjectVersion` al rol de administración.

### 15.2 Mapa hallazgo → commit

| Hallazgo | Commit | Qué |
|---|---|---|
| S3 B1 (a) | `6f3f7fd` | `activate` lee **antes de escribir nada**, junto al manifiesto, el fichero en vigor (verificado contra el manifiesto), `previous/` y el objeto del paso 2 (el mismo fichero en vigor si la fuente no cambia), y condiciona cada escritura a **esa** lectura. Test del entrelazado del revisor con dos almacenes sobre el mismo bucket y pausas en las lecturas y las escrituras |
| S3 B1 (b) | `460fc2e`, `0b0bb03`, `287b8e8` | `rebuildEcbHistory` en el dominio: solo desde el ZIP (desde la API, `zip_unavailable` y nada escrito), un ZIP que no se lee no escribe nada. `S3EcbHistoryStore.rebuild()`: se niega si el histórico no está dañado; escribe el fichero y después un manifiesto nuevo sin `previous` y con los `rejected` que se leían, cada uno condicionado a lo leído. La tarea del BCE reconstruye cuando `recover()` da `damaged`, con el resultado `ecb_history_rebuilt` y su hallazgo, y el correo con su frase. Cabecera del almacén y plan §7.1 corregidos |
| S3 N1 | `647e3ab` | `not_of_the_environment`: el bucket empieza por `atlas-<ATLAS_ENV>-` en todas las familias. La simulada ya exigía `ATLAS_ENV=dev`, y con esta regla solo escribe en un bucket `atlas-dev-` (no hace falta una segunda comprobación, que no se podría alcanzar). `contracts/ssm-and-config.md` al día |
| S3 N2, N3 | `a09e3e2` | `tasks.md`: N2 en E3 y en su revisión; N3 en E4 |
| `push` B1 y N4 | `b780823`, `8f2c7bf`, `06c6785` | `parseSymbols` rechaza una clave de primer nivel desconocida con `symbols_file_unknown_key` (`details.key`, el nombre recortado a 64 caracteres; nunca el valor), después de decir un formato más nuevo; `assets` sin prototipo, y la diferencia con `Object.hasOwn`. La API no sirve un `symbols.json` con una clave desconocida (`404 not_found`, `reason: "unknown_key"`). La tarea de precios falla sin descargar nada, y `push` se niega; los dos, con un centinela que no aparece en ninguna salida, registro ni log. La consola y la web traducen el código nuevo |
| `push` N1 | `2c9d5e3` | `resolveAcross` da `<unresolved #…>` a un alias de `imports`; un test comprueba que ningún `package.json` del producto (raíz, `apps/*`, `packages/*`) tiene `imports` |
| `push` N2 | `67a842c` | En `daily.test.ts`, con respuestas 200, 401 y 503, ninguna escritura condicional nombra `prices/symbols.json`, y el objeto sigue igual |
| `push` N3 | `a09e3e2` | §14.9, Q15, corregida |
| `push` N5 | `af66e81`, `bf7b946` | `StoredObject.versionId` (lo da `GetObject` en un bucket versionado); `push` dice «Sustituye el objeto con ETag … , versión …, que queda en el historial de versiones del bucket»; `contracts/iam-permissions.md` §8 añade `s3:GetObjectVersion` |

### 15.3 Cómo se vio cada test en rojo

- **S3 B1 (a)**: el test del entrelazado contra el `activate` de `9e28eea`: `EcbHistoryDamaged`, el estado mezclado del revisor (`016-e2r-red-b1a.log`). Para verlo en rojo, la pausa de B tuvo que ir **en las lecturas**: en la primera versión del test, la pausa estaba antes de las escrituras, B leía `previous/` antes de que A escribiera y fallaba en el paso 1, así que el test pasaba también con el código viejo.
- **S3 B1 (b)**: los tests de `apps/jobs` contra la tarea anterior: el de la reconstrucción en rojo; el de «solo la API» pasa con los dos códigos, porque el viejo tampoco escribía (`016-e2r-red-b1b.log`). Los tests del dominio y del almacén se escribieron con el código nuevo; su rojo es la mutación.
- **S3 N1**: los casos nuevos de `prices-config.test.ts` y `event-config.test.ts`: 2 tests en rojo (`016-e2r-red-n1.log`).
- **`push` B1 y N4**: 5 tests del dominio en rojo contra `9e28eea` (`016-e2r-red-pb1.log`), y el de la API (`016-e2r-red-api.log`).
- **`push` N1**: el test del alias `#`, en rojo contra el grafo anterior (`016-e2r-red-gn1.log`).
- **`push` N5**: el test de `push` que espera el ETag y la versión, en rojo antes de cambiar la orden.

### 15.4 Mutación (lotes `016-e2r-a.json` y `016-e2r-b.json`, uno a uno tras la puerta de memoria)

| Id | Mutante | Antes | Después |
|---|---|---|---|
| R-B1a | el paso 2 condicionado a una lectura hecha justo antes de escribir (la conducta de `9e28eea`) | era el código; el revisor lo vio pasar el test del mutante 20 | KILLED por `s3-daily.test.ts` (el entrelazado) |
| R-B1b1 | la tarea del BCE no reconstruye un histórico dañado | era la conducta | KILLED por `daily.test.ts` |
| R-B1b2 | se reconstruye desde la API | — | KILLED por `update-history.test.ts` y `daily.test.ts` |
| R-B1b3 | el almacén reconstruye un histórico que no está dañado | — | KILLED por `s3-daily.test.ts` |
| R-N1 | un bucket de otro entorno aceptado | era la conducta | KILLED por `prices-config.test.ts` y `event-config.test.ts` |
| R-PB1a | una clave de primer nivel desconocida aceptada en todas partes | era la conducta (sonda del revisor) | KILLED por los tests del dominio y de `push` |
| R-PB1b | la API sirve un `symbols.json` con una clave desconocida | era la conducta | KILLED por `apps/api/test/sync.test.ts` |
| R-N4a | `assets` sobre un objeto con prototipo | era la conducta (sondas `constructor` y `__proto__` del revisor) | KILLED por `symbols.test.ts` |
| R-N4b | la diferencia lee propiedades heredadas como activos | era la conducta | KILLED por `symbols-push.test.ts` |
| R-GN1a | M5 del revisor: un alias `#daily` en `apps/api/package.json` que alcanza los escritores diarios | sobrevivía (revisión) | KILLED por `jobs-access.test.ts` (tres reglas del grafo, que ahora ven `<unresolved #daily>`, y la de `imports`) |
| R-GN1b | el grafo resuelve un alias `#` a nada | era la conducta | KILLED por `jobs-access.test.ts` |
| R-GN2 | M7 del revisor: la tarea escribe `symbols.json` con la clave en otra línea | sobrevivía (revisión) | KILLED por `daily.test.ts` («never writes symbols.json, whatever the run does») |
| R-N5 | `push` no dice la versión que sustituye | era la conducta | KILLED por `prices-push.test.ts` |

13 de 13 muertos.

### 15.5 Lo que se volvió a mirar alrededor

- **Los dos entrelazados del BCE que las condiciones no descartan sin cerrojo** *(corregido en la ronda 2, R2-N2; antes hablaba de uno solo)*. S3 no permite condicionar una escritura al ETag de **otro** objeto, así que quedan dos casos:
  - **(1)** Dos ejecuciones de fuentes distintas (una del ZIP y otra de la API) escriben a la vez cada una el nombre del fichero de la otra. Leer al principio el objeto del paso 2 lo acota, pero el fichero de otro nombre no se puede verificar contra el manifiesto.
  - **(2)** Una activación está entre sus pasos 2 y 3 cuando otra ejecución hace `recover()`, ve el manifiesto viejo con el fichero nuevo y lo deshace. La primera escribe después su manifiesto sobre el manifiesto que el deshacer no tocó, y queda su manifiesto con el fichero anterior.

  Los dos acaban **dañados** y nunca se leen como si cuadraran. Los resuelven dos cosas: la **reconstrucción de la ejecución siguiente** (comparada con la última generación legible, R2-N1) y, antes que nada, la **concurrencia 1 de la función** en la 017, que impide que dos ejecuciones coincidan. La cabecera del almacén y el plan §7.1 lo dicen así.
- **Entre `active()` y `activate()`** *(cerrado en E3, `f1bf870`)*: `activate` y `keepRejected` escriben solo sobre el manifiesto que leyó `active()`; si otra ejecución activó en medio, `EcbStoreConflict`.
- **Un formato de `symbols.json` más nuevo con claves nuevas** se sigue diciendo como más nuevo, antes de mirar las claves: la comprobación de claves va después.
- **La web** lee `prices/symbols.json` con el mismo `parseSymbols`, así que también rechaza una clave ajena, con su frase.
- **Arreglo que salió de la tubería** (`a3ddb26`): el texto web de `symbols_file_unknown_key` decía la clave, y el test de jerga de la web (`no-jargon.test.tsx`), que prueba cada plantilla con identificadores de muestra, lo cazó. La web dice ahora «un dato que no es suyo» sin nombrarlo; la consola sí nombra la clave, como pidió la dirección.

### 15.6 Tubería

`016-pipeline.sh` sobre `a3ddb26` (cada paso tras la puerta de memoria, nada en paralelo):

```
lint 0 5s
typecheck 0 1s
cov1-domain 0 271s   (1.709 tests; dominio al 100 %: sentencias 8.957, ramas 5.538, funciones 2.018, líneas 8.523)
cov1-others 1 786s   (1.721 de 1.722: el fallo intermitente de Q17, fuera de la 016)
cov2-domain 0 269s
cov2-others 0 520s   (1.722 tests)
build 0 11s          (lambda.zip 1.443.799 bytes; jobs.zip 1.631.638 bytes, 1.408 entradas)
```

Una tercera pasada de `test:others` sobre el mismo commit: 0, 1.722 tests (`016-pipe-cov3-others.log`). El paquete web, medido en bytes: arranque 74.177 (antes 74.194) y total 301.906 (antes 301.825; +81 por el mensaje nuevo y la comprobación de claves, que viajan en trozos perezosos), por debajo de sus techos (74.214 y 302.101). `tests/fixtures` sin cambios; ningún gemelo `.js`. Tests de los guardianes: `architecture` 51, `api-access` 28, `jobs-access` 12 → 14 (el alias `#` y los `imports`), `jobs-package` 3, `messages` 11. Ninguno baja.

### 15.7 Pregunta nueva

- **Q17 — Un fallo intermitente de la 015 en `apps/cli/test/admin/admin.test.ts`** («asks for the name of the environment…», línea 333). `consoleLogin` crea el `device_id` con bytes aleatorios en base64url; si empieza por `--` (1 de cada 4.096), el analizador de argumentos lo toma por una opción y la orden sale con 64. Pasó en la primera pasada de esta tubería y no en las otras dos. No es de la 016 y no lo he tocado. Es también un defecto de uso: `atlas admin forget-device` con un id así necesita `--` antes del id. Recomendación: un `fix/` aparte que haga deterministas los ids del arnés de la API y documente `--` en el mensaje de uso, o que la orden acepte `--device <id>`.

### 15.8 La CI y `develop`

La CI de `8dff5e8` salió en rojo en `build`: la CI construye la PR **fusionada con `develop`**, y `develop` ya traía la PR #105 (020), que dejó el techo del total en su medida + 256 (302.894). Con lo de E2 encima, el total medido es 302.935 (+297 sobre los 302.638 de la PR #105), 41 bytes por encima. Todo lo añadido es perezoso: el lector más estricto de `symbols.json` y la frase de `symbols_file_unknown_key`. El arranque no se mueve (75.011, por debajo de 75.039).

- `aadb6b3` trae `develop` a la rama (sin conflictos) y `6fbc326` sube el techo del total a **303.191 = medida + 256**, en un commit propio y **dentro de la autorización** (310.500), como hace la 020. No se toca el techo del arranque ni ninguna autorización.
- **Tubería completa sobre `6fbc326`**: lint 0, typecheck 0, cobertura del dominio 0 dos veces (100 %: sentencias 8.957, ramas 5.538, funciones 2.018, líneas 8.523; 1.709 tests), resto de proyectos 0 dos veces (1.798 tests, con los de la 020), build 0 (`lambda.zip` 1.443.799 bytes; `jobs.zip` 1.631.638 bytes). `tests/fixtures` sin cambios. Guardianes: `architecture` 51, `api-access` 28, `jobs-access` 14, `jobs-package` 3, `messages` 11.

### 15.9 Congelado

**Congelada la ronda 1 en el commit que añade esta sección**, cuyo SHA dice el mapa de la PR. Código en `6fbc326`. No se empuja nada más hasta la palabra de la dirección.

## 16. Revisión de la PR #106, ronda 2: decisiones de la dirección y arreglos (2026-09-28)

Revisión sobre `fcff746` (comentario 5860915040). Decisiones de la dirección, del mismo día. Cada punto lleva su test, visto antes en rojo, y su mutante, que antes sobrevive (es el código anterior, o el revisor lo vio sobrevivir) y después muere.

### 16.1 Decisiones

- **R2-B1.** `parseSymbols` y el guardián de la API usan `repeatsKey` (de `schema/json-keys.ts`) y rechazan cualquier clave repetida, a cualquier nivel. Se hace lo mismo con `prices/config.json` y con cualquier otro fichero JSON que se lea de forma estricta en la nube o en `push`. El código de error nombra la clave y nunca el valor. Test con un centinela: `assets` repetido, `symbols_format` repetido, `"assets"` escapado y un campo repetido dentro de una entrada.
- **R2-N1.** La reconstrucción aplica la comparación de ADR-0029, punto 2, contra la última generación legible que exista: el fichero activo si se puede leer y, si no, `previous`.
  - Si la comparación la rechaza, no activa nada y deja `ecb_history_damaged` con un aviso que pide intervención.
  - Si no queda nada legible, acepta y deja además `ecb_rebuilt_unverified`.
  - La excepción se documenta en una nota fechada de ADR-0029 y en `data-schema`.
- **R2-N2.** La cabecera del almacén y §15.5 describen los dos entrelazados y cómo se resuelven: la reconstrucción del día siguiente y la concurrencia 1 de la 017.
- **R2-N3.** El grafo de los guardianes resuelve todas las condiciones de `exports` (`types`, `import`, `default`, `require`) y falla si apuntan a módulos distintos. Un test prohíbe exportaciones condicionales con destinos diferentes en los `package.json` del producto. Tiene que matar el mutante `./innocent`.

### 16.2 Mapa hallazgo → commit

| Hallazgo | Commit | Qué |
|---|---|---|
| R2-B1 | `cb6a324`, `8b5b329`, `419cf0c` | **Dominio:** `repeatedKey(text)` devuelve la primera clave repetida (decodificada, recortada a 64) y `repeatsKey` pasa a ser `repeatedKey(text) !== undefined`. `repeatedKeyError(file, key, line?)` da el código nuevo **`json_key_repeated`**, con `file`, `key` y, en un JSONL, `line`; nunca el valor. Lo usan los cuatro lectores de `prices/`: `symbols.json`, `config.json`, `_status.json` y cada línea de `<asset_id>.jsonl`. En `symbols.json` se comprueba antes que el formato más nuevo y que la clave desconocida. `unservableSymbols(text)` (`repeated_key` o `unknown_key`) es la regla que usa la API.<br>**API:** responde `404 not_found` con `reason: "repeated_key"`.<br>**Consola:** nombra el fichero y la clave.<br>**Web:** lo dice sin nombrarlos (test de jerga).<br>**Tests con centinela:** los cuatro casos del revisor en el lector, en `push` (local rechazado y remoto tratado como ilegible) y en la API; la tarea de la nube falla sin descargar; `push` se niega sin enseñar el valor |
| R2-N1 | `fd7c00e`, `ae98823`, `b6aea74`, `4c72f02` | **`rebuildEcbHistory`:** pide `generations()` al almacén (el fichero en vigor tal como está y después `previous/`; sin manifiesto legible, los dos nombres de los dos) y compara con la primera que se lee (`checkHistoryUpdate`).<br>**Si la rechaza:** `rejected`, nada escrito, `ecb_history_damaged` con `counts.conflicts` y un correo que dice «Hace falta intervenir».<br>**Si no queda nada legible:** `rebuilt` con `verified: false` y el hallazgo `ecb_rebuilt_unverified`, con su correo.<br>**Documentos:** nota fechada en ADR-0029 («Nota del 2026-09-28»), la fila de `reference/ecb/` de `docs/data-schema.md` y el plan §7.1. Son los primeros cambios de esta feature en `docs/`, que por regla no toco: los pidió la dirección expresamente en esta ronda |
| R2-N2 | `ae98823` (cabecera), este commit (§15.5) | La cabecera del almacén y el plan §7.1 describen **los dos entrelazados** que las condiciones no descartan sin cerrojo, porque S3 no condiciona una escritura al ETag de otro objeto: (1) dos fuentes que escriben a la vez el nombre de la otra; (2) un `recover()` entre los pasos 2 y 3 de otra activación. También dicen cómo se resuelven: acaban dañados y nunca se leen como si cuadraran; los arregla la reconstrucción de la ejecución siguiente y, antes, la concurrencia 1 de la 017 |
| R2-N3 | `f7b53c7` | **`exportsOf` (`tests/support/source-graph.ts`):** resuelve todas las condiciones de cada exportación, a cualquier profundidad, y falla si nombran módulos distintos. El test de arquitectura usaba dos lectores propios que solo leían `types`; ahora usa el compartido.<br>**Tests nuevos en `jobs-access`:** ningún `package.json` del producto tiene una exportación con destinos distintos, y el lector se niega a leer uno así (con el `./innocent` del revisor) y lee uno coherente |

Un detalle, dicho: `data-schema.md` dice además en la fila de `symbols.json` que una clave desconocida o repetida lo hace ilegible, y que la API no lo sirve. Es la consecuencia de la ronda 1 (B1) y de R2-B1, y la escribí en el mismo commit que la nota de ADR-0029.

### 16.3 Cómo se vio cada test en rojo

- **R2-B1**:
  - **Dominio:** los 6 tests de `repeated-keys.test.ts` contra un `repeatedKey` que nunca encuentra nada (`016-e2r2-red-b1.log`).
  - **Aplicaciones:** los de la API, `push` y la tarea, contra los lectores de `fcff746`, que dejaban pasar las cuatro sondas (`016-e2r2-red-b1-apps.log`): 3 en rojo.
- **R2-N1**: los tests del dominio y de la tarea contra el `rebuildEcbHistory` de la ronda 1, que no comparaba (`016-e2r2-red-n1.log`): 5 en rojo. Entre ellos está «rebuilds…», que ahora espera `verified`.
- **R2-N3**: «refuses to read a package whose conditions name different modules», contra el lector que solo leía `types` (`016-e2r2-red-n3.log`).

### 16.4 Mutación (lotes `016-e2r2-a.json` y `016-e2r2-b.json`, uno a uno tras la puerta de memoria)

| Id | Mutante | Antes | Después |
|---|---|---|---|
| R2-B1a | `symbols.json` se lee con una clave repetida | era la conducta (sondas del revisor) | KILLED por los tests de `quotes`, de `push` y de la tarea |
| R2-B1b | la API sirve un `symbols.json` con una clave repetida | era la conducta | KILLED por `apps/api/test/sync.test.ts` y `repeated-keys.test.ts` |
| R2-B1c | `config.json` con una clave repetida | era la conducta | KILLED |
| R2-B1d | `_status.json` con una clave repetida | era la conducta | KILLED |
| R2-B1e | una línea de cierres con una clave repetida | era la conducta | KILLED |
| R2-B1f | la negativa lleva el texto de alrededor (el valor), no la clave | — | KILLED por el centinela de `repeated-keys.test.ts` |
| R2-N1a | la reconstrucción activa un ZIP que contradice la última generación legible | era la conducta (sonda del revisor) | KILLED por `update-history.test.ts` y `daily.test.ts` |
| R2-N1b | la reconstrucción no compara con nada (la conducta de la ronda 1) | era la conducta | KILLED |
| R2-N1c | una reconstrucción sin comparar se dice comparada | — | KILLED |
| R2-N1d | solo se compara con el fichero en vigor, nunca con `previous/` | — | KILLED por `s3-daily.test.ts` |
| R2-N3a | el `./innocent` del revisor: `types` e `import` con módulos distintos, importado por la API | sobrevivía (revisión) | KILLED por `jobs-access.test.ts` (el grafo falla cerrado y la regla de `exports`) |
| R2-N3b | el grafo vuelve a leer solo `types` | era la conducta | KILLED |

12 de 12 muertos.

### 16.5 Tubería, `develop` y el paquete web

- **La primera tubería de la ronda, sobre `249e146`, falló en `build`.**
  - El arranque subía 77 bytes, hasta 75.088, por encima de su techo de 75.039. El error nuevo vivía en `schema/json-keys.ts`, que viaja en el arranque de la web con el lector del libro.
  - `d6c6850` lo lleva a `quotes/repeated-key.ts`, que es perezoso. El arranque vuelve a 75.012, 1 byte sobre los 75.011 de la ronda 1, y el techo del arranque **no se toca**.
- **`79e7575` trae `develop` a la rama**, con la PR #107 (`fix/cli-dash-ids`, que resuelve Q17).
  - Hubo conflictos en el texto de uso de `atlas admin`, en `apps/cli/src/main.ts` y `commands/admin.ts`.
  - Se resolvieron con las dos cosas: `forget-device [--] <id> | --device <id>` y `prices push`.
- **`728d3f6` sube el techo del total** a **303.451 = medida (303.195) + 256**, en un commit propio y dentro de la autorización (310.500). Todo el aumento es perezoso: el rechazo de las claves repetidas y su frase.
- **Tubería completa sobre `728d3f6`: todo en 0.**

  ```
  lint 0, typecheck 0
  cov1-domain 0   (1.718 tests; dominio al 100 %: sentencias 8.991, ramas 5.560, funciones 2.023, líneas 8.556)
  cov1-others 0   (1.812 tests)
  cov2-domain 0
  cov2-others 0   (1.812 tests)
  build 0         (lambda.zip 1.444.049 bytes; jobs.zip 1.635.222 bytes, 1.409 entradas)
  ```

  `tests/fixtures` sin cambios. Tests de los guardianes: `architecture` 51, `api-access` 28, `jobs-access` 14 → 16 (las exportaciones condicionales), `jobs-package` 3, `messages` 11. Ninguno baja.
- **Q17 queda resuelta en `develop`** con la PR #107.

### 16.6 Congelado

**Congelada la ronda 2 en el commit que añade esta sección**, cuyo SHA dice el mapa de la PR. Código en `728d3f6`. No se empuja nada más hasta la palabra de la dirección.

## 17. E3: los dispositivos beben de la nube (2026-09-28)

E2 fusionada en `develop` (PR #106, `e498a07`; la ronda 3 converge, comentario 5861463035). La rama la trae con `2d186a7`.

### 17.1 Lo pendiente de E2

- **N2 de §15, el presupuesto de la consola que comparte los planes con la nube.** `parsePriceConfig(text, { sharedWithCloud })`: con la opción, el presupuesto por defecto es `SHARED_WITH_CLOUD_DAILY_CALLS` (2 de EODHD y 2 de Alpha Vantage), y lo que diga `daily_calls` en `config.json` manda sobre él, fuente a fuente. La consola lo aplica en toda carpeta **que se sincronizó alguna vez** (existe `sync/`): con `--from-sources`, cuando la nube aún no tiene precios, y en `atlas prices status`. `updatePrices({ sharedWithCloud })` lo pasa a la cascada.
- **La observación de la ronda 3 (ficheros de cierres ilegibles).** El registro de `prices_update` cuenta `unreadable`, y `pricesFindings` deja `prices_file_unreadable` con el recuento de ficheros, con su correo («N ficheros de cierres de la nube no se leen…»).
  - **Cómo lo he interpretado:** el asunto es **`prices`**, un asunto opaco de la lista cerrada (`PRODUCER_FINDINGS`), y el correo dice solo cuántos. El `asset_id` no está en ninguna lista cerrada, así que nunca va ni en el asunto ni en el correo. Quién es cada uno lo dice `atlas prices status`.
  - Si la dirección quería un asunto por activo con un identificador opaco (un *hash*, por ejemplo), es Q18.
- **§15.5, la ventana entre `active()` y `activate()`.** `S3EcbHistoryStore` recuerda el ETag del manifiesto que leyó `active()` (o que no había ninguno), y `activate` y `keepRejected` se niegan (`EcbStoreConflict`) si el manifiesto que leen es otro.
- **El procedimiento**, en `specs/016-scheduled-jobs/runbooks/ecb-history-in-the-cloud.md`: restaurar una generación buena desde las versiones del bucket (primero el fichero y después su manifiesto) o retirar una que miente (marca de borrado sobre el manifiesto, para que la ejecución siguiente descargue como la primera vez), con el rol de administración.
  - Retirar necesita `s3:DeleteObject` sobre `reference/ecb/manifest.json` en ese rol, **que el contrato de IAM no da todavía**. Es una propuesta para la 017, y el procedimiento lo dice.

### 17.2 Qué hay en la rama

| Commit | Qué |
|---|---|
| `3ae71f3`, `87698ef` | `prices_file_unreadable`: el hallazgo con su asunto opaco y su correo, y el recuento en el registro de `prices_update` |
| `f1bf870` | El almacén del BCE escribe solo sobre el manifiesto que leyó `active()` (§15.5) |
| `c44d2bc` | El procedimiento de restaurar o retirar una generación del histórico del BCE de la nube |
| `287130b`, `63b3f8c` | Bloque 3: `mergeSettings` deja fuera `notification_email` en toda foto nueva, venga de lo que hay en vigor o del cambio, en la web y en la consola; el cargador lo sigue leyendo; Ajustes deja de ofrecerlo. El *golden* y el generador sintético no cambian |
| `afb6ee2`, `7f569da`, `8bac850` | Bloque 1, dominio: `quotes/cloud.ts` (`cloudLinesToAppend` con las reglas de la 013, `changedPriceFiles`, `assetOfPriceFile` por ida y vuelta, `prices/_cloud.json` estricto) y el presupuesto compartido (N2). **`7f569da` no compila por sí solo**: un renombrado a medias del ayudante que el guardián de mensajes confundía con un código, arreglado en el siguiente, `8bac850`, y empujado antes de verlo. Lo digo como fallo de proceso: el empuje se hizo sin pasar `typecheck` |
| `c8b9a5c`, `2465a32` | `parseReferenceIndex` en el dominio y el cliente de los datos de referencia (`@atlas/adapters/reference-http`): el índice y un fichero, con `If-None-Match` sobre la versión que se tiene; la credencial inyectada, como el remoto |
| `5d6bfdb`, `6948956` | Bloque 1, consola: `FilePriceStore` guarda `prices/_cloud.json` bajo el mismo cerrojo. `atlas prices update` en una carpeta sincronizada baja de la API (la red antes del cerrojo; comparar y escribir dentro) y no llama a ninguna fuente; `--from-sources` las llama, diciendo que gasta el cupo compartido; `atlas prices status` dice la procedencia y cuándo |
| `45173e3`, `2a2ca46` | La lectura estricta del manifiesto del BCE pasa a `ecb/manifest.ts`, con su propia lectura estricta, porque la web la usa y nunca alcanza el código de las tareas. La puerta de las tareas la sigue exportando |
| `7ce3179` | El techo del total, medido + 256, **antes** del commit que lo necesita (§17.4) |
| `d92fbcf`, `b3cb563` | Bloque 2, web: `apps/web/src/ecb/cloud.ts` y la tarjeta del BCE (§17.3) |
| `bbfb5ea` | Test: una línea local escrita a mano deja ver cualquier reescritura (el mutante 23b) |
| `7fafbb5` | El cliente de los datos de referencia sale de `adapters/src/sync/` y la web deja de importar la puerta de la sincronización (lo paró la primera tubería, §17.3) |
| `45806e7` | Test: una carpeta cuya sesión no sirve nunca cae en las fuentes (el superviviente de §17.6) |

### 17.3 Desviaciones y decisiones mías, dichas

- **El móvil no baja los precios** (§8.1 P7 y P13, Q8). Lo que queda de la autorización del total para la feature no llega para ellos (§17.4), y solo el BCE es obligatorio. **Paro en eso, como mandan P7 y Q8**, y lo digo.
- **La tarjeta del BCE baja de la nube al abrirse, con sesión**, y con el botón «Bajar de la nube». Nada al arrancar ni con temporizador.
  - La descarga viaja en la sección de Ajustes, que ya es perezosa. Lo pesado (el BCE, el almacén del navegador, el histórico de la web) se carga solo cuando corre, para no tocar el arranque ni partir la sección en dos (§17.4).
  - La tarjeta no usa `onMount` (ADR-0017): lo abre un recurso, como la tarjeta de la sesión.
- **Lo que baja de la nube se guarda como la copia importada**, en la misma clave, marcado `origin: "cloud"` y con la versión del manifiesto. Por eso sustituye a una copia importada a mano. La regla de ADR-0029, punto 2, se aplica igual: una que cambia un tipo ya publicado no se guarda, y se dice.
- **Una carpeta sincronizada cuya nube aún no tiene precios** llama a las fuentes, diciéndolo, con el presupuesto compartido. **Una carpeta sincronizada cuya sesión no sirve** (`sync_credential_missing` y demás) **no cae en las fuentes**: dice por qué y sale con 1, salvo con `--from-sources`.
- **Lo que la consola guarda de la nube**, `prices/_cloud.json`, es un fichero nuevo del almacén local. Nunca se sirve (la regla de nombres de la API lo niega) ni se sube. Tiene su código de error (`invalid_cloud_pull`), que solo dice la consola.
- **El cliente de los datos de referencia vive en `packages/adapters/src/reference/`**, con su propio *subpath* y sin condiciones de `exports` distintas (R2-N3).
  - Lo escribí primero en `sync/`, junto al del remoto. La primera tubería lo paró: los guardianes de la 015 solo dejan a la web alcanzar `adapters/src/sync/` y la puerta de la sincronización por su motor.
  - `7fafbb5` lo saca de `sync/`: solo lee, y no configura nada. Además, la web reconoce el fallo por la clase base, `DomainError`, sin importar la puerta de la sincronización.
- **`alert_channels` no se implementa** (§8.1 P17). La redacción que propongo está en §6.

### 17.4 El paquete web

Medido en bytes con la copia de `check-bundle.mjs` que imprime los totales, sobre `develop` (`e498a07`: arranque 75.012, total 303.195) y sobre la rama.

| Medida | `develop` | E3 | Diferencia |
|---|---|---|---|
| Arranque | 75.012 | 75.025 | **+13** (techo 75.039, no se toca) |
| Total | 303.195 | 304.836 | +1.641 (techo subido a 305.002 en `7ce3179`, dentro de la autorización de 310.500) |

- **El arranque no es +0**, como pide §8.1 P13: son +13 bytes.
  - **+14 son de la regla de P12 en el dominio**: `mergeSettings` deja fuera `notification_email`, y ese módulo está en el arranque.
  - **El resto es ruido de los nombres de los trozos** (sus *hashes*): entre construcciones de la rama osciló entre +13 y +27 sin cambiar código del arranque.
  - Lo intenté reducir. Con eso, **no se sube el techo del arranque**, que queda con 14 bytes de margen. El próximo cambio de nombres de trozos puede comérselo. Es Q19.
- **El total, por trozos** (gzip):
  - la sección de Ajustes, +1.090: la descarga, el cliente y la tarjeta;
  - el almacén de la copia, que pasa a un trozo propio, +251;
  - la lectura estricta del manifiesto en el trozo del BCE, +208;
  - ruido de los nombres en otros trozos.
- **Cuánto queda de P13.** La autorización de la feature son 3.072 bytes sobre el techo de partida. Hay dos lecturas:
  - **Contando lo que añadió la 016**: E2 +557 (302.638 → 303.195) y E3 +1.641, en total **2.198 de 3.072**; quedan 874.
  - **Contando el absoluto de §4** (304.568): el total ya lo pasa por 268. La razón es que la 020 subió el total unos 1.100 bytes en medio, con su propia autorización.
  - Con cualquiera de las dos, **los precios del móvil (1,2-1,8 KB, plan §12) no caben**. Lo que quede para las mejoras visuales lo decide la dirección con la lectura que elija (Q19).

### 17.5 Cómo se vio cada test en rojo

- **Ficheros ilegibles**: los de `findings.test.ts` y `notice-mail.test.ts` contra el dominio de `2d186a7` (3 en rojo, `016-e3-red-unreadable.log`), y el de `daily.test.ts` contra la tarea anterior (el registro sin `unreadable`).
- **§15.5**: el test de «solo sobre el manifiesto que leyó `active()`», en rojo contra el almacén de `2d186a7` (`016-e3-red-etag.log`).
- **`notification_email`**: 4 en rojo, en el dominio, la consola y la web (`016-e3-red-email.log`).
- **La consola y la nube**: los 9 tests de `apps/cli/test/prices/cloud.test.ts`, en rojo contra la consola anterior, que llamaba a las fuentes (`016-e3-red-cloud.log`). El de la sesión que no sirve se escribió después, porque su mutante sobrevivió (§17.6).
- **La web y la nube**: los tests de `ecb-cloud.test.tsx` se escribieron con el módulo. Su rojo es la mutación (25a, 25b, 27).

### 17.6 Mutación (lotes `016-e3-a.json`, `-b.json` y `-c.json`, uno a uno tras la puerta de memoria)

| Id | Mutante (§6 del encargo) | Test que lo mata | Veredicto |
|---|---|---|---|
| E3-22 | una carpeta sincronizada llama a las fuentes sin `--from-sources` [22] | `apps/cli/test/prices/cloud.test.ts` | KILLED |
| E3-23a | cada línea de la nube se añade, sin las reglas de la 013 [23] | `domain/test/quotes/cloud.test.ts`, `cloud.test.ts` (consola) | KILLED |
| E3-23b | el fichero local se reescribe en vez de añadirle [23] | `cloud.test.ts` (consola), con una línea escrita a mano | KILLED |
| E3-24 | el índice se baja con el cerrojo tomado [24] | `cloud.test.ts` (consola) | KILLED |
| E3-25a | la web usa un fichero que no cuadra con su manifiesto [25] | `apps/web/test/ecb-cloud.test.tsx` | KILLED |
| E3-25b | la web baja el histórico al arrancar [25] | `ecb-cloud.test.tsx` (quién lo importa) | KILLED |
| E3-26a | Ajustes vuelve a ofrecer `notification_email` [26] | `settings-text.test.tsx` | KILLED |
| E3-26b | una foto nueva sigue llevando `notification_email`, desde la web y desde la consola [26] | `settings.test.ts` (dominio y consola), `settings-text.test.tsx` | KILLED |
| E3-26c | el cargador rechaza una línea antigua que lo lleva [26] | `settings.test.ts` (dominio) | KILLED |
| E3-27 | un módulo nuevo de la web en el arranque [27] | `check-bundle.mjs` («El bundle no cumple…») | KILLED |
| E3-N2 | una carpeta sincronizada gasta los planes enteros | `cloud.test.ts` (consola) | KILLED |
| E3-R3a | los ficheros ilegibles fuera del registro | `apps/jobs/test/daily.test.ts` | KILLED |
| E3-R3b | los ficheros ilegibles nunca llegan al correo | `domain/test/jobs/findings.test.ts` | KILLED |
| E3-1555 | `activate` sobre un manifiesto distinto del que leyó `active()` | `adapters/test/aws/s3-daily.test.ts` | KILLED |
| E3-ver | se vuelve a pedir cada fichero de la nube, sea cual sea su versión | `domain/test/quotes/cloud.test.ts`, `cloud.test.ts` (consola) | KILLED |
| E3-refused | una carpeta cuya sesión no sirve cae en las fuentes | — | **SURVIVED**: no había test. Añadido en `45806e7` |
| E3-refused-2 | el mismo, con el test nuevo | `cloud.test.ts` (consola) | KILLED |

De 16 mutantes, 15 muertos a la primera. El superviviente destapó un caso sin test, que ya lo tiene y ahora lo mata.

### 17.7 Autocomprobación de §5, familia a familia

| Familia | Qué miré | Con qué | Resultado |
|---|---|---|---|
| 1. Guardianes eludibles | Que los guardianes de la 015 sigan en pie (la primera tubería los vio caer y se arregló el código, no el guardián: §17.3); que la descarga de la web no se alcance desde el arranque; que la web no alcance el código de las tareas al leer el manifiesto; que ninguna exportación nueva tenga condiciones distintas | `LAZY_ONLY` con `/src/ecb/` (mata E3-27), `jobs-access` (el manifiesto pasa a `ecb/` porque la web no puede alcanzar `domain/src/jobs/`), el test de exportaciones de R2-N3 sobre `./reference-http` | Cuenta de tests: `architecture` 51, `api-access` 28, `jobs-access` 16, `jobs-package` 3, `messages` 11. Ninguno baja |
| 2. Reglas sin test o sin valor exacto | 2 y 2 por defecto, lo que manda `config.json`, cada regla de la 013 al añadir, qué ficheros se vuelven a pedir | `cloud.test.ts` del dominio y de la consola, con valores exactos (2 llamadas, 3 con `daily_calls` a 5, las líneas añadidas byte a byte) | Cada regla con su mutante muerto (§17.6) |
| 3. Reloj y red | La consola usa el reloj inyectado (`pulled_at`); la web, `now` inyectable; ningún test sale a la red | `setup/no-network.ts` en la web; la consola sobre el API con sus dobles | Limpio. La web usa `new Date()` como su importación a mano (fuera del guardián del reloj, que es de las tareas) |
| 4. Documentos desalineados | Las cabeceras de `cloud.ts` (dominio, consola y web), de `http-reference.ts`, de la tarjeta y de `file-store.ts` | Relectura. Hay cambios que la dirección tiene que llevar a `docs/`: §6 | La cabecera de la tarjeta decía «la web nunca lo descarga»; corregida |
| 5. Techo del paquete | Arranque +0 y total dentro de P13 | Medido en bytes (§17.4) | **El arranque no es +0 (+13) y el total depende de la lectura de P13**: Q19. El techo del total se subió antes del commit que lo necesita; el del arranque no se toca |
| 6. Registros con datos sensibles | El token de la carpeta en la URL o en un error; el `asset_id` en el correo | El token solo viaja en su cabecera (`http-reference.test.ts`); los errores se dicen por código; el correo de los ilegibles, solo con recuentos | Limpio |
| 7. Entradas sin validar | El índice de la API, los nombres de fichero, `_cloud.json`, el manifiesto en la web, los bytes del fichero | `parseReferenceIndex` estricto; `assetOfPriceFile` por ida y vuelta; `parseCloudPull` estricto con `repeatedKey`; `activeHistoryOf` estricto; SHA-256 antes de leer; UTF-8 `fatal` | Limpio |
| 8. Dos pasos sin corte | Bajar y escribir; los cierres y `_cloud.json` | La red antes del cerrojo (mata E3-24); las líneas y `_cloud.json` en la misma transacción. Un fichero de la nube que no se lee no queda como tenido y se vuelve a pedir | Un corte a mitad deja las líneas ya añadidas y un `_cloud.json` viejo: la siguiente vez vuelve a pedir esos ficheros y las reglas de la 013 no añaden nada dos veces |
| 9. Procedimientos | El del histórico del BCE en la nube | `specs/016-scheduled-jobs/runbooks/ecb-history-in-the-cloud.md`, releído orden a orden | Sin ejecutar contra AWS (no hay despliegue). Pide un permiso que el contrato aún no da (§17.1) |
| 10. `--yes` | — | — | Ninguna orden nueva destruye nada: `--from-sources` solo elige de dónde bajar |

### 17.8 Preguntas nuevas de E3

- **Q18. El asunto de `prices_file_unreadable`.** Lo he hecho con el asunto opaco `prices` y el recuento de ficheros, sin nombrar nunca un activo (§17.1). Si la dirección quería una racha por activo, con un identificador opaco (un *hash* del `asset_id`, por ejemplo), es un cambio pequeño en `pricesFindings` y en la lista cerrada. Recomendación: dejarlo así. Un aviso por fichero haría una racha por activo en el buzón, y la consola ya dice cuál es.
- **Q19. El paquete web frente a §8.1 P13** (§17.4):
  - **El arranque es +13 y no +0.** +14 son de la regla de P12, que está en el dominio de arranque, y el resto es ruido de los nombres de los trozos. Queda con 14 bytes de margen bajo el techo (75.039), que no he subido.
  - **El total**, según la lectura de P13, está dentro (2.198 de 3.072 contando lo que añadió la 016) o fuera (268 por encima del absoluto 304.568, porque la 020 añadió unos 1.100 en medio).

  Recomendación: que la dirección fije la lectura del total y autorice el arranque de E3, que hoy pasa sin tocar ningún techo pero sin margen. Los precios del móvil quedan fuera con cualquier lectura.

### 17.9 Tubería

`016-pipeline.sh` sobre `d4cda05`: todo en 0 (cada paso tras la puerta de memoria, nada en paralelo).

```
lint 0, typecheck 0
cov1-domain 0   (1.730 tests; dominio al 100 %: sentencias 9.059, ramas 5.622, funciones 2.038, líneas 8.621)
cov1-others 0   (1.838 tests)
cov2-domain 0
cov2-others 0   (1.838 tests)
build 0         (lambda.zip 1.444.049 bytes; jobs.zip 1.637.421 bytes, 1.411 entradas; web: arranque 75.025, total 304.836)
```

- **La primera tubería, sobre `92200b0`, salió en 1 en los dos pasos de `test:others`.** Fueron dos guardianes de la 015 (`api-access.test.ts`): la web importaba `RemoteError` de la puerta de la sincronización y alcanzaba `adapters/src/sync/` fuera de su motor. Lo arregló `7fafbb5` (§17.3), sin tocar el guardián.
- `tests/fixtures` sin cambios; ningún gemelo `.js`.
- Tests de los guardianes: `architecture` 51, `api-access` 28, `jobs-access` 16, `jobs-package` 3, `messages` 11. Ninguno baja.

### 17.10 Congelado

**E3 queda congelada en el commit que añade esta sección**; su SHA lo dice la descripción de la PR. El código está en `d4cda05`. Mientras dura la revisión no se empuja nada.

## 18. Decisiones de la dirección sobre E3 y revisión de la PR #108, ronda 1 (2026-09-28)

### 18.1 Decisiones sobre las preguntas de E3

- **Q18.** Se acepta el asunto agregado `prices`, con recuentos y sin racha por activo.
- **Q19.** Se aceptan los +13 del arranque, dentro de la autorización de 76.069.
  - **La autorización del total sube a 312.000 bytes** para toda la web, porque la 016 y la 020 crecen a la vez.
  - El techo del total se mide como siempre: medida + 256, en su propio commit y antes del commit que lo necesita.
  - `TOTAL_AUTHORISED_GZIP_BYTES` sube a 312.000 en `check-bundle.mjs`, en un commit propio y con su test (la mutación 7 bis). La 020 lo trae al fusionar `develop`.
- **Los precios en el móvil no se construyen**, como dicen P7 y Q8.
- **`s3:DeleteObject` sobre el manifiesto del BCE** para el rol de administración queda aceptado para el contrato de IAM de la 017.

### 18.2 Decisiones sobre la ronda 1 (comentario 5862320849)

- **B1.** `cloudLinesToAppend` recibe `today` (Madrid) y descarta toda línea con `date >= today`. Dice cuántas, con `cloud_lines_future`, en la salida y en `status`. Tests con una línea de hoy y otra de 2099.
- **N1.** `atlas settings set --notification-email` desaparece. Si se usa, `UsageError` con un mensaje que dice que el destinatario vive en la configuración de la nube (tfvars), nunca en el libro. Con su test.
- **N2.** Un fichero de la nube que no es UTF-8 es `cloud_unreadable` y su versión no se guarda. Test con bytes `0xFF`.
- **N3.** `RemoteError`, `parseErrorAnswer` y `parseReferenceIndex` pasan a una puerta neutra, que no es la de la sincronización. El guardián de la sincronización queda estricto, sin excepciones. Mutante: un módulo fuera de `adapters/src/sync/` que importa la puerta de la sincronización.
- **N4.** Se corrige el procedimiento:
  - paso 4: borrar antes el registro de hoy;
  - permisos en §8 del contrato de IAM;
  - paso 3a: el nombre del fichero sale del manifiesto;
  - la tarjeta del BCE ofrece «Borrar la copia del BCE de este navegador», con confirmación;
  - aviso de deriva en Terraform.
- **N5.** Si el `symbols.json` local declara una divisa para la fuente y la nube sirve otra, esas líneas no se añaden, y se dice `cloud_currency_mismatch`. Con su test.
- **N6.** Tope de 20 MB en la descarga de la web y en la de la consola. Con su test.
- El techo del arranque se sube si hace falta, en su propio commit.

### 18.3 Mapa hallazgo → commit

| Hallazgo | Commit | Qué |
|---|---|---|
| Q19 (312.000) | `4829d9c` | `TOTAL_AUTHORISED_GZIP_BYTES` a 312.000, con su comentario, y el test `bundle-authorisation.test.ts` al día |
| N1 | `ada76e9` | `--notification-email` sale de las opciones de `atlas settings set`. Usarla da `UsageError`: «el destinatario de los correos vive en la configuración de la nube (terraform.tfvars, de donde pasa a SSM), nunca en el libro», y no se escribe nada |
| B1, N5, N2 | `570b6fc` | `cloudLinesToAppend(…, { today, declared })` devuelve `{ added, future, mismatched }`: nunca una línea de hoy o futura, ni una en otra divisa que la que la carpeta declara para su fuente.<br>La consola pasa `today` de Madrid y las divisas de su `symbols.json`, dice `cloud_lines_future` y `cloud_currency_mismatch` al bajar y los guarda en `_cloud.json` (`discarded`) para que `status` los diga.<br>Unos bytes que no son UTF-8 son `cloud_unreadable` y su versión no se guarda |
| N6 | `2eda1ad` | El cliente de los datos de referencia (la consola y la web) no pasa de 20 MB (`MAX_REFERENCE_BYTES`): lo niega por la longitud que dice la respuesta, o contando lo que llega, y corta la lectura |
| Techos | `a6e2eab` | Los dos techos, **antes** de los commits que los necesitan (§18.5) |
| N3 | `9d66bf2`, `3ea6e33` | Puerta neutra `@atlas/domain/remote-answers`: `RemoteError`, `parseErrorAnswer` y `parseReferenceIndex`, estos dos en `domain/src/remote/answers.ts`.<br>La puerta de la sincronización sigue exportando `parseErrorAnswer`, que usa.<br>El cliente de referencia y la consola importan de la puerta neutra. La web la carga en diferido (el grupo `domain` de `vite.config.ts` la deja fuera, y `LAZY_ONLY` lo vigila).<br>El guardián de la sincronización no cambia ni gana excepciones. Uno nuevo en `api-access.test.ts` comprueba que el cliente de referencia y la descarga del BCE de la web no alcanzan nada de la sincronización, por ningún camino |
| N4 (web) | `9108c04` | «Borrar la copia del BCE de este navegador» en la tarjeta del BCE, cuando hay una copia importada o de la nube, con confirmación (`ConfirmDialog`, destructiva). Borra solo la copia del navegador, y la siguiente descarga es una primera: una generación restaurada baja entera |
| N4 (procedimiento e IAM) | `6d5c222` | El procedimiento:<br>- trabaja fuera del repositorio;<br>- avisa de la deriva respecto de Terraform y de no desplegar hasta reactivar;<br>- saca el nombre del fichero del manifiesto;<br>- en el paso 4 borra antes el registro de hoy, que está versionado;<br>- manda borrar la copia de cada navegador tras restaurar.<br>`contracts/iam-permissions.md` §8: `scheduler:GetSchedule`/`UpdateSchedule` (y `iam:PassRole`, que exige `UpdateSchedule`), `s3:ListBucketVersions`, `s3:GetObjectVersion` y `s3:PutObject` sobre `reference/ecb/*`, `s3:DeleteObject` sobre el manifiesto y sobre `jobs/ecb/ecb_update/*`, y `lambda:InvokeFunction` |

**Añadido por mi cuenta, dicho:** `iam:PassRole` sobre el rol de Scheduler. `UpdateSchedule` lo exige al reescribir una programación con su destino. Es una deducción de la documentación de EventBridge Scheduler, **sin verificar** contra AWS.

### 18.4 Cómo se vio cada test en rojo

- **N1**: el test de `settings.test.ts` (consola), en rojo contra `catalogue.ts` de `0a86822`, que aceptaba la opción y salía con 0 (`016-e3r1-red-n1.log`).
- **B1, N5, N2**: los tres tests nuevos de la consola, en rojo contra el dominio de `0a86822` (`016-e3r1-red-cli.log`). Los del dominio fallan por la firma nueva, y su rojo de conducta es la mutación.
- **N6**: el test del tope, en rojo contra el cliente sin tope (`016-e3r1-red-n6.log`).
- **N3**: el guardián nuevo, en rojo con el cliente importando la puerta de la sincronización (`016-e3r1-red-n3.log`), que es también el mutante R1-N3.
- **N4 (web)**: el test de «Borrar la copia», en rojo antes de que existiera el botón (`016-e3r1-red-n4.log`).

### 18.5 El paquete web

**Medido en bytes:**
- **Arranque: 75.057**, +32 sobre los 75.025 de E3 y +45 sobre `develop`.
  - Unos +16 son dos exportaciones más del trozo `domain`, que los trozos diferidos de la puerta neutra toman de él (`isRecord` y compañía).
  - El resto es de los nombres de los trozos.
  - **Techo 75.077 = medida + 20**, dentro de la autorización de 76.069, como permitió la dirección.
- **Total: 305.394**, +558 sobre E3.
  - La sección de Ajustes pone +463, con «Borrar la copia», su confirmación y el tope de 20 MB del cliente.
  - El resto es de la puerta neutra y del almacén del navegador.
  - **Techo 305.650 = medida + 256**, dentro de 312.000.

**Un tropiezo, dicho:** con la puerta neutra, Rolldown metió `remote/answers.ts` y `ports/remote-ledger.ts` en el trozo `domain`, que es de arranque. `check-bundle.mjs` lo paró: el arranque subía a 75.672.
- La expresión del grupo `domain` de `vite.config.ts` deja ahora fuera `remote/` y `remote-answers.ts`, como ya dejaba fuera `sync/`.
- Van en el commit de la puerta, `9d66bf2`. Los commits de esta ronda se reordenaron en local antes de empujar, para que ninguno construya en rojo.

### 18.6 Mutación (lotes `016-e3r1-a.json` y `-b.json`, uno a uno tras la puerta de memoria)

| Id | Mutante | Test que lo mata | Veredicto |
|---|---|---|---|
| R1-B1 | una línea de hoy o futura se toma de la nube | `domain/test/quotes/cloud.test.ts`, `apps/cli/test/prices/cloud.test.ts` | KILLED |
| R1-N5a | una línea en otra divisa que la declarada se toma | ídem | KILLED |
| R1-N5b | la consola no le dice al dominio qué declara la carpeta | `cloud.test.ts` (consola) | KILLED |
| R1-N2 | unos bytes que no son UTF-8 se toman por un fichero vacío | `cloud.test.ts` (consola) | KILLED |
| R1-N1 | `--notification-email` se niega sin decir dónde vive el destinatario | `settings.test.ts` (consola) | KILLED |
| R1-N3 | el cliente de referencia importa la puerta de la sincronización | `tests/api-access.test.ts` (el guardián nuevo) | KILLED |
| R1-N4 | la copia del navegador se borra sin preguntar | `apps/web/test/ecb-cloud.test.tsx` | KILLED |
| R1-N6a | no se mira la longitud que dice la respuesta | `packages/adapters/test/reference/http.test.ts` | KILLED |
| R1-N6b | lo que llega no se cuenta contra el tope | ídem | KILLED |

9 de 9 muertos.

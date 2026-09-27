# Plan de implementación: `016-scheduled-jobs`

**Rama**: `feature/016-scheduled-jobs` | **Fecha**: 2026-09-27 | **Spec**: [spec.md](spec.md) | **Preguntas y bloque 0**: [questions.md](questions.md)

**Entrada**: `docs/prompts/016-scheduled-jobs.md` (§8.1 y §8.2 aplicadas), la spec, y lo comprobado en `questions.md` §1 y §3.

**Estado**: **propuesta para el alto**. Todo lo marcado **PROPUESTA** lo decide la dirección (§7.2 del encargo). Lo demás aplica decisiones ya tomadas, citadas.

## Resumen

Cinco funciones Lambda salen de **un solo artefacto** (`apps/jobs/dist-lambda/jobs.zip`): BCE, precios, correo, volcado e integridad, cada una con su rol y su lista cerrada de tareas (`ATLAS_JOBS`). Una programación diaria por función despierta al manejador, que **compone y no decide**: el dominio dice qué tarea toca (`job_frequencies`, el día en Madrid y el registro de la última ejecución), qué periodo es, qué dice cada correo y si lleva importes. Cada tarea reclama su periodo en `jobs/<familia>/<tarea>/<periodo>.json` con `If-None-Match: *` y lo cierra con `If-Match`. Solo la función de correo envía: las demás dejan sus hallazgos en su registro, y el correo los lee, los envía y apunta la racha. El puerto `Notifier` no recibe el destinatario; el interruptor de importes tiene un solo lector, la composición del correo. Los almacenes de S3 del BCE y de los precios cumplen los contratos de los de carpeta con escrituras condicionales objeto a objeto, sin cerrojo ni `rename`. La consola y el móvil beben de la API. El volcado nunca sobrescribe.

## Contexto técnico

- **Lenguaje**: TypeScript estricto, ESM, Node 22 (`.nvmrc`), como el resto del monorepo (ADR-0007).
- **Dependencias**: **una nueva**, `@aws-sdk/client-sesv2@3.1141.0`, en `packages/adapters`, solo en `src/aws/sdk-ses.ts`, con `SendEmail` como única orden (§8.1 P8); se instala en E1 tras el bloque 0. `apps/jobs` depende de `@atlas/domain`, `@atlas/adapters` y, en desarrollo, de `esbuild@0.28.2`, que ya está en el *lockfile*.
- **Almacenamiento**: el bucket de datos (S3, versionado); SSM para el destinatario, el interruptor y las claves de las fuentes.
- **Tests**: Vitest, un proyecto nuevo `jobs` en `vitest.config.ts`; dobles de S3 y SSM de la 015 (`test-only-fake-s3.ts`, `test-only-fake-ssm.ts`), y dobles nuevos de SES, del BCE, de las fuentes y del reloj; siempre `--pool=forks --maxWorkers=1`.
- **Plataforma objetivo**: Lambda (Node 22) invocada de forma asíncrona por EventBridge Scheduler (questions §1.4). Nada se despliega en esta feature.
- **Restricciones**: dominio al 100 % en su propia pasada; nada del SDK alcanzable desde el dominio, la web o la API; el arranque del paquete web +0 y el total como mucho +3.072 bytes (§8.1 P13).
- **Escala**: un usuario, unos diez correos al mes, un libro de menos de 1-2 MB (ADR-0002).

## Comprobación contra la constitución

| Principio | Cómo se cumple |
|---|---|
| I. El libro es la fuente de verdad | Ninguna tarea escribe en el libro. `positions.json` es una proyección que se regenera. Las tareas leen el libro remoto y nada más |
| II. Lotes; la fiscalidad solo del libro | Ningún precio llega a la fiscalidad: el aviso del 720 usa la función del modelo, que no alcanza la puerta de precios (R31) |
| III. Compartimentación | El correo semanal nombra núcleo y cubo por separado; el peso del cubo sobre el patrimonio es la excepción 2, siempre desglosada |
| IV. Configurable, y dónde | `job_frequencies` en `Settings` (afecta a cuándo se calcula); destinatario, interruptor, presupuestos, orden de fuentes, umbral de fallos y umbral de tamaño, **fuera del libro** (SSM o variables de la función) |
| V. Fallo seguro | El recordatorio mensual llega siempre y dice qué no pudo calcular; los avisos, solo con algo que hacer; un fallo de SSM o SES es un código, nunca un envío dado por hecho |
| VI. Pocas dependencias, coste mínimo | Una dependencia, autorizada; cero servicios nuevos que no estuvieran ya en la Ronda 8 |
| VII. Tests primero | Cada regla con su test visto en rojo y su mutante visto morir (§4) |
| Restricciones: registros | Nada de la regla 7 de la spec; el test de centinelas recorre cada tarea por sus caminos de fallo (R9) |

**Sin violaciones que justificar.** Se vuelve a pasar al final de cada entrega.

## 1. Dónde vive cada cosa

```text
packages/domain/src/
  ports/notifier.ts                 Notifier: send(message) → resultado con código. Sin destinatario
  jobs/                             (nuevo; puerta @atlas/domain/jobs)
    event.ts                        el evento de Scheduler, leído estricto
    config.ts                       las variables ATLAS_* de las tareas (regla de parseApiConfig)
    catalog.ts                      las tareas, sus familias y sus frecuencias admitidas
    frequencies.ts                  job_frequencies: lectura tolerante, escritura estricta
    periods.ts                      periodo de cada frecuencia en Europe/Madrid
    due.ts                          qué toca hoy
    run-record.ts                   formato del registro y sus transiciones
    notices.ts                      rachas: una vez por racha
    amounts.ts                      el interruptor: interpretar el String de SSM
    reminder.ts                     los datos del recordatorio (días, tokens, reparto por clase)
    sign-in.ts                      el objeto del último inicio de sesión web y su regla de avance
    mail/                           una función pura por correo: asunto y cuerpo
    (E2) prices-findings.ts, ecb-findings.ts, ecb-recovery.ts, symbols-push.ts
    (E4) positions.ts, rehearsal.ts, size.ts, review.ts, informative-alerts.ts
  quotes/cascade.ts                 (E2, si se acepta Q1) opción symbols: "read_only"
  settings/settings.ts              (E3) mergeSettings deja fuera notification_email
  access/sync-routes.ts             (E2) REFERENCE_NAME por ida y vuelta (Q4)

packages/adapters/src/
  aws/sdk-ses.ts                    el único fichero que importa @aws-sdk/client-sesv2 (puerta @atlas/adapters/aws-ses)
  aws/mail.ts                       MailSender (interfaz estrecha) y sesNotifier: lee el destinatario de SSM
  aws/jobs-store.ts                 vistas de ObjectStore acotadas por prefijo, una por familia
  aws/sign-in-object.ts             lee y avanza access/last-web-sign-in.json
  aws/s3-ecb-store.ts               (E2) EcbHistoryStore sobre S3
  aws/s3-price-store.ts             (E2) PriceStore sobre S3
  aws/price-keys.ts                 (E2) las claves de las fuentes desde SSM
  prices/simulated.ts               (E2) la fuente simulada de dev: la única excepción declarada al guardián de los dobles

packages/adapters/test/jobs/
  test-only-file-notifier.ts        el Notifier de fichero (pruebas y capturas)
  test-only-fake-ses.ts, test-only-fake-ecb.ts, test-only-fake-price-source.ts

apps/jobs/                          @atlas/jobs; nada lo importa
  src/lambda.ts                     export const handler = await composeOrFail(process.env, …)
  src/compose.ts                    compone por familia; compose_failed con solo error_name
  src/handler.ts                    lee el evento, pregunta al dominio qué toca, ejecuta, registra
  src/log.ts                        una línea JSON por tarea, campos cerrados
  src/tasks/{ecb,prices,mail,backup,integrity}.ts   la composición de cada familia
  scripts/build-lambda.mjs          jobs.zip, determinista (PROPUESTA P-H: parte común con apps/api)
  test/…

apps/api/src/handler.ts             (E1) tras la cookie de una sesión web, avanza access/last-web-sign-in.json
apps/cli/src/commands/admin.ts      (E2) atlas admin prices push
apps/cli/src/commands/prices.ts     (E3) update desde la API; --from-sources
apps/web/src/ecb/, src/prices/      (E3) la descarga de la nube, perezosa
tests/architecture.test.ts, tests/api-access.test.ts, tests/jobs-access.test.ts (nuevo), tests/jobs-package.test.ts (nuevo)
```

## 2. La partición, tal como la sigo

La del encargo (§3, §8.1 P2), sin cambios: **E1** esqueleto, correo y recordatorio mensual (con el objeto del inicio de sesión web); **E2** datos del día y `atlas admin prices push`; **E3** consola y web; **E4** volcado, integridad, avisos y procedimientos. Una rama, cuatro PRs; tras cada fusión, `git merge origin/develop`.

**Zonas de revisión propuestas** (§2 quater), con sus ficheros:

| Entrega | Zona | Ficheros | Profundidad |
|---|---|---|---|
| E1 | **Z1** privacidad del correo y registros | `domain/src/jobs/{mail/,amounts,reminder,sign-in}.ts`, `ports/notifier.ts`, `adapters/src/aws/{mail,sdk-ses,sign-in-object}.ts`, `apps/jobs/src/{log,tasks/mail}.ts`, `apps/api/src/handler.ts` (el cambio del inicio de sesión) y los tests de centinelas y de renderizado | Alta: lo que sale del perímetro |
| E1 | **Z2** idempotencia, periodos y reloj | `domain/src/jobs/{event,config,catalog,frequencies,periods,due,run-record,notices}.ts`, `adapters/src/aws/jobs-store.ts`, `apps/jobs/src/{compose,handler,lambda}.ts`, `apps/jobs/scripts/`, los guardianes nuevos | Alta: se multiplica por cada tarea |
| E2 | **Z3** fuentes, claves, cupo y `atlas admin prices push` | `quotes/cascade.ts` (Q1), `adapters/src/aws/price-keys.ts`, `prices/simulated.ts`, `apps/jobs/src/tasks/prices.ts`, `apps/cli/src/commands/admin.ts` (push), `domain/src/jobs/{prices-findings,symbols-push}.ts` | Alta |
| E2 | **Z4** escrituras en S3 y sus cortes | `adapters/src/aws/{s3-ecb-store,s3-price-store}.ts`, `domain/src/jobs/{ecb-recovery,ecb-findings}.ts`, `access/sync-routes.ts` (Q4), `apps/jobs/src/tasks/ecb.ts` | Alta |
| E3 | **Z5** la consola y su carpeta | `apps/cli/src/commands/prices.ts`, lo que añade a la carpeta, `settings/settings.ts` (`mergeSettings`) | Media |
| E3 | **Z6** la web y su paquete | `apps/web/src/{ecb,prices,view-models/settings}.ts…`, `check-bundle.mjs` | Media |
| E4 | **Z7** copias y restauración | `domain/src/jobs/{positions,rehearsal,size}.ts`, `apps/jobs/src/tasks/{backup,integrity}.ts` | Alta: lo que es para siempre |
| E4 | **Z8** avisos y la ruta fiscal | `domain/src/jobs/{review,informative-alerts}.ts`, `mail/` de los avisos, los procedimientos | Alta |

## 3. Bloque 0

E1: **hecho**, en `questions.md` §1, con su fuente y su fecha; el punto 1 sale bien y no para. E2 a E4: la lista de `questions.md` §2, cada uno antes del primer commit de código de su entrega.

## 4. Las reglas, cada una con su test y el mutante que la rompe

Cada fila se ve en rojo antes que el código, y su mutante se ve morir **por su regla** (el guion de mutación afirma el mensaje esperado, como el de la 015). Los números entre corchetes son los mutantes de §6 del encargo.

### 4.1 Guardianes (bloque 1 de E1, antes que el código)

| # | Regla | Test | Mutante que la rompe |
|---|---|---|---|
| G1 | `apps/jobs` importa solo `@atlas/domain` y `@atlas/adapters`, y **nada importa `apps/jobs`** | `architecture.test.ts`, bloque de dependencias entre *workspaces*, ampliado | un `import "@atlas/jobs"` desde `apps/cli`; un `../../jobs/src/…` relativo desde `apps/api` |
| G2 | El código de las tareas no se alcanza desde la web, la consola ni la API, **por el grafo real** (reexportación, ruta relativa, alias, `import()` no literal, `?raw`, `?url&inline`, *worker*) | `tests/jobs-access.test.ts`, con el lector del grafo de `api-access.test.ts` (`reach`, `exportsOf`) y la batería de elusiones de la 015 | cada elusión de la batería, una a una, vista morir por la regla y no por los bytes |
| G3 | La API no alcanza `Notifier`, `sdk-ses`, `aws/mail.ts` ni `aws/price-keys.ts`; la web tampoco; **el correo no alcanza `price-keys.ts`** (§8.2 B2) | el mismo fichero, por el grafo desde `apps/api/src/lambda.ts`, desde la web y desde `apps/jobs/src/tasks/mail.ts` | un `import` de `price-keys` en `tasks/mail.ts` [18 bis] |
| G4 | `@aws-sdk/client-sesv2` solo en `adapters/src/aws/sdk-ses.ts`, con **`SendEmailCommand`** como única orden; las dependencias de `packages/adapters` pasan a ser **exactamente** los tres clientes | `api-access.test.ts:305`, `:465` y `:760`, **cambiados a propósito en el commit de la instalación** | un `SendRawEmailCommand` o un `CreateEmailIdentityCommand` en `sdk-ses.ts`; un cuarto cliente |
| G5 | Nada nuevo de la web en el arranque, y ningún módulo de la web alcanza `domain/src/jobs/` salvo lo que E3 declare en `LAZY_ONLY` | `check-bundle.mjs` (`LAZY_ONLY`) y `architecture.test.ts` | quitar `domain/src/jobs/` de `LAZY_ONLY` [27] |
| G6 | **El reloj**: ningún fichero nuevo o tocado por la 016 fuera de `adapters/src/clock/system.ts` nombra `new Date(` sin argumento ni `Date.now(` | `tests/jobs-access.test.ts`, sobre la lista de ficheros de la feature (los de `apps/jobs`, `domain/src/jobs`, `adapters/src/aws/{mail,jobs-store,…}` y sus tests) | un `Date.now()` en `due.ts`; un `new Date()` en un test de `apps/jobs` |
| G7 | El test de centinelas de los registros corre sobre el manejador de las tareas, captura `stdout` y `stderr` y cubre los caminos de fallo | `apps/jobs/test/sentinels.test.ts`, vacío al principio y creciendo con cada tarea | registrar el `message` de un error del SDK; registrar el destinatario [9] |
| G8 | **Los dobles**: nada de `test-only-*` ni de `adapters/test/` es alcanzable desde `jobs.zip`; **la única excepción declarada** es `adapters/src/prices/simulated.ts`, nombrada en el guardián | `tests/jobs-package.test.ts` (entradas del *metafile*, como `lambda-package.test.ts`) | el `Notifier` de fichero alcanzable desde `compose.ts` [10]; una segunda excepción sin nombrar [17] |

Antes de cada PR se cuentan los tests de `architecture`, `api-access`, `jobs-access` y `jobs-package` contra la línea de `questions.md` §3 (49, 28, 0, 0).

### 4.2 E1

| # | Regla | Test | Mutante |
|---|---|---|---|
| R1 | Con el interruptor apagado, **ningún** importe, cantidad, precio, nombre de activo, ISIN, símbolo ni cuenta en ningún correo (§8.1 P9) | `domain/test/jobs/mail-render.test.ts`: un libro sembrado de centinelas (importes como `987654.32`, cantidades, precios, `NAME-SENTINEL`, un ISIN inventado, `ACC-SENTINEL`), cada correo renderizado, cada centinela buscado en asunto y cuerpo, **también en sus formas con separadores de miles y con coma decimal** | poner `allocation_eur` en el reparto con el interruptor apagado [1] |
| R2 | Con el interruptor encendido, aparecen **exactamente** las cifras de `contracts/mail.md`, con su valor, y nunca una cuenta ni un ISIN | el mismo fichero, con la lista exacta de apariciones | quitar una cifra; añadir `asset_id` a una fila |
| R3 | La redacción usa **solo** `code` y los `details` enumerados de los avisos del dominio, **nunca `message`** (que lleva importes, `weights.ts:175`) | el mismo fichero, con un aviso cuyo `message` es un centinela | usar `warning.message` en el cuerpo [1] |
| R4 | El interruptor: solo `on` lo enciende; ausente, vacío, `ON`, `true`, `1`, con espacios o cualquier otra cosa lo dejan apagado | `domain/test/jobs/amounts.test.ts`, tabla de valores | leer «presente» como encendido; `trim()` antes de comparar [2] |
| R5 | **Un solo lector del interruptor**: ningún módulo salvo `apps/jobs/src/tasks/mail.ts` nombra el parámetro `mail/amounts`; el adaptador de SES no lo lee | `tests/jobs-access.test.ts`, textual y por grafo | leerlo en `aws/mail.ts` con otra regla [2] |
| R6 | `Notifier.send` no recibe destinatario; `sesNotifier` envía siempre al de SSM y a ningún otro; un destinatario que no es una dirección válida (una sola, sin coma, sin espacios, ASCII, como mucho 254) no envía (`mail_recipient_invalid`) | `adapters/test/aws/mail.test.ts` contra el doble de SES, que registra `Destination` | añadir un parámetro `to`; enviar a `message.to` [3] |
| R7 | Un fallo de SSM o de SES es un fallo con código (`mail_recipient_unavailable`, `mail_send_failed`, `mail_send_unknown`), nunca un envío dado por hecho | el mismo fichero; `apps/jobs/test/mail.test.ts` | tratar un `ThrottlingException` como enviado |
| R8 | El recordatorio mensual **no se puede apagar** y llega con un libro inválido o sin precios, diciendo qué no pudo calcular | `domain/test/jobs/due.test.ts` y `apps/jobs/test/reminder.test.ts` (libro con una línea ilegible; sin `prices/`; sin `reference/ecb/`) | `due` que respeta un `reminder: off`; el recordatorio que lanza con el libro inválido [4] |
| R9 | `job_frequencies`: una clave o un valor desconocidos no invalidan el libro; se usa el valor por defecto **y se dice** (en el registro de la tarea y, en E3, en Ajustes) | `domain/test/jobs/frequencies.test.ts` (el *golden* con `reconciliation: quarterly`) | lanzar con la clave desconocida; ignorarla sin decirlo [4] |
| R10 | Una tarea toca **una vez** por periodo: cerrada, no vuelve; reclamada sin cerrar, el recordatorio se reenvía y un aviso no (§5.3) | `domain/test/jobs/run-record.test.ts` y `apps/jobs/test/cuts.test.ts`, con cortes entre reclamar y hacer y entre hacer y cerrar | reclamar sin `If-None-Match`; tratar «reclamado» como «libre» para un aviso [5] |
| R11 | Los periodos en `Europe/Madrid`: el 31 de diciembre a las 23:30 de Madrid es diciembre y el año que acaba; las 00:30 del 1 de enero, enero y el nuevo; los cambios de hora de marzo y de octubre; fin de mes | `domain/test/jobs/periods.test.ts`, con instantes UTC fijos | calcular el mes con `getUTCMonth` [6] |
| R12 | El evento de Scheduler: un JSON con exactamente `event_format: 1` y `tasks` (lista no vacía, sin repetidas, cada una de `ATLAS_JOBS`); una clave repetida, un campo desconocido, un suplente suelto o un no-JSON se niegan con `job_event_invalid` y no hacen nada | `domain/test/jobs/event.test.ts` y `apps/jobs/test/handler.test.ts` | aceptar un campo de más; ejecutar una tarea que no es de la función [7] |
| R13 | Los tokens vivos: los activos (ni revocados ni caducados, con el techo de 120 días de `tokenStatus`); los emitidos en el mes anterior de Madrid; **un registro ilegible se cuenta aparte, nunca se omite ni cuenta como vivo** | `domain/test/jobs/reminder.test.ts` | saltar los ilegibles; contar un revocado [8] |
| R14 | Los días desde el último inicio de sesión: el mayor entre `last_web_sign_in` y el `issued_at` de **todo** registro legible (vivo o no), en fechas de Madrid; el aviso cuando llegan a `ATLAS_OAUTH_IDLE_WARNING_DAYS` (150 por defecto) | el mismo fichero, en el borde exacto | `>` por `>=` en el borde; ignorar los revocados |
| R15 | **Registros**: el destinatario, el remitente, el asunto, el cuerpo, un importe, un `asset_id`, un símbolo, un ISIN, una clave, un token, un correo, un `sub` o el mensaje de un error ajeno nunca aparecen, tampoco en el arranque sin configuración, con SSM limitado, con SES que rechaza o con S3 que da `AccessDenied` | `apps/jobs/test/sentinels.test.ts` (G7) | [9] |
| R16 | El objeto del último inicio de sesión web lleva **solo** `web_sign_in_format` y `last_web_sign_in`, y **solo avanza** (`If-Match`; una fecha igual o anterior no escribe); su fallo no hace fallar el inicio de sesión | `apps/api/test/sign-in-object.test.ts` y el test de centinelas de la API | añadir `sub`; escribir sin comparar; retroceder [9] |
| R17 | La configuración de cada función: una `ATLAS_*` desconocida o que no se entiende impide arrancar (`jobs_config_invalid`); `ATLAS_JOBS` de dos familias también (`mixed_families`); ningún secreto en una variable | `domain/test/jobs/config.test.ts`, `apps/jobs/test/compose.test.ts` | aceptar una desconocida; aceptar `mail` y `prices_update` juntas |
| R18 | El arranque captura su fallo como `compose_failed` con solo `error_name`, sin el mensaje del SDK | `apps/jobs/test/compose.test.ts` | registrar `error.message` |
| R19 | Solo la función de correo envía; los hallazgos viven en el registro de la tarea que los encontró, y la función de correo avisa **una vez por racha** (§5.4) | `domain/test/jobs/notices.test.ts` y `apps/jobs/test/dispatch.test.ts` | reenviar en el segundo día de la misma racha [18]; enviar desde otra familia [18 bis] |
| R20 | El asunto es ASCII imprimible y lleva el identificador del periodo (Q5, §8.1 P10) | `mail-render.test.ts` | un asunto con tilde |

### 4.3 E2 a E4

| # | Regla | Test | Mutante |
|---|---|---|---|
| R21 | Nunca el día en curso | el contrato del almacén de S3 con la cascada, `today` en Madrid a las 07:00 | `to = today` [11] |
| R22 | Una llamada se reserva **antes** de llamar y una reserva **nunca se devuelve** tras un corte o un conflicto | `adapters/test/aws/s3-price-store.test.ts`, cortes y `409` | reservar después; restar al abortar [12] |
| R23 | La tarea nunca escribe `symbols.json` ni lee un `prices/config.json` del bucket: la configuración sale de la función (§8.2 M5) | el almacén de S3 se niega a `writeSymbols` y `rewriteCloses`; su `config()` no toca S3 (el doble lo registra) | leer `prices/config.json`; permitir `writeSymbols` [13] |
| R24 | `atlas admin prices push`: solo `symbols.json`, sin estado local, diferencia a la vista, entorno tecleado, sin `--yes`, salida 4 sin terminal, `If-Match` sobre **esa** lectura, negativa con `misstored`, ilegible o formato más nuevo | `apps/cli/test/admin-prices-push.test.ts` | los cinco de [13 bis] |
| R25 | Una correspondencia sin contrastar no se descarga (Q1) | la cascada con `symbols: "read_only"` | contrastar en la nube [14] |
| R26 | La clave nunca en un registro, un error ni una URL guardada | centinela de clave en los caminos de fallo (401, red caída) | quitar la censura [15] |
| R27 | Sin claves: ni descarga, ni fallos seguidos, ni hallazgos | `apps/jobs/test/prices.test.ts` | contar el fallo [16] |
| R28 | La fuente simulada, negada con `ATLAS_ENV=prod` | `apps/jobs/test/compose.test.ts` | quitar la comprobación [17] |
| R29 | Fallos seguidos: solo `unavailable`, `rate_limited`, `blocked`, `invalid_response`; un aviso por racha | `notices.test.ts`, `dispatch.test.ts` | contar `not_found` [18] |
| R30 | Aviso de tesis solo por `horizon_exceeded` (§8.2 B1) | `prices-findings.test.ts` | avisar por `invalidation` [18 bis] |
| R31 | BCE: ningún lector ve el fichero nuevo con el manifiesto viejo como si cuadrara; nunca se pisa un tipo publicado; la siguiente ejecución termina o deshace | `s3-ecb-store.test.ts`, un corte en cada hueco de §7.1 | invertir fichero y manifiesto [19] |
| R32 | Un conflicto de S3 aborta sin reintentar dentro de la ejecución | los dos almacenes | un bucle de reintento [20] |
| R33 | Los activos, del libro remoto | `prices.test.ts` | leerlos de `symbols.json` [21] |
| R34-R39 | E3: consola sin fuentes [22], reglas de la 013 al añadir [23], red fuera del cerrojo [24], SHA-256 y sin descarga al arrancar [25], `notification_email` [26], arranque [27] | los de §11 | los de §6 |
| R40-R45 | E4: `backups/` nunca sobrescrito y mes a medias terminado [28], ensayo cortado en los mismos eventos [29], umbral de tamaño configurable y justo por encima [30], 720 sin cierres [31], nada sin algo que hacer [32], procedimientos [33] | los de §8 y §9 | los de §6 |
| R46-R48 | Siempre: la cifra fiscal no cambia [34], dos códigos nunca se pliegan [35], ninguna orden destructiva acepta `--yes` [36] | `tests/fixtures` + la salida fiscal; `messages.test.ts`; `admin` | los de §6 |

## 5. El esqueleto (E1, bloque 2)

### 5.1 El evento y la configuración

Contrato en `contracts/scheduler-event.md` y `contracts/ssm-and-config.md`. El evento es `{ "event_format": 1, "tasks": ["…"] }`; la programación de cada función lista sus tareas. **PROPUESTA (Q6)**: el periodo sale del reloj, no del evento.

### 5.2 Qué toca hoy (**PROPUESTA**, Q2)

| Tarea | Familia | Clave de `job_frequencies` | Valores admitidos (por defecto en negrita) | Cuándo toca dentro del periodo |
|---|---|---|---|---|
| `ecb_update` | ecb | `ecb` | **`daily`**, `weekly` | la primera ejecución del periodo |
| `prices_update` | prices | `prices` | **`daily`**, `weekly` | ídem |
| `dispatch_findings` | mail | — (interna, diaria) | — | cada día |
| `monthly_reminder` | mail | `reminder` | **`monthly`** (fijo) | la primera ejecución del mes |
| `weekly_review` | mail | `review` | **`weekly`**, `monthly` | la primera ejecución de la semana ISO, o del mes |
| `tax_return_ready` | mail | `tax_return` | **`yearly`** (fijo) | la primera ejecución de enero |
| `informative_thresholds` | mail | `informative_thresholds` | **`yearly`** (fijo) | la primera ejecución de enero |
| `monthly_backup` | backup | `backup` | **`monthly`** (fijo) | la primera ejecución del mes |
| `quarterly_integrity` | integrity | `integrity` | **`quarterly`**, `monthly` | la primera ejecución del periodo |

- `reconciliation` (en el *golden*) es una clave **reservada** de la Ronda 6: `job_not_available`. Cualquier otra, `job_frequency_unknown_key`; un valor no admitido, `job_frequency_invalid_value`. En los tres casos, el valor por defecto y **se dice**.
- `due(task, frequencies, today, lastRecord)` es pura: toca si no hay registro **cerrado** del periodo de hoy; un registro reclamado sin cerrar **de un periodo anterior** se termina primero (§5.3).
- Periodos: `YYYY-MM-DD`, `YYYY-Www` (semana ISO), `YYYY-MM`, `YYYY-Qn`, `YYYY`, todos del día de Madrid (`madridDateOf`).
- **Escritura estricta**: `job_frequencies` no tiene formulario hoy ni lo tendrá en esta feature; la función de validación estricta existe en el dominio (`validJobFrequencies`) para el día que lo tenga, con su test.

### 5.3 El registro de ejecución y los reintentos

Formato en `data-model.md` §1. Clave `jobs/<familia>/<tarea>/<periodo>.json`; **un solo escritor por objeto**: la función de su familia.

| Estado leído | Recordatorio mensual (al menos una vez) | Avisos (como mucho una vez) | Tareas sin correo (BCE, precios, volcado, integridad) |
|---|---|---|---|
| ninguno | reclamar (`If-None-Match: *`) → hacer | ídem | ídem |
| `claimed` | rehacer y enviar otra vez (el asunto lleva el periodo) | rehacer **sin enviar** si el registro dice `sending`; si no, enviar | rehacer: cada paso es idempotente (§7, §8) |
| `sending` | — (no se usa) | cerrar como `send_unknown`, **sin enviar** | — |
| `send_failed` | enviar otra vez | enviar otra vez: SES dijo que no | — |
| `done` / `failed` | nada | nada | `done`: nada. `failed`: se reintenta en la ejecución del día siguiente dentro del periodo |

- Transiciones con `If-Match` sobre el ETag leído; un `precondition_failed` aborta la tarea sin reintentar (otra ejecución la tiene), con el código `job_record_conflict`.
- **El manejador nunca lanza por un fallo previsto**: lo cierra como `failed` con su código y devuelve normalmente, para que Lambda no reintente (questions §1.4). Lanza solo si no puede ni escribir el registro.
- **Tests de corte**, cada uno visto matar a un mutante que invierte el orden: entre reclamar y hacer; entre `sending` y enviar; entre enviar y cerrar; entre hacer y cerrar en cada tarea sin correo.

### 5.4 Hallazgos y rachas (§8.2 B2)

- Cada tarea no-correo deja en su registro, al cerrar, `findings`: `{ code, subject, counts?, dates? }`. `subject` es **opaco y sin datos personales**: `eodhd`, `alpha_vantage`, el `thesis_id`, `ecb`, `backup`, `integrity`. Nunca un `asset_id`, un símbolo, un ISIN ni un importe.
- `dispatch_findings` (diaria, la primera del correo) lee el **último registro cerrado** de cada tarea productora y mantiene una racha por `(code, subject)` en `jobs/mail/notices/<code>--<subject>.json` (**un escritor**: el correo). Racha abierta y no avisada → reclamar el aviso (`sending`, `If-Match`), enviar, `sent`. Condición desaparecida en el último registro → la racha se cierra; si vuelve, es otra racha. Así se avisa **una vez por racha**, no una al día.
- Hallazgos: `source_failing` (fallos seguidos en el umbral), `currency_unchecked` (Q1), `thesis_horizon_exceeded`, `ecb_update_rejected`, `ecb_calendar_mismatch`, `backup_failed`, `backup_object_differs`, `integrity_errors`, `restore_rehearsal_differs`, `ledger_size_above_threshold`, y `task_failed` para cualquier tarea cerrada como `failed`.

### 5.5 El correo (E1, bloque 3)

- `Notifier` (`ports/notifier.ts`): `send({ subject, body }) → { ok: true } | { ok: false, code: "mail_recipient_unavailable" | "mail_recipient_invalid" | "mail_send_failed" | "mail_send_unknown" }`. `mail_send_failed` = SES rechazó con un error definitivo antes de aceptar; `mail_send_unknown` = tiempo agotado o red caída tras enviar la petición.
- `sesNotifier(sender: MailSender, parameters: ParameterStore, config)`: lee `/atlas/<env>/mail/recipient` en cada envío, lo valida, y llama a `MailSender.sendText({ from, to, subject, body })`. `MailSender` es la interfaz estrecha; `sdk-ses.ts` la implementa con `SendEmailCommand` (`Content.Simple`, `Body.Text` y `Subject` con `Charset: "UTF-8"`).
- La redacción: `contracts/mail.md` (**PROPUESTA** §7.2 (e)).

### 5.6 El recordatorio mensual (E1, bloque 4)

- Lee el libro con `appendOnlyLedger(objects).read()` (solo lectura), `reference/ecb/` y `prices/` con `referenceReader` (§8.2 M6), `access/last-web-sign-in.json` y el registro de tokens (`TokenRegistry.list()`).
- `contributionPlan(state, { date, settings, external })`, con `external` de los cierres que haya (`externalPricesOf`) y el histórico del BCE si cuadra con su manifiesto. Un fallo con código (`missing_amount`, `missing_manual_prices`, `missing_target_weights`…) o un libro que no carga **se dice en el correo** con su código, y el resto del correo sale igual.
- Reparto **por clase del núcleo**: la suma de `allocation_eur` de las filas de cada `asset_class`, como porcentaje de `core_amount_eur` (un decimal); los euros solo con el interruptor.

## 6. Formatos (el contrato que usa la 017)

- **Parámetros de SSM y variables `ATLAS_*`** (**PROPUESTA** §7.2 (a) y (b)): `contracts/ssm-and-config.md`.
- **Permisos de cada Lambda** (§2 del encargo; §8.2 B2): `contracts/iam-permissions.md`.
- **Registro de ejecución, rachas, objeto del inicio de sesión web y `positions.json`** (**PROPUESTA** §7.2 (d) y (f)): `data-model.md`.
- **Programaciones** (**PROPUESTA** §7.2 (c)), todas con `ScheduleExpressionTimezone = Europe/Madrid`, `FlexibleTimeWindow = OFF`, reintentos de Scheduler 2 y edad máxima 3.600 s, Lambda asíncrona con 0 reintentos y edad 3.600 s, concurrencia reservada 1, en el grupo `atlas-<entorno>-jobs` (el único etiquetable, questions §1.6):

| Función | Hora (Madrid) | Por qué |
|---|---|---|
| `atlas-<entorno>-job-backup` | 03:15 | de noche, fuera de 02:00-03:00 (cambio de hora) |
| `atlas-<entorno>-job-integrity` | 04:15 | después del volcado: el primer día del trimestre ensaya el volcado recién hecho |
| `atlas-<entorno>-job-prices` | 07:00 | pasada la medianoche GMT (cupo nuevo de EODHD), antes del día del usuario; `to = ayer` |
| `atlas-<entorno>-job-mail` | 08:00 | después de precios, volcado e integridad; recoge el hallazgo del BCE de la tarde anterior |
| `atlas-<entorno>-job-ecb` | 17:15 | el BCE publica hacia las 16:00 CET |

## 7. E2: las secuencias de escritura en S3

### 7.1 `EcbHistoryStore` sobre S3 (`s3-ecb-store.ts`)

El nombre del fichero en vigor es fijo por fuente (`eurofxref-hist.csv` o `api-exr.csv`, ADR-0029, tercera enmienda). `activate(next)`:

| Paso | Escritura | Qué ve un lector (API, web, `active()`) si se corta **después** de este paso |
|---|---|---|
| 1 | leer `manifest.json` (ETag M) y el fichero en vigor (ETag F) | lo de antes |
| 2 | `previous/<fichero en vigor>` ← bytes en vigor (`If-Match` sobre el suyo, o `If-None-Match: *`) | lo de antes: manifiesto y fichero cuadran |
| 3 | `<fichero nuevo>` ← descarga (`If-Match` F si es el mismo nombre; `If-Match`/`If-None-Match` sobre el suyo si cambia la fuente) | **mismo nombre**: el manifiesto viejo con el fichero nuevo, **que no cuadra con su SHA-256**: `EcbHistoryDamaged`, nunca «como si cuadrara». **Otro nombre**: lo de antes, más un fichero huérfano |
| 4 | `manifest.json` ← nuevo, `previous` apuntando a `previous/<fichero>` (`If-Match` M) | lo nuevo |

**Recuperación** (función pura `ecbRecovery`, `jobs/ecb-recovery.ts`): al empezar, si el manifiesto no cuadra con su fichero en vigor **y** `previous/<fichero>` tiene el SHA-256 del manifiesto → **deshacer**: el fichero en vigor ← `previous/` (`If-Match`), y la actualización del día sigue después. Cualquier otro desacuerdo → hallazgo `ecb_history_damaged` y no se escribe nada. `keepRejected`: `rejected/<instante>-<fichero>` (`If-None-Match: *`) y después el manifiesto (`If-Match`); un corte entre los dos deja un huérfano inocuo. **Primera activación**: fichero y manifiesto con `If-None-Match: *`.

### 7.2 `PriceStore` sobre S3 (`s3-price-store.ts`)

- `config()` **no lee S3**: devuelve el texto de un `config.json` construido con las variables de la función (§8.2 M5), para que `parsePriceConfig` lo lea como siempre.
- `transact(work)`: cada lectura guarda su ETag; cada escritura es `If-Match` sobre el ETag leído en **esa** transacción (o `If-None-Match: *` si no había objeto) y se hace en el momento; un `precondition_failed` lanza `PriceStoreConflict`, que aborta la ejecución sin reintentar (§8.1 P11).
- `writeSymbols` y `rewriteCloses` **se niegan** (`cloud_symbols_read_only`, `cloud_purge_refused`): segunda cerradura de Q1.
- Secuencias y cortes:
  - **reservar**: `_status.json` con la llamada añadida (`If-Match`) **antes** de llamar. Corte después: una llamada contada y no hecha (de más, nunca de menos).
  - **al final**: por cada activo, su `.jsonl` con las líneas nuevas (`If-Match`), y después `_status.json` con los resultados. Corte entre dos activos: los escritos quedan enteros (un `PutObject` es atómico), los otros no; la siguiente ejecución los ve como pendientes y no repite los escritos (las reglas de la 013 no añaden una línea igual). Corte antes del estado: los fallos seguidos de esa ejecución no se cuentan, y las reservas ya estaban escritas.

### 7.3 Las tareas diarias

- **BCE**: `updateEcbHistory({ source, store }, { firstRateDate, today })`, con `firstRateDate` del libro remoto. `rejected` → hallazgo `ecb_update_rejected` con `counts.conflicts = total` (sin divisas ni tipos); `accepted` con `calendar` no vacío → `ecb_calendar_mismatch` con el recuento.
- **Precios**: `updatePrices({ state, settings, today, now, store, sources, symbols: "read_only" })` (Q1), con las fuentes que tienen clave. Al terminar, la tarea lee `_status.json` para los recuentos de fallos seguidos y deja `source_failing` para cada fuente en `failing`; y deja `thesis_horizon_exceeded` para cada tesis abierta con `horizon_exceeded` de `bucketPositions`. Sin claves: `prices_no_keys`, sin descarga ni hallazgos.
- **`atlas admin prices push`**: `symbolsPushPlan(local, remote)` en el dominio (la diferencia y las negativas), la orden con `confirmEnvironment`.

## 8. E4: el volcado mensual

`backups/<YYYY-MM>/` del mes de Madrid, en este orden, **cada objeto con `If-None-Match: *`**:

1. `ledger.jsonl` ← los bytes del libro remoto, tal cual.
2. `positions.json` ← calculado **del `ledger.jsonl` del volcado** (el de la carpeta si ya existía), con los precios y el BCE del momento.
3. `reference/ecb/<fichero en vigor>` y después `reference/ecb/manifest.json`.
4. `prices/<cada objeto del primer nivel>`.
5. Cerrar el registro con la lista de objetos y su SHA-256.

- Un objeto que **ya existe**: si sus bytes son los que se iban a escribir, se deja; si no, **en un reintento del mismo periodo** es del intento anterior (solo esta función escribe `backups/`) y **se deja**, apuntado en el registro como `kept_from_earlier_attempt`; fuera de ese caso (no hay registro del periodo), `backup_object_differs`, y no se escribe nada más.
- El par del BCE: si el fichero del volcado existe y el manifiesto no, y el manifiesto vivo ya no cuadra con él, hallazgo `backup_ecb_inconsistent` en vez de escribir un manifiesto que no le corresponde.
- Test de corte entre cada par de objetos.

## 9. E4: integridad, ensayo y tamaño

1. `deepCheck` del libro vivo (`@atlas/domain/tools`): sus errores son `integrity_errors` con el recuento por código (Q7).
2. **Ensayo** (`rehearsal.ts`): el último volcado cerrado (del registro de `monthly_backup`) se carga en un almacén en memoria y se proyecta; el libro vivo se **restringe a los identificadores del volcado**, en el orden del vivo, y se proyecta; se comparan lotes, efectivo y proyección fiscal por identificador. Un evento del volcado que falta en el vivo, o con otros bytes, o cualquier diferencia de proyección: `restore_rehearsal_differs`, con los códigos de lo que difiere y sin importes.
3. **Tamaño**: los bytes del libro leídos; por encima de `ATLAS_LEDGER_SIZE_WARNING_BYTES` (1.048.576 por defecto), `ledger_size_above_threshold` con el tamaño y el umbral (no son importes).

## 10. E3 y los avisos periódicos, en resumen

### 10.1 La consola (E3, bloque 1)

`atlas prices update` en una carpeta con `sync/remote.json`: baja `GET /api/reference/index` y los `prices/<name>` cambiados (`If-None-Match` sobre la versión que guarda), **fuera del cerrojo**; dentro, compara y añade con las reglas de la 013, conservando `source` y `fetched_at`. **PROPUESTA** (§7.2 (g)): la opción explícita para llamar a las fuentes es `atlas prices update --from-sources`, que imprime que gasta el cupo compartido con la nube. `atlas prices status` dice «de la nube, <fecha>» o «de las fuentes, <fecha>».

### 10.2 La web (E3, bloque 2)

Un módulo perezoso que baja `manifest.json` y el fichero en vigor, comprueba el SHA-256 con `crypto.subtle` y lo guarda como hoy la copia importada, marcado como de la nube. Solo a petición o al abrir la tarjeta del BCE. Los precios, si caben (Q8).

### 10.3 `notification_email` (E3, bloque 3)

`mergeSettings` (`settings.ts:734`) lo deja fuera, igual que ya deja fuera `wash_sale_window_days`: lo usan la web (`view-models/settings.ts:369`) y la consola (`catalogue.ts:502`), y el generador sintético **no** pasa por ahí, así que el *golden* no cambia (§8.2 M7). Ajustes deja de ofrecerlo.

### 10.4 Los avisos periódicos (E4, bloque 3)

`weekly_review`: `coreWeights` (sus avisos `deviation_above_threshold`) y `bucketStats` (reglas 17 y 18), solo por código y `details` enumerados. `tax_return_ready`: la propuesta del ejercicio anterior, contando notas y criterios en disputa. `informative_thresholds`: `model720`/`model721`, que solo leen valoraciones manuales, contra `model_720_alert_threshold_eur` y `model_721_alert_threshold_eur`.

## 11. Cómo se ejercita todo en local, sin AWS (**PROPUESTA** §7.2 (h))

Un guion en el *scratchpad* (`016-exercise.mjs`, nunca en el repositorio) compone cada familia con los dobles de S3, SSM y SES, un reloj fijo y el `Notifier` de fichero, que escribe cada correo en `…/scratchpad/016-mail/<fecha>-<tarea>.txt`. Recorre: el recordatorio con el interruptor apagado y encendido, cada aviso, un corte en cada hueco. **Ningún doble es alcanzable desde `jobs.zip`** (G8), salvo la fuente simulada, declarada. Las capturas de E3, como en la 015, con el servidor local de la 015 (`test/support/local-server.ts`) y Chromium, a `~/personal/atlas/privado/capturas/<fecha>-016-e3/`.

## 12. El paquete web: la partida y la estimación trozo a trozo

**Partida medida** (questions §4): arranque **74.125** (techo 74.134), total **301.439** (techo 301.496). Autorización: arranque +0; total hasta **304.568**.

| Trozo (E3) | Estimación gzip | Dónde |
|---|---|---|
| Descarga del BCE de la nube (índice, manifiesto, fichero, SHA-256, guardado) | 0,9-1,2 KB | perezoso, en el trozo de la tarjeta del BCE |
| Textos nuevos (procedencia «nube», errores) | 0,2-0,3 KB | perezoso |
| Precios del móvil (índice, cada fichero, filtro con `symbols.json`, guardado) | 1,2-1,8 KB | perezoso |
| `notification_email` fuera de Ajustes | −0,1 KB | perezoso |
| Lectura tolerante de `job_frequencies` en Ajustes | 0,1-0,2 KB | perezoso |
| **Total** | **2,3-3,4 KB** | arranque +0 |

Con los precios del móvil, **puede no caber** (Q8): se construye y se mide primero el BCE; los precios, solo si caben.

## 13. Mutación, gemelos y salida fiscal

- **Guion de mutación**: una copia del de la 015 (`016-mutate.mjs` en el *scratchpad*): afirma cada sustitución, restaura y compara byte a byte, se niega con gemelos `.js` y exige el mensaje de la regla. Lotes de cuatro a ocho, de uno en uno, detrás de la puerta de memoria (`016-gate.sh`).
- **Tubería**: `016-pipeline.sh` (lint, typecheck, las dos pasadas de cobertura dos veces, build), sin nada en paralelo.
- **Predicción fiscal**: questions §8, escrita antes de correr nada.

## 14. Orden de trabajo tras el visto bueno (E1)

1. Bloque 1: guardianes G1-G8 con los módulos vacíos, vistos en rojo; `apps/jobs` como *workspace* (paquete, `tsconfig`, proyecto de Vitest, referencia en el `tsconfig` raíz).
2. Instalar `@aws-sdk/client-sesv2@3.1141.0` y cambiar G4 en el mismo commit.
3. Bloque 2: `event`, `config`, `catalog`, `frequencies`, `periods`, `due`, `run-record`, `notices`, cada uno con su test en rojo primero; `jobs-store`, `compose`, `handler`, `log`, `build-lambda`.
4. Bloque 3: `Notifier`, `amounts`, `mail/`, `sdk-ses`, `mail.ts`, el `Notifier` de fichero.
5. Bloque 4: `reminder`, `sign-in` y el cambio de la API, `tasks/mail.ts` con `monthly_reminder` y `dispatch_findings`.
6. Autocomprobación de §5, capturas de los correos, congelar, PR.

Cada 2-3 commits, `lint` + `typecheck` y empujar.

## 15. Cómo se aplica cada respuesta de §8

| Respuesta | Dónde | Test que la ata |
|---|---|---|
| P1 | la rama sale de `ae66814`, con la 015 entera | questions §0 |
| P2 | §2 | — |
| P3 | `apps/jobs`, G1 | G1 |
| P4, B2 | cinco funciones, `ATLAS_JOBS` de una familia, hallazgos en `jobs/`, `contracts/iam-permissions.md` | R17, R19, G3 |
| P5 | §5.2 (Q2) | R8, R9 |
| P6 | `access/last-web-sign-in.json` (Q3), E1 bloque 4, zona Z1 | R14, R16 |
| P6 bis, M1 | Q4, E2 | bloque 0.2 de E2 y su test de ida y vuelta |
| P7 | §10.1, §10.2, Q8 | R34-R37 |
| P8 | G4, E1 paso 2 de §14 | G4 |
| P9 | `contracts/mail.md`, R1-R3 | R1, R2, R3 |
| P10 | §5.3, Q5 | R10, R20 |
| P11, M5 | concurrencia 1 (`contracts/iam-permissions.md` §7), §7.2, variables de precios | R22, R23, R32 |
| P12, M7 | §10.3 | R38 |
| P13 | §12, Q8 | G5 y `check-bundle.mjs` |
| P14, m3 | `ATLAS_PRICE_SOURCES=simulated`, G8 | R28, G8 |
| P15 | §5.2, `periods.ts` | R11 |
| P16 | §10.1: la consola no cambia con el BCE | — |
| P17 | redacción en questions «Documentos» en E3 | — |
| P18, M4 | §7.3, `atlas admin prices push` | R24 |
| `--yes` | R24, R48 | R48 |
| B1 | solo `horizon_exceeded` | R30 |
| M2 | un solo lector del interruptor | R4, R5 |
| M3 | `contracts/ssm-and-config.md` §1 | — (la 017) |
| M6 | §5.6 | R8 |
| m1, m2 | sin cambios que hacer | — |

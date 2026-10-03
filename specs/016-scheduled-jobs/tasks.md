# Tareas: `016-scheduled-jobs`

Agrupadas por entrega (§2 del encargo). Cada tarea de código empieza por su test en rojo. `[G…]` y `[R…]` son las reglas de `plan.md` §4. E2 a E4 se detallan al empezar cada entrega, con su bloque 0.

## E1 — El esqueleto, el correo y el recordatorio mensual

### Bloque 1: los guardianes, antes que el código

- [x] T101 Sacar el lector del grafo de `tests/api-access.test.ts` a `tests/support/source-graph.ts`, sin cambiar la cuenta de sus tests (28)
- [x] T102 `apps/jobs` como *workspace*: `package.json` (`@atlas/jobs`), `tsconfig.json` y `tsconfig.test.json`, referencia en el `tsconfig` raíz, proyecto `jobs` en `vitest.config.ts`, módulos vacíos
- [x] T103 [G1] Regla de dependencias de `apps/jobs` y «nada importa `apps/jobs`» en `tests/architecture.test.ts`
- [x] T104 [G2, G3, G5, G6, R5] `tests/jobs-access.test.ts`: tareas inalcanzables desde web, consola y API por el grafo; la API sin `Notifier`, SES ni claves; el correo sin claves; el reloj; un solo lector del interruptor; batería de elusiones
- [x] T105 [G8] `tests/jobs-package.test.ts`: `jobs.zip` sin dobles ni tests, determinista, y que no arranca sin configuración
- [x] T106 [G5] `check-bundle.mjs`: `apps/jobs/` y `domain/src/jobs` en `FORBIDDEN_IN_WEB`
- [x] T107 [G7] `apps/jobs/test/sentinels.test.ts` con el manejador vacío

### Instalación

- [x] T108 [G4] `@aws-sdk/client-sesv2@3.1141.0` en `packages/adapters`, con el guardián de dependencias y de órdenes del SDK cambiados en el mismo commit

### Bloque 2: el esqueleto

- [x] T109 [R12] `domain/src/jobs/event.ts`
- [x] T110 [R17] `domain/src/jobs/config.ts`
- [x] T111 [R9] `domain/src/settings/job-frequencies.ts` (catálogo y lectura tolerante, escritura estricta)
- [x] T112 [R11] `domain/src/jobs/periods.ts`
- [x] T113 [R8, R10] `domain/src/jobs/run-record.ts` y `due.ts`
- [x] T114 [R19] `domain/src/jobs/notices.ts`
- [x] T115 `adapters/src/aws/jobs-store.ts` (registros y rachas sobre `ObjectStore`)
- [x] T116 [R17, R18] `apps/jobs/src/{compose,handler,log,lambda}.ts`
- [x] T117 P-H: `scripts/lambda-package.mjs` común; `apps/jobs/scripts/build-lambda.mjs`; `npm run build` construye `jobs.zip`

### Bloque 3: el correo

- [x] T118 [R6, R7] `ports/notifier.ts`, `adapters/src/aws/{sdk-ses,mail}.ts`, el `Notifier` de fichero en `adapters/test/`
- [x] T119 [R4] `domain/src/jobs/amounts.ts`
- [x] T120 [R1-R3, R20] `domain/src/jobs/mail/` (recordatorio y avisos de E1)

### Bloque 4: el recordatorio mensual

- [x] T121 [R13, R14] `domain/src/jobs/reminder.ts` y `sign-in.ts`
- [x] T122 [R16] la API avanza `access/last-web-sign-in.json` tras una sesión web
- [x] T123 [R8, R15, R19] `apps/jobs/src/tasks/mail.ts`: `monthly_reminder` y `dispatch_findings`
- [x] T124 `tests/messages.test.ts` con los códigos nuevos; capturas de los correos con el `Notifier` de fichero

### Cierre de E1

- [x] T125 Autocomprobación de §5 en `questions.md`, mutación por lotes, tubería completa, congelar y PR

## E2 — Los datos del día en la nube

- [x] T201 Traer `develop` tras la fusión de E1 (con la PR #102)
- [x] T202 Q1: `updatePrices({ symbols: "read_only" })` y el resultado `currency_unchecked`
- [x] T203 M1: `REFERENCE_NAME` de `prices/` por ida y vuelta con `priceFileName`; `_status.json` y `config.json` no se sirven
- [x] T204 Bloque 0 en `questions.md` §14.1
- [x] T205 El cupo de la nube en variables (18/23, umbral 3), `simulated` negada en `prod`, `cloudPriceConfigText`
- [x] T206 Hallazgos del BCE y de los precios (`PRODUCER_FINDINGS`) y su redacción en el correo
- [x] T207 `ecbRecovery` y los almacenes de S3 (`S3EcbHistoryStore`, `S3PriceStore`), las claves de SSM y la fuente simulada, detrás de `@atlas/adapters/aws-daily`
- [x] T208 Las tareas `ecb_update` y `prices_update` en `apps/jobs`, con `fetch` limitado a 15 s
- [x] T209 Guardianes: escritores diarios dentro de las tareas diarias; un solo escritor por objeto en `prices/`; centinelas de las tareas diarias (con la consola de Node)
- [x] T210 `atlas admin prices push` (bloque 3): `symbolsPushPlan` y la orden
- [x] T211 Contratos al día (`mail.md`, `iam-permissions.md` §8 y §9) y el plan
- [x] T212 Autocomprobación de §5, mutación por lotes, tubería completa, congelar y PR

## E3 — Los dispositivos beben de la nube

- [x] T301 Traer `develop` tras la fusión de E2
- [x] T302 N2 de §15: 2 y 2 por defecto en una carpeta que comparte los planes con la nube (`parsePriceConfig`, `updatePrices`)
- [x] T303 Observación de la ronda 3: `prices_file_unreadable` y el recuento en el registro
- [x] T304 §15.5: el almacén del BCE escribe solo sobre el manifiesto que leyó `active()`
- [x] T305 El procedimiento del histórico del BCE en la nube (`runbooks/`)
- [x] T306 Bloque 3: `notification_email` fuera de las fotos nuevas y de Ajustes; la redacción de `alert_channels` en §6
- [x] T307 Bloque 1: `quotes/cloud.ts`, el cliente de los datos de referencia, `_cloud.json`, `atlas prices update` desde la nube, `--from-sources`, la procedencia en `status`
- [x] T308 Bloque 2: la web baja el BCE de la nube (el SHA-256, la regla del punto 2, solo al abrir la tarjeta o a petición)
- [ ] T309 Bloque 2: los precios del móvil — **no caben en P13** (§17.4, Q8): no se construyen
- [x] T310 Autocomprobación de §5, mutación, tubería completa, congelar y PR

- **Anotado de la revisión de la PR #106 (N2 de fuentes y S3; decisión de la dirección, 2026-09-27)**: cuando la consola esté configurada para bajar los precios de la nube, su presupuesto por defecto pasa a ser **el sobrante del plan** (2 llamadas de EODHD y 2 de Alpha Vantage), salvo que su `prices/config.json` diga otra cosa. Hoy, sin ese fichero, la consola usa 20 y 25 y, con la nube gastando 18 y 23, puede pasarse del cupo del plan gratuito. **La revisión de E3 lo comprueba.**

## E4 — Copias, integridad y avisos periódicos

- [x] T401 Traer `develop` tras la fusión de E3 (PR #108)
- [x] T402 Bloque 0 en `questions.md` §20.1
- [x] T403 `ATLAS_LEDGER_SIZE_WARNING_BYTES` de la función de integridad (1.024 a 104.857.600)
- [x] T404 Los objetos del volcado en su registro (`objects`, solo `monthly_backup`)
- [x] T405 N3 de §15: `previous/` solo con el SHA-256 que el manifiesto dice de él (`previousHistoryOf`, `generations()`)
- [x] T406 [R40] `positions.json` (`positionsDocument`) y las decisiones del volcado (`dumpStep`, `dumpManifestStep`, `backupFindings`)
- [x] T407 [R41] El ensayo de restauración (`restoreRehearsal`, `latestDump`)
- [x] T408 [R42] Los hallazgos de la integridad (`integrityFindings`, listas cerradas de códigos) y sus correos
- [x] T409 [R43, R44] La revisión semanal, la Renta y los modelos 720 y 721 (`reviewFacts`, `taxReturnFacts`, `informativeFacts`) y sus correos
- [x] T410 Las tareas `monthly_backup`, `quarterly_integrity`, `weekly_review`, `tax_return_ready` e `informative_thresholds` en `apps/jobs`; todo el catálogo tiene su *runner*
- [x] T411 Guardianes: los avisos de enero no alcanzan ningún precio; centinelas de las tareas de E4; códigos solo del correo en `tests/messages.test.ts`
- [x] T412 [R45] Los procedimientos (`runbooks/`) y su ensayo versionado (`tests/runbook-016.test.ts`)
- [x] T413 Contratos al día (`iam-permissions.md` §4, §5, §8 y §9, `mail.md`, `data-model.md` §1 y §4) y la lista de documentos de la 016 entera (questions §20.8)
- [x] T414 Autocomprobación de §5, mutación, tubería completa, congelar y PR

- **Anotado de la revisión de la PR #106 (N3 de fuentes y S3)**: quien use `manifest.previous` de `reference/ecb/` (un procedimiento de restauración, el volcado) **verifica su SHA-256** antes de usarlo: un corte entre los pasos 1 y 2 de una activación deja `previous/` con otro contenido que el que dice el manifiesto. **Hecho en E4 (T405)**: la reconstrucción solo compara con `previous/` si cuadra; el volcado no copia `previous/`; el procedimiento del BCE lo manda comprobar.

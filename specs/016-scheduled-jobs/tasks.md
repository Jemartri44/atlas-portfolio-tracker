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

Bloque 0 (questions §2), almacenes de S3, tareas diarias, `atlas admin prices push`. Se detalla al empezar.

## E3 — Los dispositivos beben de la nube

Consola, web, `notification_email`. Se detalla al empezar.

## E4 — Copias, integridad y avisos periódicos

Volcado, integridad, avisos, procedimientos. Se detalla al empezar.

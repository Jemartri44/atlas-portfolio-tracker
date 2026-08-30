# Prompt 000 — Relevo del asistente de dirección

> Para el asistente que toma el relevo de la **dirección** del proyecto (no de la implementación). Segunda versión, escrita el 2026-08-30 por el segundo director saliente tras cerrar la Fase 1 (features 001 y 002). Léelo entero antes de hablar con el usuario. Si trabajas como Claude Code en `~/projects/atlas-portfolio-tracker`, la memoria de sesión (`~/.claude/projects/-home-jemar-projects-atlas-portfolio-tracker/memory/`) ya contiene las preferencias del usuario y el estado de las features; este documento las repite para cualquier otro asistente.

---

## 1. Tu rol

Diriges **Atlas Portfolio Tracker** a alto nivel: rondas de decisión, ADRs, especificación y esquema de datos, prompts de traspaso para los asistentes implementadores (`docs/prompts/NNN-*.md`), revisión de sus specs, planes y PRs, y coordinación de lo que el usuario tiene que hacer fuera del código (extractos, asesor fiscal, AWS). **No escribes código de la aplicación**: eso lo hacen otros asistentes desde tus prompts. Conversas con el usuario en español.

## 2. Cómo trabaja el usuario contigo (reglas duras)

- **Consulta antes de** instalar herramientas o paquetes, añadir configuración de tooling no pedida, y sobre todo antes de **cambiar de rumbo** (reordenar fases, mover tareas, alterar el plan). Registrar en los documentos una decisión que el usuario acaba de confirmar está bien; tomar una decisión nueva y committearla, no. Abrir una PR de documentos que forma parte de un plan que él ya ha aprobado ("me parece todo bien") está bien.
- **No preguntes por preguntar.** Cada pregunta lleva contexto, opciones con ventajas e inconvenientes y una recomendación clara. El patrón que funciona es la "ronda": 1-5 decisiones relacionadas, él contesta ("confirmo lo que propones"), tú registras (ADR, esquema, spec, prompt) y abres la PR. Cuando escribas un prompt de feature, lista al final las **decisiones que ese prompt fija** y pídele confirmación de esas antes de committear.
- Commits: **Conventional Commits en inglés, solo línea de asunto (≤ 72), atómicos, sin rastro de IA**. Lo verifican `.githooks/commit-msg` y `.claude/hooks/check-git-commit.py`; este último es un hook *PreToolUse* que **bloquea el comando entero de Bash** si algún `git commit -m` del comando supera 72 caracteres o no cumple el formato: si te pasa, no se ejecutó nada, acorta el asunto y repite. Git flow con git básico: ramas `feature/*` (o `fix/*`) desde `develop`, PR a `develop` con la plantilla `.github/pull_request_template.md` (checklist de la constitución rellena con honestidad), **el usuario fusiona**. Nunca push directo a `develop`/`main`.
- Todo lo técnico en inglés; documentos de `docs/`, specs y constitución en español con identificadores en inglés.
- Privacidad: el repo es público. Nada personal, ningún importe real, ningún identificador de cuenta. Los ficheros reales viven en `~/atlas-private/` (`statements/<broker>/`, `ui-refs/`, `reviews/`). Al inspeccionarlos, muestra solo estructura y **nunca** las filas de cabecera (nombre, DNI, IBAN). Al usuario **no le importa** que su correo personal aparezca en commits: no lo menciones.
- Le gusta que se le explique con detalle y que se le diga lo que no está bien; no le gusta que se den por sentadas decisiones ni que se hagan cosas "de más". Prefiere mensajes con estructura (qué se verificó, hallazgos ordenados por importancia, qué se necesita de él).
- **Revisión de PRs**: las dos primeras PRs de código (#10, #12) las fusionó antes de que yo las revisara; a partir de la #15 pidió expresamente la revisión **antes** de fusionar, y así conviene seguir. Él hace de correo entre tú y el implementador: te pega el resumen final del implementador y tú le devuelves un texto para que se lo pase (deja ese texto en una cita, listo para copiar).

## 3. Estado del proyecto (2026-08-30, final del día)

- **Fase 1 completa** y fusionada en `develop`: PRs #1-#15 (todas fusionadas, ninguna abierta). Historial: docs y Spec Kit (#1-#9), feature 001 (#10), documentos de revisión (#11), correcciones de la 001 (#12), prompt 002 y enmiendas (#13, #14), feature 002 (#15).
- **Código en `develop`**: monorepo npm workspaces; `packages/domain` (dinero exacto sobre `big.js` vendorizada, 23 tipos de evento con validación de forma, huella, cadena de migraciones vacía en v1, codec de línea que rechaza versiones futuras, proyección cronológica de tres pasadas con FIFO global, ganancias, rendimientos, órdenes y traspasos pendientes, eventos corporativos con cinco primitivas y tabla por `kind`, tesis del cubo, `valuations(date)`, `integrity`; casos de uso `recordEvent`, `reverseEvent`, `correctEvent`, `loadAndProject`), `packages/adapters` (`MemoryLedgerStore`, `FileLedgerStore` atómico, reloj y aleatoriedad del sistema), `apps/cli` (`atlas`, mensajes en español, asistentes `atlas ca <kind>` con tabla antes/después, `atlas thesis`, `atlas valuations`, `edit`/`delete` como rectificación). **282 tests, cobertura 100 % de líneas y ramas en el dominio**, Biome limpio, CI en verde. Toolchain: Node 22, TypeScript 7.0.2, Biome 2.5.11, Vitest 4.1.11 + fast-check 4.9, `tsc -b` con `tsconfig.test.json` por paquete; el binario es `apps/cli/dist/main.js`.
- **Documentación**: `docs/data-schema.md` sigue en `schema_version = 1` (formato: la verdad por encima de la spec cuando difieren; tras las revisiones de 001 y 002 incluye `asset_type`, `unit_price?` obligatorio solo sin `amount`, `asset_updated` con `asset_type`/`currency` inmutables, `effects[].asset_id?`, `forced_sale.per_account[].fee?`, `ratio` decimal o fracción `"nuevas/antiguas"`, `sell.thesis_id?`, tesis en la primera pasada, ejemplo de fusión corregido); ADR-0001..0013 aceptados (0007 con el puerto `RandomSource`; 0011 con nota remitiendo a §6.5 para la forma vigente de `forced_sale`/`grant`); constitución v1.3.0; `docs/decision-roadmap.md` (rondas 1-5 cerradas, Fase 1 fusionada, 6-9 pendientes); `docs/fiscal-questions.md` con **13 preguntas** (la 13, compensación en efectivo de fusiones, es de la 002); `docs/dependencies.md`; `docs/statements/myinvestor.md`.
- **Fase 0**: MyInvestor recibido (cuenta vacía; falta la exportación de operaciones de fondos, que existirá tras la primera suscripción); **IBKR aún no está listo** (`~/atlas-private/statements/ibkr/` vacío); `ui-refs/` vacío; AWS y Yahoo diferidos a antes de la Fase 4.
- **Implementador**: es Claude Code, trabaja en worktrees `~/projects/atlas-portfolio-tracker-NNN` (001 y 002 existen; la rama 002 ya está fusionada). Ha demostrado entregar bien: specs completos, tests de propiedades, `questions.md` con dudas fundadas y notas de implementación. Sus dudas suelen destapar huecos reales del esquema (Q1 de la 002 destapó un ejemplo erróneo; la revisión del ratio decimal salió de leer su supuesto A2).

## 4. Qué leer, en este orden

1. `CLAUDE.md` (todo; incluye reglas para implementadores y arquitectura).
2. `.specify/memory/constitution.md`.
3. `docs/decision-roadmap.md`.
4. `docs/adr/README.md` y los trece ADRs.
5. `docs/data-schema.md`; después `docs/business-rules.md` y `docs/specification.md` (§4.1 y §14 son anteriores a varios ADRs; se actualizan cuando toque).
6. `docs/prompts/README.md`, y los prompts `001-ledger-core.md`, `001-review-fixes.md`, `002-corporate-actions.md` y `review-challenge-decisions.md`: son la plantilla de los siguientes.
7. `specs/001-ledger-core/` y `specs/002-corporate-actions/` (spec, plan, data-model, contracts, `questions.md` con las notas de implementación, y `research.md` de la 002 §1 con los seguimientos para features posteriores).
8. En el código, lo que hay que conocer para revisar: `packages/domain/src/projections/{project-ledger,lots,operations,primitives,kind-rules,corporate-actions,theses}.ts`, `schema/{validate,fingerprint,line}.ts`, `usecases/{record-event,rectify}.ts`, `packages/adapters/src/ledger-store/file.ts`.
9. `docs/fiscal-questions.md`, `docs/dependencies.md`, `docs/statements/myinvestor.md`, `~/atlas-private/reviews/2026-08-30-challenge.md`.
10. `git log --oneline --graph develop` y `gh pr list --state all`.

## 5. Cómo revisar una PR del implementador (procedimiento que ha funcionado)

1. `gh pr view <n>` (estado, checks) y `git log --format='%h %s' <base>..<head>`: asuntos ≤ 72, sin cuerpos, sin menciones a IA; `git diff --name-only <base> <head> -- docs .githooks .claude .specify CLAUDE.md .github` debe estar vacío salvo lo permitido.
2. En el worktree del implementador, **build limpio**: `rm -rf packages/*/dist packages/*/dist-test apps/cli/dist apps/cli/dist-test tests/dist coverage; find . -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete; npm ci; npm run lint; npm run typecheck; npm run test:coverage; npm audit --audit-level=high; npm run build`. Sin el borrado de `*.tsbuildinfo` (git-ignorados, en la raíz de cada paquete) `tsc -b` puede fallar con TS6305 al cambiar de rama aunque la CI esté en verde. `packages/domain/package.json` sin `dependencies`; lockfile sin paquetes no-dev.
3. Leer con lupa lo que toca lotes, dinero y fichero; comparar cada regla con `data-schema.md` y los ADRs, no con la spec de la feature.
4. **Prueba de humo con el binario** sobre un libro en el scratchpad (nunca en el repo): registrar unas operaciones inventadas y comprobar a mano la aritmética (`atlas lots`, `gains`, `cash`, `check`, y el prefijo del fichero byte a byte tras un `append`).
5. Cotejar los nombres de los tests con los casos límite obligatorios (constitución VII y §3.7 del prompt).
6. Informar: qué se verificó, hallazgos ordenados por importancia con recomendación (bloquea / corrige en `fix/*` / anota para el siguiente prompt), y el texto para el implementador.

## 6. Lo que este director tenía en mente y no está escrito en ningún sitio

**Prompt 003 — `synthetic-data`** (el siguiente; escribirlo con la estructura del 002: qué leer, flujo, reglas, alcance por bloques, fuera de alcance, criterios de terminado, decisiones que el prompt fija). Contenido previsto:
- Generador de libros sintéticos (`atlas synth`), determinista por semilla, con los eventos raros: contrasplit en dos cuentas, traspaso parcial encadenado, corrección de un ejercicio anterior, fusión de fondos sobre lotes traspasados, tesis abiertas y cerradas, órdenes y solicitudes pendientes, registro tardío. Fixture de libro completo en `tests/fixtures/ledger/` (sintético: ids `acc_*`/`ast_*`, ISIN `XX…`, importes redondos) que sirva de *golden file* a las features siguientes.
- `compact` (data-schema §5): archivo en `archive/`, reescritura a la versión actual, prueba de que la proyección antes y después es idéntica.
- Una **migración real de prueba** v1→v2 solo en tests (cadena `MIGRATIONS` con un paso ficticio inyectado), para ejercitar `migrate` y el cargador con líneas antiguas; sin cambiar `CURRENT_SCHEMA_VERSION`.
- `integrity` completa: `dangling_reference` (data-model 001 §3.2 lo listaba y no se implementó porque los errores de proyección lo cubren), comprobación de que el libro reproyecta igual desde el fixture, y `atlas check --deep`.
- Tooling: `tsBuildInfoFile` dentro de `dist/` para que `rm -rf dist` resetee el estado incremental (el problema TS6305 de §5); revisar si `atlas backup` (exportación a disco local, Ronda 8) cabe ya como comando trivial sobre `FileLedgerStore` — es un `cp`, pero conviene tenerlo antes de que exista S3.
- Seguimientos de `specs/002-corporate-actions/research.md` §1 que **no** van a la 003: `broker_ref`/`source` en `corporate_action` para deduplicar la importación de IBKR (esquema; decidir en la Ronda 6 y aplicar en la 005), ajuste de cotizaciones históricas tras un `scale` cuando existan precios (Ronda 6), ex-date frente a fecha de entrega (solo si aparece un caso real).

**Prompt 004 — `myinvestor-import`**: adaptador `StatementSource` para el xlsx de efectivo y la exportación de operaciones de fondos (pendiente de ver; pídesela al usuario tras su primera suscripción). Importar propone, el usuario confirma; cierra órdenes y traspasos pendientes; huella con referencia del bróker. Fixtures sintéticas con el formato real (`docs/statements/myinvestor.md`).

**Prompt 005 — `ibkr-flex-import`**: Flex Query XML (Trades, Cash Transactions, Corporate Actions, Transfers, Open Positions) → eventos; conciliación de posiciones y efectivo por cuenta. Necesita el XML real en `~/atlas-private/statements/ibkr/`.

Después, Fase 2 (calculadora de aportación, desviaciones, umbrales) sobre `settings_changed` y precios manuales; la web llega con la Ronda 7. Antes de la Fase 2: repetir el *challenge* con `docs/prompts/review-challenge-decisions.md` (ahora también sobre el código) y triar como la primera vez.

**Ronda 6 (importadores y precios)**: se abre cuando existan la exportación de operaciones de fondos y el XML de IBKR. Decisiones: mapeo de campos, política de huella por origen (incluido `corporate_action`), cierre automático de órdenes y traspasos desde la importación, caché de precios y respaldo si Lambda queda bloqueada, ajuste de precios históricos tras `scale`.

**Ronda 7 (web)**, recomendaciones heredadas: **Solid** ligeramente por delante de Svelte (Biome lo formatea); **Pico CSS vendorizada** + componentes propios, **uPlot** vendorizada para las gráficas del cubo; **modo privacidad** con un único componente `Amount` que enmascara, activado por defecto, porcentajes visibles; PWA con el libro cacheado (decidir si se cifra en el dispositivo); Cognito Hosted UI; API mínima sobre Function URL con `load`/`append` y ETag; interfaz en español sin i18n. Pídele las capturas de `~/atlas-private/ui-refs/` antes de abrir la ronda.

**Ronda 8 (infra)**: una cuenta de AWS con dos pilas (`dev`/`prod`) con sufijo, Terraform por directorio de entorno, bootstrap del estado en S3, OIDC desde GitHub Actions, copia del libro fuera de AWS (`atlas backup`), alerta de Budgets a 1 $, recordatorio anual de rotación del token de IBKR. Antes: Paid Plan y prueba de Yahoo desde una Lambda real.

**Ronda 9 (fiscal)**: salida por casilla con detalle por operación; regla de recompra con diferimiento completo (decidida); pérdidas pendientes por ejercicio; lotes de divisa (`fx_exchange` guarda los datos); **compensación en efectivo de fusiones** según la respuesta a la pregunta fiscal 13 (si "reduce el coste de las nuevas", primitiva nueva con ADR; hoy es venta parcial con `raw`).

**Otros hilos**:
- `docs/fiscal-questions.md`: el usuario se lo llevará al asesor; cada respuesta es un valor de `Settings` o una nota en `business-rules.md`, nunca un cambio de esquema (salvo la 13, que puede exigir una primitiva).
- Incoherencias conocidas y aceptadas: ADR-0003 usa `reverses_transaction_id` y el esquema `reverses_id` (manda el esquema); ADR-0011 describe `forced_sale`/`grant` en su forma original (manda §6.5, nota añadida); `docs/specification.md` §4.1 y §14 son anteriores a los ADRs; ADR-0007 admitía Node 24, se usa 22; `docs/prompts/001-ledger-core.md` §3.5 aún dice `dist/src/main.js` en un ejemplo (histórico, no se toca).
- Las ramas remotas fusionadas se borran a mano (o el usuario activa el borrado automático en GitHub); hoy quedan varias.
- Si el implementador **no** es Claude Code: `uvx --from git+https://github.com/github/spec-kit.git specify integration add <agente>` y que lea `AGENTS.md`.

## 7. Lo inmediato

1. `gh pr list --state all` y `git log --oneline develop -5`: confirma que la PR de este relevo (prompt 000 v2 + seguimientos de documentos de la 002) está fusionada.
2. Pregunta al usuario solo dos cosas: si el implementador está libre para la 003 y si hay novedades de IBKR o de la primera suscripción en MyInvestor (esas dos cosas desbloquean la Ronda 6 y las features 004/005).
3. Escribe **`docs/prompts/003-synthetic-data.md`** con el contenido de §6, enséñaselo al usuario **antes** de committear (fichero sin seguimiento en `develop`), con la lista de decisiones que fija; tras su confirmación, PR de documentos (prompt + índice + hoja de ruta + cualquier línea del esquema que necesite).
4. Revisa spec y plan de la 003 antes del código y la PR antes de que se fusione (§5).
5. Mantén `docs/decision-roadmap.md` y `docs/prompts/README.md` al día; registra cada decisión confirmada en su sitio y nada más.

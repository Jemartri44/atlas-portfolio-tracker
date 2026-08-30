# Prompt 000 — Relevo del asistente de dirección

> Para el asistente que toma el relevo de la **dirección** del proyecto (no de la implementación). Escrito el 2026-08-30 por el asistente saliente. Léelo entero antes de hablar con el usuario. Si trabajas como Claude Code en `~/projects/atlas-portfolio-tracker`, la memoria de sesión (`~/.claude/projects/-home-jemar-projects-atlas-portfolio-tracker/memory/`) ya contiene las preferencias del usuario; este documento las repite para cualquier otro asistente.

---

## 1. Tu rol

Diriges **Atlas Portfolio Tracker** a alto nivel: rondas de decisión, ADRs, especificación y esquema de datos, prompts de traspaso para los asistentes implementadores (`docs/prompts/NNN-*.md`), revisión de sus specs, planes y PRs, y coordinación de lo que el usuario tiene que hacer fuera del código (extractos, asesor fiscal, AWS). **No escribes código de la aplicación**: eso lo hacen otros asistentes desde tus prompts. Conversas con el usuario en español.

## 2. Cómo trabaja el usuario contigo (reglas duras)

- **Consulta antes de** instalar herramientas o paquetes, añadir configuración de tooling no pedida, hacer push, y sobre todo antes de **cambiar de rumbo** (reordenar fases, mover tareas, alterar el plan). Registrar en los documentos una decisión que el usuario acaba de confirmar está bien; tomar una decisión nueva y committearla, no.
- **No preguntes por preguntar.** Cada pregunta debe aportar de verdad: lleva contexto, opciones con ventajas e inconvenientes y una recomendación clara. El patrón que ha funcionado es "ronda": expones 1-4 decisiones relacionadas, él contesta, tú registras (ADR, esquema, spec) y committeas.
- Commits: **Conventional Commits en inglés, solo línea de asunto (≤ 72), atómicos, sin rastro de IA** (lo verifican `.githooks/commit-msg` y `.claude/hooks/check-git-commit.py`; si te rechazan, corrige el mensaje, no el hook). Git flow con git básico: ramas `feature/*` desde `develop`, PR a `develop`, **el usuario fusiona**. Nunca push directo a `develop`/`main`.
- Todo lo técnico en inglés; documentos de `docs/`, specs y constitución en español con identificadores en inglés.
- Privacidad: el repo es público. Nada personal, ningún importe real, ningún identificador de cuenta. Los ficheros reales viven en `~/atlas-private/` (extractos en `statements/<broker>/`, capturas en `ui-refs/`, informes de revisión en `reviews/`). Al inspeccionarlos, muestra solo estructura y **nunca** las filas de cabecera (contienen nombre, DNI, IBAN). Al usuario **no le importa** que su correo personal aparezca en commits: no vuelvas a mencionarlo.
- Le gusta que se le expliquen las cosas con detalle y que se le diga lo que no está bien; no le gusta que se den por sentadas decisiones ni que se hagan cosas "de más".

## 3. Estado del proyecto (2026-08-30)

- **Documentación completa y consolidada**: `docs/specification.md` (producto), `docs/business-rules.md`, `docs/data-schema.md` (formato del libro; es la verdad para el formato, por encima de la spec cuando difieren), `docs/adr/` (ADR-0001..0013, todos aceptados; 0013 con verificación fiscal pendiente), `.specify/memory/constitution.md` v1.3.0, `docs/decision-roadmap.md` (rondas 1-5 cerradas; 6-9 pendientes), `docs/dependencies.md`, `docs/fiscal-questions.md` (12 preguntas para el asesor), `docs/statements/myinvestor.md`.
- **Decisiones clave**: TypeScript en todo con `packages/domain` puro e isomorfo; S3 como único almacén, un `ledger/ledger.jsonl` con todos los eventos (operaciones, catálogo, `settings_changed`), `schema_version` por línea, migración al cargar, `compact` explícito; libro append-only (editar = `reversal` + evento correcto; anular algo ya consumido se rechaza); lotes como proyección; FIFO global por activo entre cuentas y prohibido el mismo activo en `core` y `bucket`; dinero con `big.js` vendorizada, cadenas en JSON, redondeo tardío half-up; `fx_rate` = tipo del BCE tal cual (divisa por EUR), `eur = amount / fx_rate`; `fiscal_date` y ventana de recompra por tipo de activo (parametrizadas, valores provisionales); traspaso = `transfer` atómico + eventos de seguimiento; órdenes pendientes con el mismo patrón; eventos corporativos = composición de 5 primitivas; arquitectura hexagonal con 7 puertos; CLI primero; Biome; cobertura 100 % en `domain`; MIT; **proyección cronológica** (catálogo/configuración/rectificaciones en orden de fichero; operaciones por `(fecha de negocio, posición)`), `data-schema.md` §7.1.
- **Proceso**: Spec Kit instalado (skills `/speckit-*` en `.claude/skills/`, no crea ramas); skill `/adr`; plantilla de PR con checklist de la constitución; hooks de git (`commit-msg`, `pre-commit` con gitleaks) activados con `core.hooksPath`; protección de ramas activa en GitHub; el historial se reescribió una vez a la dirección noreply.
- **Revisión externa (*challenge*)** hecha con `docs/prompts/review-challenge-decisions.md`: 10 hallazgos, todos aplicados (ADR-0012, ADR-0013). El patrón funcionó; repetirlo antes de cada fase.
- **Feature 001 (libro mayor + CLI) en marcha**: un asistente implementador trabaja en el worktree `~/projects/atlas-portfolio-tracker-001`, rama `feature/001-ledger-core`, con el prompt `docs/prompts/001-ledger-core.md`. Entregó spec, plan, research, data-model, contracts y 58 tareas; tres dudas (`specs/001-ledger-core/questions.md`) respondidas y recogidas en el prompt (§3 bis) y en `data-schema.md`; visto bueno dado; tiene permiso para committear los specs y empezar por las fases 1 y 2 (esqueleto y dinero). Cuando abra su PR, revísala contra los ADRs y la checklist antes de que el usuario la fusione.
- **Fase 0**: extractos de MyInvestor recibidos (cuenta vacía; falta la exportación de **operaciones de fondos**, que existirá tras la primera suscripción); cuenta de IBKR en apertura (Flex Query pendiente); AWS y prueba de Yahoo diferidos a antes de la Fase 4; P1/P2/P3 del plan privado no son prerrequisito.
- Máquina del usuario: WSL, Node 22 por nvm (default aún 20), `uv`, `gh`, gitleaks. Git configurado con la dirección noreply en este clon.

## 4. Qué leer, en este orden

1. `CLAUDE.md` (todo; incluye reglas para implementadores y arquitectura).
2. `.specify/memory/constitution.md`.
3. `docs/decision-roadmap.md` (qué está cerrado, qué queda y por qué en ese orden).
4. `docs/adr/README.md` y los trece ADRs.
5. `docs/data-schema.md`; después `docs/business-rules.md` y `docs/specification.md`.
6. `docs/prompts/README.md`, `docs/prompts/001-ledger-core.md` (con §2 bis y §3 bis) y `docs/prompts/review-challenge-decisions.md`.
7. `docs/fiscal-questions.md`, `docs/dependencies.md`, `docs/statements/myinvestor.md`.
8. En el worktree del implementador: `specs/001-ledger-core/` (spec, plan, research, data-model, contracts, tasks, questions).
9. `~/atlas-private/reviews/2026-08-30-challenge.md` (el informe del revisor; fuera del repo).
10. `git log --oneline --graph develop` y `gh pr list --state all` para ver el historial de PRs (#1-#8).

## 5. Lo que el asistente saliente tenía en mente y no está escrito en ningún sitio

**Corte de features de la Fase 1 y siguientes** (escribir cada prompt cuando la anterior esté fusionada, incorporando lo aprendido):
- **002 — corporate-actions**: las cinco primitivas (`scale`, `convert`, `carve_out`, `forced_sale`, `grant`) con `per_account[]`, la tabla por `kind` (`data-schema.md` §8.5), asistentes de la CLI por tipo, `thesis_opened`/`thesis_closed` con la validación de `buy` en `bucket`, proyección `valuations(date)`. Reutiliza `consume()` de `lots.ts` para `forced_sale`.
- **003 — synthetic-data**: generador de libros sintéticos con eventos raros (contrasplit en dos cuentas, traspaso parcial encadenado, corrección de ejercicio anterior), `compact` con archivo, una migración real de prueba (v1 → v2 ficticia en tests), `integrity` completa, fixture de libro en `tests/fixtures/ledger/`.
- **004 — myinvestor-import**: adaptador `StatementSource` para el xlsx de efectivo y, sobre todo, la exportación de operaciones de fondos (pendiente de ver). Regla: importar propone, el usuario confirma; cierra órdenes y traspasos pendientes; huella con referencia del bróker. Fixtures sintéticas con el formato real.
- **005 — ibkr-flex-import**: Flex Query XML (Trades, Cash Transactions, Corporate Actions, Transfers, Open Positions) → eventos; conciliación de posiciones y efectivo por cuenta.
- Después, Fase 2 (calculadora de aportación, desviaciones, umbrales) sobre `settings_changed` y precios manuales; la web llega con la Ronda 7.

**Revisión de PRs del implementador**: `gh pr diff <n>`; comprobar contra la checklist de la constitución, que `packages/domain/package.json` no tenga `dependencies`, que la cobertura sea 100 % y que los tests de FIFO cubran los casos límite obligatorios (constitución VII); leer con lupa `lots.ts`, `project-ledger.ts` (dos pasadas), `fingerprint.ts` y el `append` byte a byte. El usuario fusiona; tú dices si está listo.

**Ronda 6 (importadores y precios)**: se abre cuando existan la exportación de operaciones de fondos y el XML de IBKR. Decisiones previstas: mapeo de campos, política de huella por origen, cierre automático de órdenes y traspasos pendientes desde la importación, caché de precios y respaldo si Lambda queda bloqueada.

**Ronda 7 (web)**, recomendaciones que tenía preparadas: **Solid** ligeramente por delante de Svelte (Biome lo formatea; Svelte obligaría a Prettier en `apps/web`); **Pico CSS vendorizada** + componentes propios como sistema de UI (cero deps en runtime), **uPlot** vendorizada para las gráficas del cubo; **modo privacidad** con un único componente `Amount` que enmascara (`••••`), activado por defecto en cada inicio de sesión, porcentajes visibles, ejes de valor ocultos; consulta sin conexión como PWA con el libro cacheado (decidir si se cifra en el dispositivo); Cognito Hosted UI; API mínima sobre Function URL con `load`/`append` y ETag; interfaz en español sin i18n. El usuario aportará capturas en `~/atlas-private/ui-refs/` (Ghostfolio, Wealthfolio, apps bancarias); pídeselas antes de abrir la ronda.

**Ronda 8 (infra)**: una sola cuenta de AWS con dos pilas (`dev`/`prod`) con sufijo, Terraform por directorio de entorno, bootstrap del estado en S3, despliegue con OIDC desde GitHub Actions, **copia del libro fuera de AWS** (comando `atlas backup` que exporta a disco local), alerta de Budgets a 1 $, recordatorio anual de rotación del token de IBKR. Antes: pasar la cuenta al Paid Plan y probar Yahoo desde una Lambda real.

**Ronda 9 (fiscal)**: salida por casilla de la Renta con detalle por operación; diferimiento completo de la regla de recompra (ya decidido); pérdidas pendientes por ejercicio; **lotes de divisa** para diferencias de cambio (los eventos `fx_exchange` ya guardan los datos; falta la proyección, pendiente del asesor).

**Otros hilos**:
- `docs/fiscal-questions.md`: el usuario se lo llevará al asesor; cada respuesta se convierte en un valor de `Settings` o en una nota de `business-rules.md`, nunca en cambio de esquema.
- Repetir el *challenge* con otro asistente antes de las Fases 2, 4 y 5; triar los hallazgos como se hizo (aceptar / pregunta al asesor / elección real → preguntar).
- Pequeñas incoherencias conocidas y aceptadas: ADR-0003 usa `reverses_transaction_id` y el esquema `reverses_id` (manda el esquema); `docs/specification.md` §4.1 es anterior a varios ADRs y se actualiza cuando toca; ADR-0007 admitía Node 24, se usa 22.
- Las ramas remotas fusionadas se borran a mano (o el usuario activa el borrado automático en GitHub).
- Si el implementador **no** es Claude Code, hay que ejecutar `uvx --from git+https://github.com/github/spec-kit.git specify integration add <agente>` y hacerle leer `AGENTS.md`.

## 6. Lo inmediato

1. Comprueba `gh pr list` y `git log develop`: fusiona mentalmente lo que ya está (la PR #8 con las respuestas de la 001 y la corrección del hook debería estar en `develop`).
2. Pregunta al usuario por el estado del implementador (¿ha committeado los specs? ¿por qué fase va?) y por la cuenta de IBKR.
3. Cuando llegue la PR de la 001, revísala; después escribe `docs/prompts/002-corporate-actions.md` siguiendo la estructura del 001 (qué leer, flujo, reglas de operación, alcance por bloques, fuera de alcance, criterios de terminado, respuestas a dudas cuando las haya).
4. Mantén `docs/decision-roadmap.md` y `docs/prompts/README.md` al día; registra cada decisión confirmada en el sitio que le corresponde (ADR, esquema, reglas, spec) y nada más.

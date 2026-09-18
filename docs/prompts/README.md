# Prompts de traspaso a los asistentes implementadores

Un fichero por feature, numerado igual que `specs/NNN-<name>/`. Los escribe la dirección y el subagente implementador los lee directamente del repositorio (prompt 000, §3). Cada prompt es autocontenido: rol, qué leer, alcance, fuera de alcance, criterios de terminado, qué hacer si algo bloquea.

| Prompt | Feature | Estado |
|---|---|---|
| [000](000-director-handoff.md) | Relevo de la dirección: papel, ciclo de una feature con subagentes, procedimiento de revisión, estado, bloqueos y lecciones | **v5**, 2026-09-18 (PR #56): la dirección orquesta y no ejecuta; verificador, documentación e integración son agentes delegados |
| [001](001-ledger-core.md) | Libro mayor: esqueleto, dinero, eventos, proyecciones, FIFO, CLI | Fusionada (PR #10, 2026-08-30) |
| [001-fixes](001-review-fixes.md) | Correcciones tras la revisión de la PR #10 (`unit_price` opcional, `asset_type` inmutable, nits) | Fusionada (PR #12, 2026-08-30) |
| [002](002-corporate-actions.md) | Eventos corporativos (cinco primitivas, tabla por `kind`, asistentes de CLI), tesis del cubo, `valuations(date)` | Fusionada (PR #15, 2026-08-30) |
| [003](003-synthetic-data.md) | Datos sintéticos y *golden file*, `compact` con archivo del original, migración de prueba v1→v2, `integrity` completa (`check --deep`), `atlas backup`, tooling | Fusionada (PR #18, 2026-08-30) |
| [004](004-monthly-contribution.md) | Fase 2: bloque 0 del *challenge* 2 (ADR-0014/0015, validaciones), precios manuales, `atlas weights`, calculadora de aportación, simulador de traspaso, costes | Fusionada (PR #23, 2026-09-18) |
| [005](005-bucket-tracking.md) | Fase 3: patrimonio total desglosado, posiciones y P&L latente del cubo, tesis frente al índice, estadísticas de operativa, reglas 17-18 y aviso de recompra | Fusionada (PR #33, 2026-09-18) |
| [006](006-web-shell.md) | Web, primera mitad: esqueleto, almacenamiento en el navegador, navegación móvil, modo privacidad, Resumen y Movimientos | Fusionada (PR #36, 2026-09-18) |
| [007](007-web-analytics.md) | Web, segunda mitad: Núcleo, Cubo, gráficas con uPlot, asistentes de eventos corporativos/traspasos/tesis, `transfer_max_days`, calidad del frontend y manejo de errores | Fusionada (PR #47, 2026-09-18) |
| [008](008-fiscal-provisions.md) | Previsiones del esquema para la Fase 5 (ADR-0021): las nueve, el evento `swap`, y el endurecimiento de `fx_rate_date` con regeneración del *golden* | Fusionada (PR #51, 2026-09-18) |
| [009](009-tax-engine.md) | Fase 5, núcleo del motor fiscal: ejercicio consolidado, regla de recompra aplicada, compensaciones y arrastre, procedencia de cada cifra y marca de los criterios en disputa | En implementación desde 2026-09-18 (rama `feature/009-tax-engine`, aún sin PR) |
| [review](review-challenge-decisions.md) | Agente revisor: *challenge* de las decisiones tomadas (reutilizable antes de cada fase) | Tres *challenges*: 2026-08-30 (10 hallazgos, aplicados), 2026-08-31 (8, PR #20) y 2026-09-18 (7, PR #27), todos aceptados |

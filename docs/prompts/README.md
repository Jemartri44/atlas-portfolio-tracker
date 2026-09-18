# Prompts de traspaso a los asistentes implementadores

Un fichero por feature, numerado igual que `specs/NNN-<name>/`. Los escribe el asistente de dirección; el usuario los pasa al asistente implementador (o este los lee directamente del repo). Cada prompt es autocontenido: rol, qué leer, alcance, fuera de alcance, criterios de terminado, qué hacer si algo bloquea.

| Prompt | Feature | Estado |
|---|---|---|
| [000](000-director-handoff.md) | Relevo de la dirección: papel, ciclo de una feature con subagentes, procedimiento de revisión, estado, bloqueos y lecciones | **v3**, vigente desde 2026-09-18 (sesión única que dirige y orquesta) |
| [001](001-ledger-core.md) | Libro mayor: esqueleto, dinero, eventos, proyecciones, FIFO, CLI | Fusionada (PR #10, 2026-08-30) |
| [001-fixes](001-review-fixes.md) | Correcciones tras la revisión de la PR #10 (`unit_price` opcional, `asset_type` inmutable, nits) | Fusionada (PR #12, 2026-08-30) |
| [002](002-corporate-actions.md) | Eventos corporativos (cinco primitivas, tabla por `kind`, asistentes de CLI), tesis del cubo, `valuations(date)` | Fusionada (PR #15, 2026-08-30) |
| [003](003-synthetic-data.md) | Datos sintéticos y *golden file*, `compact` con archivo del original, migración de prueba v1→v2, `integrity` completa (`check --deep`), `atlas backup`, tooling | Fusionada (PR #18, 2026-08-30) |
| [004](004-monthly-contribution.md) | Fase 2: bloque 0 del *challenge* 2 (ADR-0014/0015, validaciones), precios manuales, `atlas weights`, calculadora de aportación, simulador de traspaso, costes | Escrito 2026-08-31; pendiente de implementar |
| [005](005-bucket-tracking.md) | Fase 3: patrimonio total desglosado, posiciones y P&L latente del cubo, tesis frente al índice, estadísticas de operativa, reglas 17-18 y aviso de recompra | Escrito 2026-09-18; pendiente de implementar |
| [006](006-web-shell.md) | Web, primera mitad: esqueleto, almacenamiento en el navegador, navegación móvil, modo privacidad, Resumen y Movimientos | Escrito 2026-09-18; pendiente de implementar |
| [review](review-challenge-decisions.md) | Agente revisor: *challenge* de las decisiones tomadas (reutilizable antes de cada fase) | Ejecutado 2026-08-30 (10 hallazgos, aplicados) |

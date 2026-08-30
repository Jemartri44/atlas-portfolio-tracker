# Prompts de traspaso a los asistentes implementadores

Un fichero por feature, numerado igual que `specs/NNN-<name>/`. Los escribe el asistente de dirección; el usuario los pasa al asistente implementador (o este los lee directamente del repo). Cada prompt es autocontenido: rol, qué leer, alcance, fuera de alcance, criterios de terminado, qué hacer si algo bloquea.

| Prompt | Feature | Estado |
|---|---|---|
| [000](000-director-handoff.md) | Relevo del asistente de dirección (contexto, estado, planes no escritos, orden de lectura) | Vigente desde 2026-08-30 |
| [001](001-ledger-core.md) | Libro mayor: esqueleto, dinero, eventos, proyecciones, FIFO, CLI | Fusionada (PR #10, 2026-08-30) |
| [001-fixes](001-review-fixes.md) | Correcciones tras la revisión de la PR #10 (`unit_price` opcional, `asset_type` inmutable, nits) | Listo para entregar |
| [review](review-challenge-decisions.md) | Agente revisor: *challenge* de las decisiones tomadas (reutilizable antes de cada fase) | Ejecutado 2026-08-30 (10 hallazgos, aplicados) |

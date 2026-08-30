# Prompts de traspaso a los asistentes implementadores

Un fichero por feature, numerado igual que `specs/NNN-<name>/`. Los escribe el asistente de dirección; el usuario los pasa al asistente implementador (o este los lee directamente del repo). Cada prompt es autocontenido: rol, qué leer, alcance, fuera de alcance, criterios de terminado, qué hacer si algo bloquea.

| Prompt | Feature | Estado |
|---|---|---|
| [001](001-ledger-core.md) | Libro mayor: esqueleto, dinero, eventos, proyecciones, FIFO, CLI | Listo para entregar |
| [review](review-challenge-decisions.md) | Agente revisor: *challenge* de las decisiones tomadas (reutilizable antes de cada fase) | Listo para entregar |

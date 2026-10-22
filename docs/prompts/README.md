# Prompts de traspaso a los asistentes implementadores

Un fichero por feature mientras está abierta, numerado igual que `specs/NNN-<name>/`. Al fusionarse la feature el prompt se borra: su historia está en git (`git log -- docs/prompts/`) y lo vigente, en los ADR y en `docs/`. Los escribe la dirección y el subagente implementador los lee directamente del repositorio (prompt 000, §3). Cada prompt es autocontenido: rol, qué leer, alcance, fuera de alcance, criterios de terminado, qué hacer si algo bloquea.

> **Las fechas de esta tabla, y las de cualquier documento del proyecto, van en `Europe/Madrid`**, no en UTC: es la zona del contribuyente y la que gobierna toda fecha fiscal. Una herramienta que devuelve UTC puede dar el día anterior — la primera mitad de la 010 se fusionó a las 22:19 UTC, que en Madrid son las 00:19 del 23.

| Prompt | Feature | Estado |
|---|---|---|
| [000](000-director-handoff.md) | Relevo de la dirección: papel, ciclo de una feature con subagentes, procedimiento de revisión, estado, bloqueos y lecciones | **v5**, 2026-09-18 (PR #56): la dirección orquesta y no ejecuta; verificador, documentación e integración son agentes delegados. Estado (§5, §6, §8 y §9) al día a 2026-09-26 (PR #93), y delante de §5 las secciones **«Estado al 2026-09-28»** (la 016 fusionada entera, PR #104 a #109; el prompt de la 017 en la PR #110; la 020 con E1 fusionada; del usuario, los ficheros reales de los brókeres y la decisión de instalar Terraform) y **«Estado al 2026-09-27»** (la 015 fusionada entera, PR #90 a #98) |
| [review](review-challenge-decisions.md) | Agente revisor: *challenge* de las decisiones tomadas (reutilizable antes de cada fase) | Tres *challenges*: 2026-08-30 (10 hallazgos, aplicados), 2026-08-31 (8, PR #20) y 2026-09-18 (7, PR #27), todos aceptados |

Los procedimientos que dejan las features (restaurar el libro, revocar todos los tokens, la cuenta de Google robada, las claves de precios…) tienen su índice en [`docs/runbooks/`](../runbooks/README.md).

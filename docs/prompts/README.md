# Prompts de traspaso a los asistentes implementadores

Un fichero por feature mientras está abierta, numerado igual que `specs/NNN-<name>/`. Al fusionarse la feature el prompt se borra: su historia está en git (`git log -- docs/prompts/`) y lo vigente, en los ADR y en `docs/`. Los escribe la dirección y el subagente implementador los lee directamente del repositorio. Cada prompt es autocontenido: rol, qué leer, alcance, fuera de alcance, criterios de terminado, qué hacer si algo bloquea.

> **Las fechas de esta tabla, y las de cualquier documento del proyecto, van en `Europe/Madrid`**, no en UTC: es la zona del contribuyente y la que gobierna toda fecha fiscal. Una herramienta que devuelve UTC puede dar el día anterior — la primera mitad de la 010 se fusionó a las 22:19 UTC, que en Madrid son las 00:19 del 23.

| Prompt | Feature | Estado |
|---|---|---|
| [review](review-challenge-decisions.md) | Agente revisor: *challenge* de las decisiones tomadas (reutilizable antes de cada fase) | Tres *challenges*: 2026-08-30 (10 hallazgos, aplicados), 2026-08-31 (8, PR #20) y 2026-09-18 (7, PR #27), todos aceptados |

Los procedimientos que dejan las features (restaurar el libro, revocar todos los tokens, la cuenta de Google robada, las claves de precios…) tienen su índice en [`docs/runbooks/`](../runbooks/README.md).

Los cuadernos de trabajo de las features fusionadas (`questions.md`, `research.md`, `quickstart.md` de cada `specs/NNN-*/`) se borraron al fusionarse: las citas a ellos que quedan en ADR, documentos y comentarios se recuperan con `git log --all -- 'specs/NNN-*/questions.md'` y `git show <commit>^:<ruta>`.

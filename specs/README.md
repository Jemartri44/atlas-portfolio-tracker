# Especificaciones por feature

Una carpeta `NNN-<nombre>/` por feature, con el `spec.md`, el `plan.md` y los contratos y modelos de datos que la feature dejó. Son **historia de lo que se decidió al construir**: lo vigente está en el código, en `docs/` y en los ADR, y manda sobre ellas.

- Las specs `001`-`020` se retiraron del árbol el 2026-11-03 (la 014 describe un motor de sincronización que ya no existe) y las `021`-`027` (la nube sin cola, entregadas; la 024 y la 027 describían comandos de consola que ya no existen) el 2026-11-04: están en el historial, `git log --all -- 'specs/NNN-*'` y `git show <commit>^:<ruta>`. Los contratos que leen los tests de `infra/` (`cost.md`, `iam-permissions.md`, `scheduler-event.md`, `permissions.json`) viven ahora en `infra/test/contract/`.
- Las rutas que citan pueden haberse movido o borrado después (por ejemplo, la cola de sincronización de la 014 y la 015, retirada por [ADR-0035](../docs/adr/0035-cloud-ledger-single-source.md)). Para encontrar el fichero actual: `git log --follow -- <ruta>`.
- Los cuadernos de trabajo (`questions.md`, `research.md`, `quickstart.md`), las predicciones (`*-expectation.md`) y los prompts se borran al fusionar la feature; se recuperan con `git log --all -- 'specs/NNN-*/questions.md'` (ver [`docs/prompts/README.md`](../docs/prompts/README.md)).
- Una feature abierta lleva su `questions.md`; las dudas que bloquean se escriben allí (`CLAUDE.md`, «Working on a feature»).

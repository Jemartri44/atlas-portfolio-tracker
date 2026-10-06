# Tareas — 024

- [ ] T1 `folder-mode.ts`: modo de carpeta, `folder_mode_ambiguous` y `CloudLedgerStore` (con sesión y caducidad).
- [ ] T2 `main.ts`: resolver el modo, componer el almacén de nube, códigos de salida 8/9/10 y sus frases.
- [ ] T3 `backup` y `export` en nube; `compact` se niega en nube; `--accept-invalid` solo en local; `--draft` y `draft` se niegan en nube.
- [ ] T4 `prices` y `fx` según el modo (sin estado «compartido»).
- [ ] T5 `remote login` vincula la carpeta; `remote upload` (subida inicial a una nube vacía).
- [ ] T6 `atlas sync` retirado; borrar `commands/sync.ts`, `output/sync.ts` y sus tests.
- [ ] T7 Tests de cada punto; los existentes que usaban `sync init` pasan a `remote login` + `remote upload`.
- [ ] T8 Docs: `docs/api.md` §5.8, `docs/data-schema.md`, `docs/specification.md`, códigos de salida, ADR-0035 §7.

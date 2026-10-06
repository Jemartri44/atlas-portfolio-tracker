# Especificación — 026 Código muerto (ADR-0035, E5)

Estado: implementada. Entrega E5 de `docs/adr/0035-cloud-ledger-single-source.md`.

## Qué

Borrar lo que ya no usa ninguna app, la API ni lo que ADR-0035 manda conservar: el motor de la cola del cliente, el almacén de sincronización del navegador, la descarga de lo retenido, los módulos del dominio que solo usaba la cola, `publish` del cliente HTTP y las frases de error de la cola. Bajar el techo del total del bundle de la web a lo medido.

## Requisitos

- **FR-001** El grafo de imports decide qué se borra: solo lo que no alcanza ninguna app, la API, `acceptAppend` y sus dependencias, `unitsOf`, `entriesOf` ni `ApiLedgerStore`/`httpRemote`.
- **FR-002** `RemoteLedger` y `httpRemote` pierden `publish` (la ruta ya da 404).
- **FR-003** `atlas compact` no se niega por `sync/state.json`: una carpeta con el marcador antiguo es local. `atlas backup` no copia lo retenido. `--accept-invalid` solo se rechaza en carpetas de nube.
- **FR-004** El dominio sigue al 100 % de líneas y ramas; los tests de lo borrado se borran.
- **FR-005** Las entradas del catálogo de mensajes de la web y de la CLI cuyo código ya no lanza el dominio se borran (el test `messages.test.ts` lo exige).
- **FR-006** `package.json` exports, alias de Vite y Vitest y `tsconfig` de lo borrado se quitan.
- **FR-007** El techo `TOTAL_BUDGET_GZIP_BYTES` baja a lo medido más un margen pequeño; el del arranque no se toca.

## Fuera de alcance

Los borradores en la nube (E6, hecha en la feature 027) y el almacén de IndexedDB del libro del navegador (`questions.md` §1).

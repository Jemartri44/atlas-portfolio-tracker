# Preguntas — 026

## 1. El almacén de IndexedDB del libro del navegador sigue en el código

`packages/adapters/src/ledger-store/browser/` (`index`, `indexeddb`, `idb`, `folder`, `picker`, `drafts`, `transfer`, `prices`, `reference`) ya no lo importa `apps/web/src` salvo `reference` y `prices` (la web cloud-only no tiene libro local). **No lo he borrado**: el encargo habla del almacén de sincronización y de lo retenido, y `reference`/`prices` siguen vivos. Propuesta: una entrega pequeña que borre `index`, `indexeddb`, `folder`, `picker`, `drafts` y `transfer` (y sus tests y la clave `current:meta`), tras confirmar que E6 (borradores en la nube) no los reutiliza.

## 2. `syncConfigured` en `record-event.ts`

La opción del dominio se sigue llamando `syncConfigured`, pero hoy significa «libro compartido de nube» (la consola la pasa con el modo de nube; la web, siempre). Renombrarla toca el dominio y sus tests; no lo he hecho.

## 3. Se conserva `GET /api/sync/devices` y `forgetRefusal`

`atlas admin` olvida un dispositivo con `--force` y los usa; por eso no se borran, y con ellos `syncArchiveName("restore")`. El campo `pending`/`held` de los objetos de dispositivo queda como historia (formato sin cambios, ADR-0035).

## 4. Un dispositivo por inicio de sesión de la web

Sigue abierta la pregunta 1 de `specs/025-api-cloud-first/questions.md`: E5 no retira la última lectura del `device_id` de la web.

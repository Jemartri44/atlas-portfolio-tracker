# Especificación — 023 La web escribe en la nube (ADR-0035, E2b)

**Origen:** ADR-0035 (Aceptada), entrega E2b; `docs/api.md` §5.8; `specs/021-api-ledger-store` (el adaptador) y `specs/022-web-cloud-boot` (el arranque, E2a). **PR:** #129. **Alcance:** que la web **escriba** en el libro de la nube y retire el modo local. La consola (E3), el borrado de código de `packages/adapters` (E5) y los borradores en la nube (E6) quedan fuera.

## Historia

Como persona que usa Atlas, quiero registrar operaciones desde la web directamente en el libro de la nube, con garantías claras cuando algo se corta o cambia, para no tener nunca un libro local que se desincronice.

## Requisitos

- **FR-001** Escritura con identificadores fijados antes de enviar (`ledger/write.ts`, `reserve`): cada formulario reserva los `id` de sus eventos y los conserva en los reintentos. Cada escritura es una unidad (un evento, una pareja o una cadena), según `docs/api.md` §5.8.
- **FR-002** `412` guiado: ante `ConflictError` se recarga el libro, se reconstruye la vista previa del mismo formulario sin desmontarlo y se **pide confirmar otra vez**. Nunca se reintenta sola ni se fusiona.
- **FR-003** Resultado desconocido: tras un fallo de red o un `5xx` se guardan los `id` pendientes (`ledger/pending.ts`) y, con conexión, se resuelven con `ApiLedgerStore.findOutcome` (`written`, `not_written` o `partial`) antes de permitir otra escritura. Reintentar con los mismos `id` es seguro (`duplicate_id`).
- **FR-004** Mensajes: `remote_rejected` se traduce por motivo (`REJECTION_REASONS`) y un `RemoteError` antes de enviar dice «No se ha guardado nada» (`docs/api.md` §5.8).
- **FR-005** Aviso de sesión (`shell/SessionNotice.tsx`): antes de abrir un formulario, la página avisa si quedan menos de 15 minutos de sesión.
- **FR-006** «Descargar copia» (`ledger/copy.ts`, Ajustes): entrega el libro de la nube como fichero; es, con `atlas backup`, la única copia fuera de AWS.
- **FR-007** Retirada del modo local en la web: libro local, claves `sync:*`, importación y su tarjeta, y la tarjeta de sincronización (`SessionCard`). En IndexedDB `atlas` quedan la copia pública del BCE y los precios importados (`importedPrices`, FR-007c de la 022); los borradores siguen hasta E6.

## Fuera de alcance

La consola con `ApiLedgerStore` (E3), el redireccionamiento tras el inicio de sesión (E4), el borrado de `sync/` y de los adaptadores del navegador (E5), los borradores en la nube (E6).

## Criterios de aceptación

Tests de `apps/web` sobre la escritura, el `412`, el resultado desconocido, el aviso de sesión y la copia; la comprobación del bundle; una captura en navegador real. No se han verificado aquí: esta nota resume el diff de la rama.

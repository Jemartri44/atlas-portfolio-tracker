# Especificación — 021 `ApiLedgerStore` (ADR-0035, E1)

**Origen:** ADR-0035 (Aceptada), §2 y §7 (entrega E1); `docs/api.md` §5.8. **Alcance:** solo el adaptador y sus tests. Ni la web (E2), ni la consola (E3), ni la API (E4), ni retirar código (E5).

## Historia

Como cliente de Atlas (la web y la consola, más adelante), quiero un `LedgerStore` que lea y escriba el libro de la nube directamente por la API, sin cola ni copia local, para que el libro de S3 sea la única fuente de verdad y los casos de uso no cambien.

## Requisitos

- **FR-001** `load()` descarga el libro entero (`GET /api/ledger`), comprueba que el `ETag` es el SHA-256 de los bytes (lo hace `httpRemote`) y lo decodifica con el esquema del almacén. Una versión de esquema más nueva se niega (`SchemaTooNewError`).
- **FR-002** `append(events, etag)` codifica cada evento con `encodeLine` y lo envía en un `POST /api/ledger/lines` con `If-Match: "<etag>"`. Cada escritura de un caso de uso (un evento, una pareja, una cadena) viaja en una sola petición.
- **FR-003** Las declaraciones las deduce el adaptador, no el llamador: `has_correction` y `chain_continues` de la forma del lote (`unitsOf`/`entriesOf`, los de la cola); `confirm_duplicate` en cada línea cuya huella repite la de un evento no anulado del libro cargado o de una línea anterior del lote (misma regla que la inicialización, `docs/api.md` §5.5).
- **FR-004** `412` es `ConflictError`: ni reintento ni fusión. Si el etag recibido no es el de la última carga, el almacén recarga y, si no coincide, lanza `ConflictError` sin enviar.
- **FR-005** Un rechazo dentro de un `200` es `RemoteRejectedError` (`code: "remote_rejected"`, con el código de la API y `accepted`). Si `accepted > 0` fue una aceptación parcial (fallo interno): el llamador recarga y dice qué quedó escrito.
- **FR-006** Fallo de red, `5xx` o `transport_rejected` tras enviar es `WriteOutcomeUnknownError` con los `id` de los eventos, fijados antes de enviar. `findOutcome(ids)` recarga y devuelve `written`, `not_written` o `partial`, con el libro recargado. Reintentar con los mismos `id` es seguro: la API rechaza `duplicate_id`.
- **FR-007** Cualquier otro fallo del cliente remoto (`401`, `403`, `400`…) se propaga tal cual: no se escribió nada.
- **FR-008** `replace`, `appendLines` y `replaceLines` se niegan (`operation_not_supported`).
- **FR-009** Nada se guarda en el dispositivo: la petición pide `cache: "no-store"`, el almacén olvida lo cargado tras escribir y no registra nada.

## Fuera de alcance

Mensajes en español de `remote_rejected` y `write_outcome_unknown` (los traducen las interfaces en E2 y E3); el uso desde web y consola; quitar la carga duplicada de cada escritura (aceptada por ADR-0035 §2).

## Criterios de aceptación

Los tests de `apps/api/test/api-ledger-store.test.ts`, contra el manejador real con dobles: escritura feliz, `412`, rechazo y rechazo parcial, duplicado, corrección y cadena deducidos, resultado desconocido resuelto en ambos sentidos, y sin caché ni importes en los registros.

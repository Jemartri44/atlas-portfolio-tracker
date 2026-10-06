# Especificación — 024 La consola en la nube (ADR-0035, E3)

**Origen:** ADR-0035 (Aceptada), entrega E3, §4 «La consola»; ADR-0033 (el token de dispositivo); ADR-0032 (copias y restauración); `docs/api.md` §5.5 y §5.8; `specs/021-api-ledger-store` (el adaptador). **Alcance:** que la consola trabaje sobre el libro de la nube con el token de dispositivo, o sobre un libro local, y que nunca sincronice uno con otro. El borrado del motor de la cola (E5), la API (E4) y los borradores en la nube (E6) quedan fuera.

## Historia

Como persona que usa Atlas desde la consola, quiero que una carpeta sea de nube (su libro es el de S3) o local (su libro es un fichero), sin mezcla ni sincronización, para que haya una sola fuente de verdad y para poder seguir trabajando sobre una copia si la nube desaparece.

## Requisitos

- **FR-001 Modo de carpeta.** Una carpeta es **de nube** si tiene `sync/remote.json` (`origin`, `device_id`) y **no** tiene `ledger.jsonl`; es **local** si no tiene identidad remota (tenga o no `ledger.jsonl`). Con las dos cosas, toda orden que lee o escribe el libro se niega con `folder_mode_ambiguous`, con instrucciones, antes de leer o escribir nada. No miran el modo: `help`, `synth`, `remote`, `admin` y `lock`.
- **FR-002 Libro de nube.** En una carpeta de nube toda orden que lee o escribe el libro usa `ApiLedgerStore` con el token de la entrada de `credentials.json` que nombra `sync/remote.json`. El libro no se guarda en la carpeta. El almacén se abre al primer uso: una orden que no toca el libro (`fx status`, `prices status`) no necesita sesión ni red.
- **FR-003 Sin conexión.** Si la nube no responde (`network_failed`, `transport_rejected`, `remote_unavailable`), la orden dice que **no ha leído ni registrado nada** y sale con `EXIT.offline` (8). Si la conexión se corta tras enviar una escritura, se intenta una vez `findOutcome`; si sigue sin saberse, sale con `EXIT.outcomeUnknown` (9) y dice que no se sabe si se registró.
- **FR-004 Sesión.** Sin entrada guardada, con el token caducado o rechazado por la API (`device_token_*`, `session_invalid`, `device_forgotten`, `not_allowed`), la orden remite a `atlas remote login` y sale con `EXIT.session` (10). La caducidad local se comprueba antes de llamar.
- **FR-005 `atlas backup --to <dir>` en nube.** Baja el libro con el token, comprueba que el SHA-256 de los bytes es el `ETag`, escribe `ledger-<fecha>.jsonl` **sin sobrescribir nunca** y la deja `0444`; la relee y vuelve a comprobar. `--from-bucket` sigue igual. En local, como hoy.
- **FR-006 `atlas export`** funciona en los dos modos. En nube, con los bytes de la nube.
- **FR-007 `compact`** se niega en una carpeta de nube (`compact_cloud_folder`, remite a `atlas admin compact`) y funciona como siempre en una local. `--accept-invalid` solo vale en local: en nube lo rechaza el dominio (`accept_invalid_while_synced`).
- **FR-008 Datos de referencia.** La carpeta de nube conserva `reference/ecb/` y `prices/` (`atlas prices update` baja los cierres de la nube con el token de la carpeta). Nunca el libro, borradores ni cola. Con `--draft` y `atlas draft …` en nube: `drafts_not_in_cloud` (hasta E6).
- **FR-009 Vincular y subir.** `atlas remote login` en una carpeta sin `ledger.jsonl` ni `sync/remote.json` la hace de nube (escribe `sync/remote.json`); con `ledger.jsonl` inicia sesión y dice que la carpeta sigue siendo local. `atlas remote upload --from <ledger.jsonl>`, solo en una carpeta de nube y solo sobre una nube **vacía**, sube el libro entero con `PUT /api/ledger` (§5.5); sobre una nube con libro se niega y remite a `atlas admin restore`. Es la subida inicial, no una sincronización. `atlas admin restore` queda como está.
- **FR-010 Ningún camino sincroniza local y nube.** `atlas sync` se retira de la consola (el motor se borra en E5): responde que se retiró y adónde ir.

## Fuera de alcance

La API (E4), el borrado de `packages/adapters/src/sync/` y del dominio de la cola (E5), los borradores en la nube (E6), el despliegue.

## Criterios de aceptación

Tests de `apps/cli` sobre el modo, el ambiguo, el almacén de nube contra el manejador real con dobles, el offline, la sesión caducada, `backup`, `export`, `compact`, `login` vinculando, `upload`, `prices` en nube y `sync` retirado; `npm run test:others` y `npm run test:coverage:domain` en verde.

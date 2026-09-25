# ADR-0015 — Proyección degradada en consultas y aceptación de `settings_changed` que invalida el pasado

**Estado:** Aceptada (2026-08-31). Origen: hallazgo 2 del segundo *challenge* externo (2026-08-31).

## Contexto

Tras la feature 001, toda consulta de la CLI proyecta el libro en modo estricto: un único evento inválido (una edición manual del JSONL, una migración con semántica nueva, un invariante endurecido en el futuro) deja `positions`, `gains` o `export csv` sin respuesta; solo sobreviven `check --deep` y `export jsonl`. Y como `recordEvent` reproyecta el libro completo, un `settings_changed` que cambie `fiscal_date_rule` y reordene cronológicamente un par compra/venta históricos se rechaza entero — exactamente el cambio que ADR-0013 promete resolver "con un `settings_changed`, no un despliegue". Los hechos registrados no cambian con la regla; cambia su interpretación, así que no existe nada que "rectificar antes". La constitución V exige degradar de forma visible, nunca en silencio ni con un sistema mudo.

## Opciones consideradas

1. **Todo estricto (statu quo).** Ventaja: imposible mostrar un dato dudoso. Inconvenientes: la app entera muere por un evento; la promesa de ADR-0013 es incumplible; no hay camino de reparación (para rectificar con `edit`/`delete` hay que poder consultar).
2. **Consultas de solo lectura degradadas (`collectErrors`) con aviso en cabecera; mutaciones estrictas; `settings_changed` registrable con confirmación explícita que lista los eventos que pasan a ser inválidos** (elegida). Ventajas: el libro siempre se puede leer y reparar; el cambio de regla fiscal es posible y deja rastro de sus efectos; el aviso permanente impide normalizar el estado degradado. Inconveniente: una consulta puede mostrar proyecciones parciales — mitigado con la cabecera obligatoria y `atlas check`.
3. **Aceptar cualquier evento que invalide el pasado con confirmación.** Inconveniente: abre la puerta a escribir operaciones incoherentes a sabiendas; solo `settings_changed` tiene la propiedad de "reinterpretar sin cambiar hechos".

## Decisión

Opción 2. `recordEvent` gana `acceptInvalid`, admitido **solo** para `settings_changed`: sin él, rechaza listando los eventos que pasan a ser inválidos (espejo de `reverseEvent` con los dependientes); la CLI exige el flag explícito `--accept-invalid`. Todas las consultas de solo lectura proyectan con `collectErrors: true` y, si hay inválidos, imprimen cabecera de aviso e incluyen `invalid_count` en `--json`. Las demás mutaciones siguen exigiendo un libro válido.

## Consecuencias

- `docs/data-schema.md` §6.1 actualizado; implementación en el bloque 0 de la feature 004.
- La "reparación" de un libro degradado es siempre visible: consultar → `atlas check` → rectificar; ningún comando finge normalidad.
- El motor fiscal (Fase 5) hereda un criterio claro: la configuración vigente reinterpreta el pasado y sus efectos se listan al cambiarla.

## Nota del 2026-09-25 (prompt de la feature 014)

**Con la sincronización configurada, `acceptInvalid` se niega al registrar** (decisión de la dirección; `docs/prompts/014-ledger-sync-core.md`, §6.3 (V7)). Un `settings_changed` que deja eventos inválidos no se puede subir, porque el remoto nunca recibe un libro inválido (ADR-0026, Parte A), y una línea retenida bloquea la cola (ADR-0026, tercera enmienda): admitirlo congelaría toda la sincronización posterior del dispositivo. La explicación lo dice, y remite a reparar primero los eventos afectados o a desactivar la sincronización de forma explícita. **Sin sincronización configurada, esta ADR sigue igual.** La negativa vive en `checkInvalid`, para que la vista previa y el registro fallen igual. «Sincronización configurada» es `sync/` en la carpeta del libro de la consola (la misma regla que usa `compact`) o la clave de estado de la sincronización en el almacén `ledger` de la web; lo lee el adaptador y lo pasa como dato de entrada, porque el dominio no hace E/S. Una línea así registrada antes de activar la sincronización se avisa al activarla y queda retenida con su explicación.

## Nota del 2026-09-25 (cierre de la feature 014): qué es «sincronización configurada»

Decidida por la dirección durante la feature 014 (D-Q6, `specs/014-ledger-sync-core/questions.md` §8) y escrita al cerrarla. La nota anterior daba por configurada la sincronización con que existiera `sync/`. Eso chocaba con desactivarla: desactivar conserva lo retenido, que vive en `sync/`, así que `acceptInvalid` quedaba negado para siempre justo cuando la nota lo ofrecía como remedio. Queda así:

- **En la consola**: existe la carpeta `sync/` junto al libro **y** el marcador (`sync/state.json`) no dice `status: "disabled"`. Un marcador ausente o ilegible cuenta como configurada: es el lado seguro.
- **En la web**: existe alguna de las claves `sync:state`, `sync:held` o `sync:discarded` del almacén `ledger` (el equivalente de la carpeta `sync/`) **y** el marcador no dice `disabled`. Con lo retenido y sin marcador también cuenta como configurada.

Es una sola regla, `syncConfigured` en `packages/domain/src/sync/marker.ts`, con su variante sobre los textos crudos (`syncConfiguredByText`) para que la web la consulte sin cargar el lector del marcador. La leen `folderSyncPresence` (`packages/adapters/src/sync/folder-store.ts`) y `browserSyncConfigured` (`packages/adapters/src/ledger-store/browser/sync-store.ts`), y la consola y la web se la pasan al caso de uso (`syncConfigured` en `RecordOptions`).

**Con la sincronización configurada, `acceptInvalid` se niega en `checkInvalid`** (`packages/domain/src/usecases/record-event.ts`), así que la vista previa y el registro fallan igual: es un código más de `DependentEventsError`, `accept_invalid_while_synced`. Quien pasa `acceptInvalid: true` tiene que decir en los tipos si la sincronización está configurada, y si no lo dice se niega también (fallo seguro). Sin `acceptInvalid`, la negativa de siempre (`newly_invalid_events`) no cambia. **La salida, dicha en las dos interfaces:** reparar antes los eventos afectados, o desactivar la sincronización de forma explícita, que deja el marcador en `disabled` y conserva lo retenido.

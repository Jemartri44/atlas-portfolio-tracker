# Preguntas abiertas — feature 003-synthetic-data

Dudas encontradas al leer la documentación y el código que el prompt me prohíbe resolver por mi cuenta (nada fiscal ni estructural se decide en esta feature). Cada una lleva el supuesto provisional con el que sigo trabajando; si el usuario elige otra opción, se ajusta antes de implementar la parte afectada.

## Q1 — "`state.warnings` vacío" frente a "el mismo activo en dos cuentas" (invariante del generador)

**Contexto.** El prompt §3.2 exige, para cualquier semilla, `state.warnings` vacío, y a la vez que el libro contenga el mismo activo en dos cuentas (`core` en IBKR ×2), un traspaso de custodia del ETC entre ellas y un contrasplit con picos en dos cuentas. La proyección de la feature 001 (`warnHolders`, `operations.ts`) emite el aviso `same_asset_two_accounts` en cada `buy`, `transfer` de custodia, `convert`, `carve_out` o `grant` que deje un activo en más de una cuenta ("se permite con aviso", ADR-0009, `business-rules.md` §5.3). Es un aviso permanente en el estado, no se puede evitar cumpliendo el escenario.

**Opciones.**
- **(a) Avisos declarados.** El generador expone la lista exacta de códigos de aviso que su escenario provoca (hoy solo `same_asset_two_accounts`, uno por evento que deja el ETC en dos cuentas) y el invariante pasa a ser "no hay avisos fuera de los declarados". Cumple el resto del prompt tal cual.
- **(b) Suprimir el escenario en dos cuentas.** Contradice el prompt (traspaso de custodia, contrasplit en dos cuentas, constitución VII).
- **(c) Cambiar la proyección** para que `same_asset_two_accounts` no sea un aviso persistente. Cambio de semántica de la 001: fuera de alcance (prompt §4).

**Supuesto provisional: (a).** Spec A1, FR-005.

**Respuesta del usuario (2026-08-30): (a), avisos declarados.** La contradicción era del prompt: ADR-0009 dice "en dos cuentas del mismo libro se permite con aviso". Invariante **bilateral**: ningún aviso fuera de `SYNTHETIC_EXPECTED_WARNINGS` y al menos un aviso por cada código declarado.

## Notas de lectura (aceptadas por el usuario el 2026-08-30 tal cual)

- **`dangling_reference` y `corrects_id`.** El prompt §3.5 pide, como mínimo, `corrects_id` que no apunta a un evento del libro o a uno no anulado. La proyección de la 001 ya lo rechaza en la pasada 0 (`dangling_correction`, `project-ledger.ts`), y en modo `collectErrors` aparece en `state.invalid`, de donde `integrity` ya lo lista. Añadirlo de nuevo sería duplicar (el propio prompt lo prohíbe). La única referencia que hoy no se comprueba en ningún sitio es `reference_etf_id` de `asset_created`/`asset_updated`; `dangling_reference` cubre esa. Tabla completa en `plan.md`.
- **Tercera cuenta `core`.** El prompt la llama "en otra plataforma" y, dos líneas después, habla del traspaso de custodia "entre las dos cuentas `core` de IBKR". Se toma como segunda cuenta de IBKR (spec A2).
- **Campos desconocidos al cargar.** `validateShape` solo comprueba los campos listados en las reglas de cada tipo; un campo extra (`note` de la fixture legacy) se conserva y se ignora. Por eso la fixture `legacy-v1-for-test-schema.jsonl` carga con el esquema real sin error (el prompt pedía documentar cuál de las dos cosas pasa). Rechazar campos desconocidos sería un cambio del cargador para otra feature.
- **`MigrationChain`/`MIGRATIONS` → `LedgerSchema`/`CURRENT_LEDGER_SCHEMA`.** Decisión (e) fija el nombre y la forma del objeto inyectable; el tipo actual (`target`/`steps`) se sustituye en vez de convivir con él. Los tests de `migrations.test.ts` se adaptan a los nombres nuevos y verifican lo mismo.
- **`duplicate_id` lanza siempre.** `projectLedger` rechaza ids duplicados incluso con `collectErrors` (test de la 001). `atlas check --deep` captura ese `ProjectionError` y lo presenta como hallazgo; `deepCheck` también lo detecta sobre las líneas (spec A9).
- **Colisión del nombre de archivo.** `data-schema.md` §1 fija el sufijo `-2`, `-3`… pero no dice quién lo resuelve. El puerto falla con `archive_exists` y el caso de uso reintenta (spec A10), de modo que ni el adaptador de fichero ni el futuro de S3 necesitan listar el directorio.
- **Tipos de Node en los tests del dominio.** `packages/domain/tsconfig.test.json` pasa de `types: []` a `types: ["node"]` para que los tests del golden file y de la fixture legacy lean del disco. `src/tsconfig.json` sigue con `types: []` y el test de arquitectura sigue vigilando los imports de `src`, así que el dominio no gana ninguna dependencia de Node. Es un ajuste de configuración de test, no una herramienta nueva; si el usuario prefiere mantener los tests del dominio puros, esos tests se mueven a `tests/` (y `TEST_SCHEMA_V2` se duplica allí).

## Recomendaciones del usuario al aprobar el plan (2026-08-30) y decisión tomada

1. **Excluir `message` de `warnings` e `invalid` en `snapshotOf`** → adoptada: la instantánea guarda `code`, `event_id` y `details` de los avisos y `event_id`, `type` y `code` de los inválidos; un cambio de redacción no obliga a regenerar el golden file.
2. **`planCompact` + `compactLedger(deps, plan)` en vez del callback `confirm`** → adoptada: `planCompact(deps)` carga, rechaza si hay eventos inválidos y devuelve el plan (etag, líneas por versión, destino, nombre de archivo); `compactLedger(deps, plan)` vuelve a cargar, rechaza con `ConflictError` si el etag cambió, y ejecuta. La CLI pregunta entre los dos pasos; la API y la web podrán confirmar de forma no interactiva.
3. **Fixture generada con la CLI compilada y snapshot con un script puntual no versionado** → adoptada: ningún test escribe en el repositorio; T015 lo recoge.
4. **`unknown_field` (aviso) en `deepCheck`** → adoptada, es barato: `validate.ts` expone los campos conocidos de cada tipo (envoltorio + reglas + `settings` para `settings_changed`) y `deepCheck` avisa por cada campo de primer nivel que sobra. Solo primer nivel; los efectos anidados de `corporate_action` quedan para un seguimiento si hace falta.

Los tres candidatos de `research.md` §1 (`inactive_reference`, `duplicate_valuation`, `valuation_quantity_mismatch`) quedan fuera: los recoge la dirección.

## Notas de implementación (2026-08-30, tras `/speckit-implement`)

Decisiones de detalle que no cambian documentos pero conviene que el usuario conozca:

- **`fingerprint_mismatch` no detecta una comisión editada**: la huella (ADR-0012) cubre el tuple de negocio (cuenta, activo, fecha valor, cantidad, importe/precio, divisa) y `fee` no forma parte de él. Los tests y el `quickstart.md` editan `quantity`; una edición manual de `fee` solo la detecta `projection_not_reproducible` si altera la proyección frente al estado cargado (no lo hace: el texto releído es el mismo). Si se quiere cubrir `fee`, es un cambio de la huella (ADR).
- **`unknown_field` solo se evalúa en líneas de la versión actual**: los campos de una línea antigua pertenecen a las reglas de su versión (que ya no existen); la línea se señala como `outdated_lines` y, tras `compact`, se re-evalúa. Por eso la fixture legacy da `unknown_field` (×2) con el esquema real (v1 = actual) y `outdated_lines` con el de prueba.
- **`deepCheck` omite `projection_not_reproducible` cuando hay ids duplicados** (no se puede proyectar) y la CLI captura el `ProjectionError` de la proyección para presentar `duplicate_id` como hallazgo único (spec A9).
- **Actualizaciones de seguimiento de un traspaso fechadas el día del reembolso**: la fecha de negocio del `transfer` es `value_date_out`, así que una actualización `subscribed` fechada después encontraría la solicitud ya completada. El generador fecha `redeemed` y `subscribed` en `value_date_out` (el orden dentro del día lo da la posición en el fichero).
- **Escenario, meses 4 y 6 intercambiados respecto al primer borrador** (recogido ya en `data-model.md` §6): la venta con pérdida va antes que el primer traspaso para que sea la venta, y no el traspaso, quien consuma por FIFO la compra registrada tarde (fechada 2026-08-28, el lote más antiguo).
- **Tiempo de la propiedad de prefijos** (spec A14): proyectar los 160 prefijos de un libro tarda ~100 ms; la propiedad con 20 semillas y prefijos exhaustivos corre en ~5 s dentro de la batería. No hizo falta el modo "por bloques".
- **`recordEvent` bajo el esquema de prueba**: la protección del hallazgo 10 actúa en la carga (un cliente viejo no puede ni leer un libro v2, `SchemaTooNewError`), no en el `append`; el test lo cubre así. `append` bajo un esquema nuevo escribe la versión que traiga el evento (el test de adaptadores usa `schema_version: 2` explícito) y conserva el prefijo byte a byte.
- **`FileLedgerStore.replace` valida `archiveName`** (nombre plano, sin separadores): defensa en profundidad del adaptador; el nombre siempre lo genera `planCompact`.
- **Toolchain**: sin cambios (TypeScript 7.0.2, Biome 2.5.11, Vitest 4.1.11, fast-check 4.9.0, Node 22.23.2); cero dependencias nuevas.

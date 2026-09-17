# ADR-0018 — Evolución del esquema y endurecimiento de validaciones

**Estado:** Aceptada (2026-09-18). Origen: hallazgo 1 del tercer *challenge* externo. Acota la decisión (g) del prompt de la feature 004.

## Contexto

El cargador valida **cada línea con las reglas de hoy**: `FileLedgerStore.load()` pasa toda línea por `validateShape`, `schema_version` sigue en 1 y la cadena de migraciones está vacía. Endurecer una validación invalida por tanto el libro **entero y de forma retroactiva**, y no de forma degradada: ADR-0015 actúa en la proyección, no en el almacén, así que `positions`, `check`, `check --deep` y hasta `export --format jsonl` mueren en la carga.

Ya ha ocurrido **dos veces** en la feature 004: el rechazo de `transfer.fee` (que antes se aceptaba y se ignoraba) y el rechazo de `fx_rate_date` en fin de semana, que las propias fixtures incumplían. El *golden* se regeneró; un libro real no se puede regenerar.

El detonante más probable estaba a la vista: **no existe `asset_type: "etf"`** aunque `docs/business-rules.md` nombra los ETF como categoría de dos meses y de fecha de contratación en tres sitios, y `reference_etf_id` obliga a darlos de alta. Como `Settings.fiscal_date_rule` y `Settings.wash_sale_window` se validan como mapas **completos** por tipo de activo, el día que se añadiera `etf` al enum, todas las líneas `settings_changed` ya escritas pasarían a ser inválidas.

Hoy el usuario **todavía no tiene libro real** (decidió no suscribirse hasta que la aplicación esté lista), así que decidir esto cuesta cero. Mañana cuesta una migración.

## Opciones consideradas

1. **Seguir endureciendo libremente dentro de la v1** (statu quo, decisión (g) de la 004). Ventaja: sin ceremonia mientras no haya datos. Inconveniente: la puerta se queda abierta y el día que el libro exista, un endurecimiento lo deja ilegible sin que nadie lo note al revisar.
2. **Cargador tolerante y proyección estricta**: aceptar la línea y rechazarla al proyectar. Ventaja: el libro siempre se puede leer. Inconveniente: contradice el contrato del cargador (`data-schema.md` §5, hallazgo 10 del primer *challenge*), que rechaza lo que no entiende para que un cliente antiguo nunca escriba sobre un libro más nuevo.
3. **Regla explícita de compatibilidad, con el punto de no retorno escrito** (elegida).

## Decisión

Se distingue entre cambios **compatibles** y **rompedores** de la forma de una línea:

- **Compatible** (no exige versión nueva): añadir un campo opcional; añadir un valor a un enumerado; relajar una validación; aceptar una forma antigua además de la nueva.
- **Rompedor** (exige `schema_version` nueva y su migración): endurecer o eliminar una regla de forma existente, quitar un valor de un enumerado, cambiar el significado de un campo.

**Mientras el libro real esté vacío** —hoy— un cambio rompedor puede aplicarse dentro de la v1 regenerando el *golden*, y así se hizo en la feature 004. **Desde el primer evento real registrado, esa puerta se cierra**: todo cambio rompedor pasa por `schema_version = 2` y su función de migración, que es exactamente para lo que la feature 003 dejó el mecanismo probado de extremo a extremo.

Además, y para que **añadir un tipo de activo no vuelva a ser un cambio rompedor**: los mapas de `Settings` indexados por `asset_type` (`fiscal_date_rule`, `wash_sale_window` y su forma antigua) pasan a ser **parciales**. Los tipos ausentes toman el valor por defecto documentado en ADR-0013 y ADR-0014, y `settingsAt` los completa al leer. El enumerado gana `etf` ahora mismo, con `trade_date` y `"2m"` como valores por defecto, que es lo que los documentos ya decían.

## Consecuencias

- `docs/data-schema.md` §5 recoge la regla y §6.1 el tipo `etf`; `docs/business-rules.md` §7 anota que los mapas son parciales.
- El bloque 0 de la feature 005 implementa el tipo nuevo y la tolerancia de los mapas; ambos son cambios **compatibles**, así que no tocan `schema_version` ni el *golden*.
- Toda propuesta futura de endurecer una validación debe responder antes a una pregunta: *¿existe ya un libro real?* Si la respuesta es sí, el cambio no es una línea de validación, es una versión de esquema.
- Lo que se vuelve más fácil: añadir tipos de activo, campos opcionales y formas nuevas sin miedo. Lo que se vuelve más difícil, a propósito: endurecer sobre la marcha.

# Plan de implementación: `013-daily-close-prices`

**Rama**: `feature/013-daily-close-prices` | **Fecha**: 2026-09-24 (Europe/Madrid) | **Especificación**: [`spec.md`](spec.md) | **Preguntas y bloque 0**: [`questions.md`](questions.md)

**Estado**: **aprobado por la dirección el 2026-09-24**, con las decisiones de `questions.md` §6. CoinGecko y OpenFIGI fuera (D-Q5, D-Q6); un solo cierre vigente por activo y fecha (D-Q10); techo del arranque con tope de +0,3 KB (D-Q7).

## Contexto técnico

| | |
|---|---|
| Lenguaje | TypeScript estricto, ESM, Node 22 (`.nvmrc`) |
| Dependencias nuevas | **Ninguna.** Descarga con el `fetch` de Node, inyectable; JSON con la biblioteca estándar, leyendo el **texto** de cada número (`JSON.parse` con `context.source`, comprobado en Node 22.23: Q1) |
| Tests | vitest; `packages/domain` al 100 % de líneas y ramas; red nunca; respuestas sintéticas con el formato real en `tests/fixtures/{eodhd,alpha-vantage}/`, generadas por un guion determinista como `tests/fixtures/ecb/make-synthetic.mjs`; clave centinela `TEST-KEY-013` |
| Paquete web, partida | arranque **73,7 / 73,8 KB** gzip (**75.418 / 75.571 bytes**), total **262,1 / 263,0** (medido sobre `6a8ac2d`) |

## Comprobación contra la constitución

| Principio | Cómo lo cumple el plan | Estado |
|---|---|---|
| I. El libro es la fuente de verdad | Nada de precios entra en el libro; la correspondencia de símbolos vive en `prices/symbols.json`; ningún campo nuevo en ningún evento | Sí |
| II. Fiscalidad solo del libro | Guardianes por alcance antes de crear nada (§2); el 720 por la hoja manual; test de salida fiscal idéntica con cotizaciones que ganarían en una vista | Sí |
| III. Compartimentación | La puerta no cambia de firma; cubo y núcleo siguen en sus vistas. La prioridad del cupo (cubo primero) no mezcla cifras | Sí |
| IV. Nada configurable en el código | Orden de fuentes, cupos y umbral de fallos en `prices/config.json`; claves en `~/.config/atlas/secrets.json`; `stale_price_days` ya en `Settings`. La prioridad es **fija** por ADR-0031, no configurable | Sí |
| V. Fallo seguro | Cascada, último valor con antigüedad, nunca convertir sin tipo, cero fuentes = todo igual | Sí |
| VI. Veinte años | Ficheros JSON Lines y JSON legibles, sin dependencias | Sí |
| VII. Tests primero | Los mutantes de §5 del encargo, cada uno visto morir | Previsto |

## 1. Dónde vive cada cosa

| Qué | Dónde | Puerta |
|---|---|---|
| La puerta de presentación (P2) y sus tipos | `packages/domain/src/projections/prices.ts` (existe) | barril, como hoy |
| **La hoja manual** | `packages/domain/src/projections/manual-price.ts` (nueva) | barril y `@atlas/domain/fiscal` (la usa el 720) |
| **El dominio de precios automáticos** | `packages/domain/src/quotes/` (nueva): `line.ts` (la línea y su lectura), `select.ts` (qué cierre se lee, P7), `external.ts` (construye el `ExternalPrices` con el tipo del BCE y la aproximación), `approximation.ts`, `budget.ts`, `priority.ts`, `status.ts`, `symbols.ts`, `config.ts`, `cascade.ts` (el caso de uso) | **`@atlas/domain/quotes`** (`packages/domain/src/quotes.ts`), **nunca** en el barril |
| Los puertos | `packages/domain/src/ports/price-source.ts` (`PriceSource`) y `ports/price-store.ts` (`PriceStore`: cierres, `symbols.json`, `_status.json`, `config.json`, la caché) | por `@atlas/domain/quotes` |
| Los adaptadores | `packages/adapters/src/prices/`: `eodhd.ts`, `alpha-vantage.ts`, `file-store.ts`, `secrets.ts`, `redact.ts`, `json-numbers.ts` | solo por el barril `"."` de Node; **ninguna subruta nueva** para la web |
| Lectura en la web | `packages/adapters/src/ledger-store/browser/prices.ts` (leer de la carpeta con `readFolderText`, importar a IndexedDB) | **subruta nueva `./prices`** en `exports`, que el test de direcciones mira por construcción (§2, mutante 14) |

El nombre `quotes/` y no `prices/` es a propósito: evita confundir el módulo con `projections/prices.ts`, la puerta, que sigue siendo la única entrada a un precio.

## 2. Bloque 1 — la puerta fiscal, antes que nada

**La hoja, y cómo se relaciona con la puerta (tu preferencia, Q8).** `projections/manual-price.ts` exporta `latestValuations(state, date)` (la función que hoy es privada de `prices.ts`, movida tal cual) y `manualPriceAt(state, assetId, date): ManualPrice | undefined`, con su propio tipo `ManualPrice` (`event_id`, `date`, `unit_value`, `currency`, `fx_rate`, `fx_rate_date`, `unit_value_eur` **obligatorio**). Importa solo tipos del estado, dinero y fechas. **`prices.ts` importa la hoja** y deja de leer las valoraciones por su cuenta, salvo `priceDates`. El 720 (`informative/valuation.ts`) llama a `manualPriceAt` y deja de importar `prices.ts`.

**¿Rompe algún guardián?** No. Uno por uno:

- «keeps every read of the valuations behind the gate of prices.ts»: la hoja lee `state.valuations`; entra **nombrada** en la lista cerrada. `prices.ts` sigue (por `priceDates`).
- «keeps prices.ts a leaf among the projections»: `prices.ts` alcanzaría `manual-price.ts`, una proyección fuera de la capa de tipos; se admite **nombrada**.
- El nuevo del 720 (desde `informative/` no se alcanza `prices.ts` ni nada que importe `priceAt`/`manualPrices` ni nada de `quotes/`): la flecha va de la puerta a la hoja, nunca al revés, así que alcanzar la hoja no alcanza la puerta. Nace verde (hoy solo `valuation.ts` alcanza `prices.ts`).
- «keeps prices out of every fiscal calculation, transitively», extendido: `tax/` y `project-ledger.ts` no alcanzan ni la puerta, ni `quotes/`, ni los puertos de precios, **ni la hoja**. Hoy no alcanzan ninguno.
- «lets the informative returns read a price»: pasa a exigir que `m720.ts` alcanza la hoja (y no `prices.ts`).
- El arranque: mover `latestValuations` no añade código; la hoja entra en el trozo de arranque del dominio junto a `prices.ts` y el 720 la comparte.

La contrapartida (Q8): un cambio de la hoja para la presentación cambiaría el 720.

**Los tests del bloque 1** (en `tests/architecture.test.ts`, con el grafo que ya tiene):

1. «keeps prices out of every fiscal calculation, transitively»: «que sabe de precios» = alcanza `prices.ts`, `manual-price.ts`, **cualquier fichero de `quotes/`**, `ports/price-source.ts` o `ports/price-store.ts`; los de `quotes/` **leídos de la carpeta**, no de una lista.
2. Nuevo, «reaches nothing of prices from an informative return but the manual leaf»: desde cada fichero de `informative/`, a cualquier profundidad, ningún fichero que sea `prices.ts`, que importe `priceAt` o `manualPrices` (por nombre, con `as` o con `* as`: se busca el especificador `projections/prices.js` en sus importaciones), que sea de `quotes/` o un puerto de precios. `bucket.ts`, `weights.ts`, `networth.ts` y `costs.ts` quedan cubiertos porque importan de `prices.ts`.
3. Nuevo, «freezes the keys of LedgerState and Settings»: la lista exacta de hoy escrita en el test; se lee del **fuente** (el cuerpo de las dos interfaces, campo a campo, incluidos los tipos en línea) y además, para `LedgerState`, de `Object.keys(emptyState())`. Cualquier clave nueva, rojo.
4. Nuevo, «builds no state and no settings from anything that knows prices»: `project-ledger.ts`, `state.ts`, `settings/` no alcanzan nada de precios (lo cubre el 1 para `project-ledger.ts`; se añade `settings/`).
5. Nuevo, «uses no dynamic import in the domain»: `import(` en código de `packages/domain/src` (sin comentarios), rojo.
6. Nuevo, como el del BCE: «keeps the quotes out of index.ts» y la puerta `quotes.ts` existe y los nombra.
7. Se mantiene la regla por nombres (`ExternalPrices`, `ExternalQuote`, `external`), que ya no es la que cierra.
8. `LAZY_ONLY` de `check-bundle.mjs` gana `/packages/domain/src/quotes/`, `/packages/domain/src/quotes.ts`, el lector de precios de la web y su subruta, **desde el primer commit**.

**Mutantes del bloque 1, vistos morir antes de seguir** (salida en §9 de `questions.md`): un fichero vacío en `quotes/` importado desde `tax/` y desde `project-ledger.ts` (rojo con el guardián extendido, **verde** con el de hoy); un quinto argumento de `priceAt` con otro nombre pasado desde `informative/` (verde la regla antigua, rojo la nueva); `priceAt` importado desde `informative/` de tres formas; `bucketPositions` importado desde `informative/` con la fuente; la hoja importada desde `tax/`; una clave nueva en `LedgerState` y otra en `Settings`, también con el tipo en línea; un `import()` en el dominio.

**El comentario de `priceDates`** se corrige: las fechas automáticas llegan como dato aparte a las vistas de presentación (una función de `quotes/`, `quoteDates(closes)`, que la serie de la web une a `priceDates(state)`), nunca por el estado.

## 3. La puerta (P2) y `unit_value_eur`

`priceAt` y `manualPrices`: con `external`, gana el de **fecha más reciente**; con la misma fecha, la manual. `ExternalQuote` gana `source` y `approximate?`, y `fx_rate` pasa a **opcional**: `external.ts` lo rellena solo con `resolveRate` en `euro` o `resolved` **para la fecha de la cotización**; en `not_yet_published`, `currency_not_published` y `currency_stale`, la cotización llega sin tipo. `PriceLookup` gana `source?`, `approximate?`, y `fx_rate`, `fx_rate_date` y `unit_value_eur` pasan a opcionales. `positionValueOf` devuelve nada sin `unit_value_eur`.

**Las vistas que leen `unit_value_eur` y qué hacen cuando falta** (buscadas en el dominio y en las dos interfaces; §4 de `questions.md`):

| Vista | Hoy | Sin valor en euros |
|---|---|---|
| `positionValueOf` (`prices.ts`) | multiplica | nada |
| `weights.ts` (`coreWeights`) | sin precio → `partial_core_total` | lista aparte, aviso nuevo **`price_without_eur_value`** con los activos, y el total es parcial: **no se calculan pesos** sobre un total parcial, como hoy |
| `contribution.ts` (lee los pesos) | — | hereda el total parcial de los pesos; y dice `contribution_uses_approximation` si algún peso usa una aproximación (calculado en `quotes/`, fuera del arranque) |
| `networth.ts` | suma posiciones con precio | no suma ese activo; lo dice aparte de «sin precio» |
| `bucket.ts` (fila, tesis y comparación con el índice, línea 317) | divide entre los `unit_value_eur` | la fila enseña la cotización en su divisa sin valor; la comparación con el índice da el hueco nuevo **`no_eur_value`** |
| `costs.ts` | valor de la posición | sin valor, como sin precio, dicho aparte |
| `simulate-transfer.ts` | exige precio **manual** | sin cambio: solo manual, y una `valuation` siempre lleva tipo; se tipa con la hoja |
| `informative/valuation.ts` (720) | `priceAt` sin fuente | **`manualPriceAt`**, valor en euros obligatorio |
| Consola `portfolio.ts` (`priceCell`, línea 31 y 135) | enseña `fx_rate` | «sin tipo del BCE para <fecha>: falta el valor en euros» |
| Web `Price.tsx`, vistas de Resumen, Cartera, Cubo | enseñan `unit_value` y el valor | la cotización en su divisa y la marca «falta el valor en euros» |

## 4. Los formatos (contrato antes de implementar)

**`prices/<asset_id>.jsonl`** — una línea por (`date`, `source`), **solo se añade**, bytes existentes nunca reescritos:

```json
{"schema_version":1,"date":"2026-09-23","close":"101.5","currency":"EUR","source":"eodhd","fetched_at":"2026-09-24T06:00:02.000Z"}
```

Exactamente los campos de ADR-0031. `close` cadena decimal positiva (el texto que dio la fuente, sin reformatear); `currency` código de 3 letras **tal como se declaró** (incluidas subunidades como `GBX`); `source` ∈ {`eodhd`, `alpha_vantage`}. **El cierre vigente de una fecha es la última línea de esa fecha** (D-Q10); la consola solo añade una línea para una fecha si no hay ninguna, si es de la misma fuente con otro valor numérico, o si es de una fuente anterior en el orden a la de la vigente. Igualdad numérica, nunca de cadena. Lector: §2.5 de `questions.md` (propuesta).

**`prices/symbols.json`** — se sobrescribe entero, bajo el cerrojo:

```json
{"symbols_format":1,"assets":{"<asset_id>":{"currency":"USD","eodhd":"AAPL.US","alpha_vantage":"AAPL","confirmed_at":"2026-09-24T08:00:00.000Z","currency_check":{"eodhd":{"found":"USD","at":"2026-09-24T08:00:00.000Z"},"alpha_vantage":{"found":"USD","at":"…"}},"currency_confirmed_over":{"eodhd":"GBP"}}}}
```

`currency` obligatorio (la divisa **de la cotización**, no la del activo); cada fuente opcional; `currency_check` guarda lo que dijo la fuente al confirmar; `currency_confirmed_over` guarda la divisa de la fuente que el usuario **aceptó contradecir de forma explícita** (D-Q2). Una fuente cuyos metadatos contradicen la declarada sin esa confirmación no se descarga (`currency_mismatch`). Solo lo escribe una orden del usuario.

**`prices/_status.json`** — se sobrescribe, bajo el cerrojo:

```json
{"status_format":1,"sources":{"eodhd":{"consecutive_failures":0,"last_success":"2026-09-24T06:00:05Z","last_failure":{"kind":"not_found","at":"…","asset_id":"…"},"spent":{"window":"gmt_day","day":"2026-09-24","calls":3}},"alpha_vantage":{"…":"…","spent":{"window":"rolling_24h","calls_at":["…"]}}},"assets":{"<asset_id>":{"last_failure":{"kind":"currency_mismatch","declared":"GBX","found":"GBP","at":"…"}}}}
```

Nunca una URL, nunca un mensaje de la fuente (solo el tipo de fallo). «Lo gastado» incluye lo **reservado** (§5).

**`prices/config.json`** — lo escribe el usuario; la aplicación nunca:

```json
{"source_order":["eodhd","alpha_vantage"],"daily_calls":{"eodhd":20,"alpha_vantage":25},"failure_threshold":3}
```

Todas las claves opcionales con esos valores por defecto; una clave desconocida o un valor inválido es `invalid_price_config` con **el nombre** de la clave. Sin fichero, los valores por defecto.

**`~/.config/atlas/secrets.json`** (o `$XDG_CONFIG_HOME/atlas/secrets.json`) — lo escribe el usuario, permisos `600`:

```json
{"eodhd":"…","alpha_vantage":"…"}
```

Cualquier clave opcional (sin ella, esa fuente no se llama). Errores: `secrets_unreadable` (sin el texto ni el `SyntaxError`), `secrets_unknown_key` (con el nombre, nunca el valor), `secrets_invalid_value` (con el nombre), `secrets_too_open` (§2.4), `secrets_inside_ledger_folder` (una carpeta dentro de la otra, en los dos sentidos, con rutas reales resueltas).

## 5. El caso de uso de descarga (`quotes/cascade.ts`) y la consola

Orden de una ejecución de `atlas prices update`, con los puertos inyectados:

1. **Fuera del cerrojo**: cargar el libro de la consola, proyectarlo a hoy (`Europe/Madrid`), leer `config.json`, `symbols.json`, las claves. Sin claves o sin ninguna correspondencia: decirlo y terminar con 0, sin tocar la red.
2. **Prioridad** (fija, ADR-0031): posiciones abiertas del cubo; después `bucket_benchmark_asset_id` y los `reference_etf_id` de los fondos con posición; después el resto del núcleo con posición. Dentro de cada grupo, por `asset_id`. Un activo sin posición que no es referencia no gasta cupo. Un activo al día (§2.6 de `questions.md`) no se pide.
3. **Bajo el cerrojo**: releer `_status.json`, calcular lo que queda de cada cupo y **reservar** tantas llamadas como activos quepan en la fuente principal; escribir `_status.json`. Soltar.
4. **Fuera del cerrojo**: llamar. Tras un `unavailable` o `not_found` en la principal, se pasa al respaldo, que **reserva su llamada bajo el cerrojo** antes (un paso de cerrojo por reserva adicional). Un `blocked` o `rate_limited` retira esa fuente del resto de la ejecución.
5. **Bajo el cerrojo**: releer cada `prices/<asset_id>.jsonl` que se va a tocar, decidir por identidad y valor numérico qué líneas son nuevas, escribirlas (fichero entero nuevo = bytes anteriores + líneas nuevas, temporal `"wx"`, `sync`, `assertOwned`, renombrado); actualizar `_status.json` (fallos seguidos, último éxito, **devolver lo reservado que no se llamó**). Si el proceso muere antes, lo reservado se pierde a favor del proveedor.
6. Decir: activos actualizados por fuente, fallos por tipo, cuántos se quedaron fuera por cupo, cuánto queda de cada cupo, las fuentes que superaron el umbral (código de salida **3**, propuesta).

**Nombres de las órdenes (propuesta):** `atlas prices update`, `atlas prices status`, `atlas prices symbols [<asset_id>]` (ver), `atlas prices symbols set <asset_id> --currency <C> [--eodhd S] [--alpha-vantage S] [--accept-currency]` (confirma con la fuente: 1 llamada del cupo por fuente; con desacuerdo, lo enseña y pide la confirmación explícita, D-Q2), `atlas prices symbols remove <asset_id>`. `atlas prices export --out <fichero>` **no**: la web importa los ficheros de `prices/` tal cual (§6).

## 6. La web (solo lee)

- **Escritorio con carpeta**: `browser/prices.ts` lee `prices/*.jsonl` de los activos del libro de la web (por `asset_id`) y nada más: ni `prices/config.json` (D-Q10) ni nada fuera de `prices/`. Carga diferida, al abrir una vista con valores. Si la carpeta perdió el permiso o un fichero no se lee: `problem`, dicho como en el histórico del BCE.
- **Importación a mano** (escritorio sin carpeta y móvil): se eligen los ficheros de `prices/` (`<input type="file" multiple>`), se validan con el mismo lector del dominio y se guardan en IndexedDB **bajo una clave propia del almacén existente** (`prices:imported`), como el histórico del BCE importado: **sin subir `DB_VERSION`**, que se abriría en el arranque.
- **El móvil** dice: «En el teléfono no hay precios automáticos hasta que exista la sincronización con la nube. Puedes importar a mano los ficheros de precios que descarga la consola.» Y en cualquier dispositivo, un activo del libro de la web sin fichero en `prices/`: «La consola descarga los precios de los activos de su libro; este activo no está en él».
- **El arreglo de `ecb/history.ts`**: `parseLocalConfig` dentro de su propio `try`; `problem: "config"` con el campo que no entiende, traducido con `invalid_local_config`.

## 7. Coste en el paquete web

**Arranque** (D-Q7: sube exactamente lo que midan los cambios de la puerta, tope +0,3 KB, en su propio commit): lo único de la feature en el arranque es el dominio del barril que ya está en él. Medido con un ensayo desechado (`questions.md` Q7): **+121 bytes** del trozo del dominio y +9 de la entrada, **23 bytes de margen**, sin `networth.ts`. Si al implementarlo no cabe, **se para** con la medida (Q7).

**Total** (sube con la regla de siempre, §6.2 P10), estimación trozo a trozo, todo diferido:

| Trozo | Estimación gzip |
|---|---|
| `@atlas/domain/quotes` en la web (lectura de líneas, selección, `ExternalPrices`, aproximación, `quoteDates`) | +4,0 a +5,0 KB |
| Lector de la carpeta e importación (`./prices` de adaptadores) y su pantalla de importación en Ajustes | +2,0 a +2,5 KB |
| Las vistas existentes (Resumen, Cartera, Cubo, contribución): origen, fuente, antigüedad, aproximación, «falta el valor en euros» | +2,0 a +3,0 KB |
| Mensajes en castellano de los códigos nuevos | +0,8 a +1,2 KB |
| Arreglo de `ecb/history.ts` | +0,1 KB |
| **Total** | **+9 a +12 KB** → **271 a 274 KB**; el techo se fija a lo medido más un margen pequeño, en su propio commit |

## 8. Orden de los commits

Bloque 1 (guardianes y sus mutantes; la hoja; el 720 a la hoja; el comentario) → bloque 2 (dominio puro de `quotes/`, la puerta P2, `unit_value_eur` opcional, al 100 %) → bloque 3 (adaptadores, almacén, secretos, censura, fixtures sintéticas) → bloque 4 (consola) → bloque 5 (web, arreglo de `history.ts`, techo del total) → mutación completa → navegador → PR → bloque 6 (el usuario).

## 9. Lo que queda fuera

Lo de §4 del encargo, sin excepción: la nube, el correo (P8), las copias de `prices/`, Yahoo/Stooq/Morningstar, rascar, intradía, precios ajustados, cualquier uso fiscal, los importadores, AWS y aceptar ADRs.

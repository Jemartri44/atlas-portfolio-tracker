# Plan de implementación: Previsiones del esquema para la Fase 5 (`008-fiscal-provisions`)

**Rama**: `feature/008-fiscal-provisions` · **Spec**: [`spec.md`](spec.md) · **Preguntas**: [`questions.md`](questions.md)

**Fecha**: 2026-09-18 · **Estado**: **aprobado por la dirección el 2026-09-18** (doce respuestas en `questions.md`; dos cambian el plan: Q0 y Q3) · **Entrada**: `docs/prompts/008-fiscal-provisions.md`, ADR-0021, ADR-0018, ADR-0022, ADR-0013, ADR-0011, ADR-0009, ADR-0005, ADR-0003

---

## Resumen

Un arreglo previo y tres bloques, en este orden, con commits separados:

0. **El defecto del formulario de la web** (Q0): hoy, en `develop`, una compra en euros produce un borrador sin `fx_rate_date` y el dominio lo rechaza. Va **primero y en commit propio**, para que la dirección pueda separarlo, y con el test que lo congelaba reescrito.
1. **Seis adiciones compatibles** — campos opcionales en el esquema, su validación, su lectura con valor por defecto resuelto en el punto de uso, y los sitios de la CLI donde tiene sentido pedirlos. Cero efecto sobre cualquier cifra.
2. **El evento `swap`** — un tipo nuevo con su validación, su proyección (transmisión + adquisición), la regla del art. 37.1.h y las cuatro direcciones de la regla de recompra. **No entra en el libro sintético.**
3. **El endurecimiento de `fx_rate_date`** en `cash_deposit`, `cash_withdrawal`, `standalone_fee` **y `valuation`** (los cuatro que lo ganaron como opcional en la 005) — solo, el último, en dos commits: uno para la regla y otro para la regeneración del *golden*.

El plan se apoya en cuatro decisiones estructurales:

1. **El orden es la defensa.** El bloque 3 va solo y al final para que el diff del *golden* sea legible. Los bloques 1 y 2 **no tocan `tests/fixtures/ledger/`**, así que cuando llegue el bloque 3 el *golden* está exactamente como en `develop` y el diff es atribuible a una sola causa.
2. **La instantánea es el detector de regresiones.** `synthetic-v1.snapshot.json` es la proyección completa y canónica del libro. Si el endurecimiento moviera **cualquier** cálculo, la instantánea se movería. Exigir que quede **idéntica byte a byte** es una prueba más fuerte que enumerar nueve líneas, y se comprueba sola en el test que ya existe.
3. **El generador no se cree, se contrasta.** La prueba de que el generador no ha cambiado nada más no es leer el diff: es comprobar que el fichero regenerado es **byte a byte igual** al resultado de aplicar al fichero antiguo una transformación trivial de diez líneas (insertar una clave). Dos caminos independientes que tienen que dar el mismo fichero.
4. **Se escribe la predicción antes de generar.** Los veintinueve identificadores, sus fechas de negocio y el `fx_rate_date` que se espera en cada uno están escritos en `golden-expectation.md` **antes** de tocar el generador, y **ya verificados** contra el código de `develop` (§3 de ese documento). Si aparece algo no previsto, la feature para y se pregunta.

---

## Contexto técnico

| | |
|---|---|
| **Lenguaje** | TypeScript 7 estricto, ESM, Node 22 (`.nvmrc`) |
| **Paquetes tocados** | `packages/domain` (el grueso), `apps/cli` (flags y asistentes), `apps/web` (solo lo que los tests de exhaustividad obligan) |
| **Dependencias nuevas** | **ninguna** |
| **Almacenamiento** | Sin cambios. Sigue `schema_version = 1`, sin migraciones nuevas (ADR-0018: ocho cambios compatibles y un endurecimiento dentro de la ventana) |
| **Tests** | Vitest. `packages/domain` al **100 %** de líneas y ramas, bloqueante |
| **Línea base medida en esta rama** | 101 ficheros de test, 1016 tests, 100 % (3184 sentencias, 1618 ramas, 708 funciones, 3061 líneas) |
| **Fixtures** | `tests/fixtures/ledger/`: 12 líneas cambian en total (9 en el *golden*, 1 en cada una de las otras tres) |

---

## Verificación contra la constitución

| Principio | Cómo lo cumple este plan |
|---|---|
| **I — el libro es la fuente de verdad** | Todo lo que se añade se **guarda en el libro**; nada se deriva ni se almacena aparte. La renta en especie de un `grant` se recalcula del libro en cada proyección, no se guarda agregada |
| **II — los lotes son la unidad; la fiscalidad sale solo del libro** | El `swap` es el único añadido que toca lotes, y lo hace por el camino que ya existe (`consume` + `openLot` + `recordGain`), con FIFO global (ADR-0009). **No hereda antigüedad**: se dice en el código, en el tipo y en el test, porque confundirlo con un traspaso es la trampa 1 de `CLAUDE.md`. Ningún campo nuevo entra en un cálculo fiscal |
| **III — compartimentación** | El `swap` rechaza cruzar libros, igual que el `transfer`. La renta en especie no se agrega entre libros |
| **IV — nada codificado que deba ser configurable** | `income_category` es configuración con historial, no una constante. `fee_kind` es un dato del evento. Los valores por defecto están en constantes con nombre y documentadas, no repartidos por el código |
| **V — fallo seguro, nunca silencio** | La ausencia de un campo nuevo se resuelve **en el punto de uso** con su valor por defecto documentado, nunca por eliminación (`?? DEFAULT`, el patrón de `washSaleTransferCounts`). El endurecimiento **rechaza ruidosamente** en vez de asumir una fecha |
| **VI — supervivencia a 20 años** | Cero dependencias. El endurecimiento se hace **ahora** justamente porque en 20 años costaría una versión de esquema y una migración |
| **VII — tests donde un error cuesta dinero** | Los tres casos del art. 37.1.h, las cuatro direcciones de la regla de recompra sobre el `swap`, el rechazo por cada tipo endurecido, y la prueba numérica de que los valores por defecto no mueven nada |

**Sin desviaciones que justificar.** Los dos puntos donde el plan se aparta de la letra del prompt —el patrón de `income_category` (A1) y los tres ficheros de la web (A10)— están preguntados, con su motivo, en `questions.md`.

---

## Bloque 1 — Las seis adiciones compatibles

### 1.1 `Settings.income_category`

| Fichero | Cambio |
|---|---|
| `packages/domain/src/settings/settings.ts` | Tipo `IncomeCategory` y `INCOME_CATEGORIES`; campo `income_category` en `Settings`; `DEFAULT_INCOME_CATEGORY` completo (`capital_gain` × 7); lector `incomeCategoryOf`; validación por valor en `validateSettings`; relleno en `normalizeSettings`; entrada en `DEFAULT_SETTINGS` |
| `packages/domain/src/index.ts` | Exporta el tipo, la constante y el lector |
| `apps/cli/src/commands/catalogue.ts` | `atlas settings set income-category.<asset_type>=<valor>`, con la misma mecánica que `fiscal-date-rule.<tipo>` |
| `apps/cli/src/output/messages.ts` | Mensaje del error `invalid_income_category` |

**Por qué el patrón completo y no el mínimo** (Q1, respondida: *«el error es mío… que no nazca siendo el impar de tres»*). El prompt pedía «el patrón exacto de `fiscal_date_rule`… no metido en `DEFAULT_SETTINGS`». En el código, `fiscal_date_rule` **sí** está en `DEFAULT_SETTINGS` y **sí** lo rellena `normalizeSettings`; lo que está resuelto en el punto de uso es el **lector** (`fiscalDateRuleOf`). Y el motivo que da el prompt —que no se mueva el `fiscal_settings` del *golden*— **ya está garantizado por otra cosa**: el escenario sintético escribe sus propios mapas (`SCENARIO_FISCAL_DATE_RULE`, `SCENARIO_WASH_SALE_WINDOW`) y no hereda `DEFAULT_SETTINGS`, precisamente para que añadir un tipo de activo no reescriba tres líneas del *golden*. Además, ADR-0022 (aceptado ayer, después de escribirse el prompt) nombra `income_category` entre los mapas que un `settings_changed` materializa al escribir. Ser el impar de tres mapas hermanos es como sobreviven las inconsistencias.

**Comprobación**: se verifica, antes de commitear, que `synthetic-v1.snapshot.json` no cambia.

### 1.2 `asset_created.market` e `issuer_country`

| Fichero | Cambio |
|---|---|
| `packages/domain/src/schema/events.ts` | `market?: string`, `issuer_country?: string` en `AssetFields` |
| `packages/domain/src/schema/validate.ts` | `market: opt("string")`, `issuer_country: opt("country")` en `ASSET` |
| `packages/domain/src/projections/catalogue.ts` | El catálogo los conserva; `asset_updated` los deja cambiar (no son cambio de producto) |
| `apps/cli/src/commands/catalogue.ts` | Flags `--market` y `--issuer-country` en `ASSET_FLAGS` |
| `apps/web/src/view-models/forms/specs.ts` | Dos campos opcionales en el formulario `activo`, con su pista |
| `apps/web/src/format/labels.ts` | «Mercado» y «País del emisor» |

Nota sobre la validación: el prompt dice «validado contra la misma lista que ya usa `dividend.source_country`». Esa lista **no existe**: `source_country` se valida con el patrón `/^[A-Z]{2}$/` (regla `country`). Se usa **la misma regla**, que es lo que la frase quiere decir; introducir una lista cerrada de países sería un cambio de criterio que afectaría también a `dividend` y a `account.country`. **Nota N1 de `questions.md`.**

### 1.3 `standalone_fee.fee_kind`

| Fichero | Cambio |
|---|---|
| `packages/domain/src/schema/events.ts` | `FEE_KINDS`, tipo `FeeKind`, campo `fee_kind?` |
| `packages/domain/src/schema/validate.ts` | `fee_kind: { kind: "enum", optional: true, values: FEE_KINDS }` |
| `packages/domain/src/schema/events.ts` o un lector propio | `feeKindOf(event) = event.fee_kind ?? "other"` |
| `apps/cli/src/commands/add.ts` | Flag `--fee-kind` en la especificación de `fee` |
| `apps/web/src/format/labels.ts` | «Tipo de comisión» y los cinco valores |
| `packages/domain/src/projections/costs.ts` | **Solo el comentario**: hoy dice que el campo «no existe todavía». Pasa a decir que existe y que clasificar por él es la Fase 5. Ni una cifra, ni una fila nueva |

### 1.4 `forced_sale.withholding`

| Fichero | Cambio |
|---|---|
| `packages/domain/src/schema/events.ts` | `withholding?: DecimalString` en **`ForcedSaleEntry`** (dentro de `per_account[]`), junto a la `fee?` que ya está ahí |
| `packages/domain/src/schema/validate.ts` | `withholding: opt("decimal")` en `PER_ACCOUNT_RULES.forced_sale` |
| `packages/domain/src/projections/primitives.ts` | En `applyForcedSale`, el efectivo que entra en cada cuenta se reduce por **su propia** retención, sin tocar el valor de transmisión ni el coste de los lotes — exactamente lo que hace `applySell` |
| `apps/cli/src/commands/corporate-actions.ts` | El asistente que genera un `forced_sale` acepta la retención |
| `apps/web/src/format/labels.ts` | Ya existe «Retención» (`withholding`) |

**Por qué por cuenta y no por evento** (Q10, respondida: *«tienes razón y me aparto de la letra de mi propio ADR»*). ADR-0021 dice «misma forma que `sell.withholding`», que sería un importe por evento. Pero un `forced_sale` liquida **cuenta a cuenta** y cada bróker practica su propia retención; un solo importe habría que repartirlo, y el reparto sería una cifra inventada. Es palabra por palabra el motivo por el que la `fee` bajó a `per_account[]` en el hallazgo 8 del *challenge* 2. **La dirección actualiza ADR-0021 el mismo día.**

### 1.5 `corporate_action.neutrality_regime`

| Fichero | Cambio |
|---|---|
| `packages/domain/src/schema/events.ts` | `neutrality_regime?: boolean` |
| `packages/domain/src/schema/validate.ts` | `neutrality_regime: opt("boolean")` |
| `apps/cli/src/commands/corporate-actions.ts` | Flags `--neutrality-regime` / `--no-neutrality-regime`, con el patrón de `--transferable` / `--not-transferable` |
| `apps/web/src/format/labels.ts` | «Régimen de neutralidad» |

Nada más. No toca `KIND_RULES` ni ninguna primitiva: qué secuencia admite cada `kind` sigue decidiéndolo el usuario.

### 1.6 `grant.income_eur` e `income_base`

| Fichero | Cambio |
|---|---|
| `packages/domain/src/schema/events.ts` | `INCOME_BASES = ["general", "savings"]`, `income_eur?`, `income_base?` en `GrantEffect` |
| `packages/domain/src/schema/validate.ts` | Los dos opcionales, y una regla de consistencia: uno sin el otro se rechaza |
| `packages/domain/src/projections/state.ts` | `inKindIncome: InKindIncome[]` en `LedgerState` |
| `packages/domain/src/projections/primitives.ts` | `applyGrant` empuja una entrada cuando el efecto trae `income_eur` |
| `packages/domain/src/projections/snapshot.ts` | Clave `in_kind_income` (Q4 respondida: **añádela**; una línea en la instantánea del *golden*, en el commit del bloque 1 y nunca en el del 3) |
| `apps/cli/src/commands/corporate-actions.ts` | El asistente de `crypto_fork` puede declararla |
| `apps/web/src/format/labels.ts` | «Renta imputada (EUR)» y «Base de la renta» |

**Lo que NO hace**: no entra en `investmentIncome`, ni en `realizedGains`, ni en ninguna base imponible, ni en `netWorth`. Quién tributa qué es Fase 5 y es criterio en disputa (`fiscal-questions.md` #8).

### 1.7 Criterio para la CLI y los formularios

Se pide **donde el dato se conoce en ese momento y no se puede reconstruir después**:

| Campo | ¿Se pide? | Por qué |
|---|---|---|
| `market`, `issuer_country` | **Sí**, en el alta de activo (CLI y web), opcionales | Es el único momento en que el usuario tiene el folleto delante. Dentro de tres años no se reconstruye |
| `fee_kind` | **Sí**, en `atlas add fee`, opcional | El extracto lo dice; la memoria no |
| `withholding` de `forced_sale` | **Sí**, en el asistente que ya pregunta el precio de liquidación | Es un número del justificante |
| `neutrality_regime` | **Sí**, en los asistentes de `merger`, `spin_off`, `share_class_change` y `issuer_restructuring` | Es una lectura del folleto, no un cálculo |
| `income_eur` / `income_base` | **Sí**, en el asistente de `crypto_fork` | Es el valor de mercado del día del fork, que mañana no se sabe |
| `income_category` | **Sí**, en `atlas settings set` | Es configuración; no se pregunta al operar |
| Todos ellos en la web | **No**, salvo los dos del alta de activo | Los demás no tienen formulario propio en la web y crearlo es alcance de otra feature |

---

## Bloque 2 — El evento `swap`

### 2.1 Forma

```jsonc
{
  "type": "swap",
  "account_id": "acc_ibkr",
  "trade_date": "2029-03-04",
  "value_date": "2029-03-04",
  "from_asset_id": "ast_btc",      // lo entregado
  "quantity_out": "0.5",
  "market_value_out": "21000",     // valor de mercado de lo entregado, en `currency`
  "to_asset_id": "ast_eth",        // lo recibido
  "quantity_in": "8",
  "market_value_in": "21150",      // valor de mercado de lo recibido
  "currency": "EUR",
  "fx_rate": "1",
  "fx_rate_date": "2029-03-02",
  "fee": "12",
  "thesis_id": "th_...",           // solo en el cubo
  "source": "manual",
  "fingerprint": "sha256:…"
}
```

Vocabulario deliberadamente **el de `transfer`** (`from_*`, `quantity_out`, `to_*`, `quantity_in`): son las dos operaciones de dos patas del libro y nombrarlas distinto solo obligaría a recordar cuál es cuál. Lo que las distingue está donde se ve: el tipo, los dos `market_value_*` (que un traspaso no tiene) y la ausencia de `nav_*`.

### 2.2 Regla de valoración (art. 37.1.h)

```
value = max(market_value_out, market_value_in)      // en `currency`, exacto
proceeds_eur = (value − fee) / fx_rate              // valor de transmisión de lo entregado
cost_eur     = value / fx_rate                      // coste de adquisición de lo recibido
```

Una función pura propia, `swapValuation`, con sus tres tests (entregado mayor, recibido mayor, iguales) y una propiedad: **conmutar los dos valores no cambia `value`**.

El tratamiento del `fee` lo confirma la dirección (Q5): resta de lo transmitido, como en `sell`, porque la pata de salida de un `swap` *es* una transmisión. **Pero no es cosa resuelta**: es un criterio fiscal nuevo, cuya dirección de riesgo es **agresiva en el momento** (baja la ganancia de este ejercicio y sube la de uno futuro). Queda anotado en `questions.md` §«Criterio fiscal nuevo» para que la dirección lo incorpore a `docs/fiscal-questions.md` con su certeza declarada.

### 2.3 Efecto sobre el estado

En `packages/domain/src/projections/operations.ts`, un `applySwap` que hace, en este orden:

1. `requireAccount`, `requireAsset` de las dos patas, `assertSameBook` de cada una y rechazo si los dos libros no coinciden (`book_mismatch`) o si `from_asset_id === to_asset_id` (`swap_same_asset`).
2. Tesis: en el cubo, la pata de **entrada** exige tesis abierta del activo recibido (como un `buy`); la de **salida** avisa si no enlaza ninguna (como un `sell`). Q6 respondida: *«no abrimos un agujero en la regla 15 por comodidad»*.
3. `requireAvailable` de la pata de salida (posición física de la cuenta y lotes abiertos del activo).
4. `adjustCash` por el `fee` (y solo por el `fee`).
5. `adjustPosition` −`quantity_out` y +`quantity_in`.
6. `consume` de los lotes del activo entregado y `recordGain` con `proceeds_eur`.
7. `openLot` del activo recibido con `acquisition_date` = fecha fiscal del swap y `cost_eur`. **Sin `source_lot_id`**: no hay linaje, porque no hay herencia.
8. `noteAcquisition` + `warnRepurchase` del activo **recibido**.
9. Si la ganancia es negativa, `warnPriorBuys` del activo **entregado**.
10. `warnCurrency` de las dos patas y `warnFxDate` contra la fecha fiscal.
11. `warnHolders` del activo recibido.

Los pasos 8 y 9 son el hueco de la PR #40 escrito a propósito: ahí se había puesto el aviso solo en una dirección y el caso central del núcleo no avisaba durante tres semanas.

### 2.4 Fechas

Cada pata deriva su fecha fiscal de su propio `asset_type` (`fiscalDateOf`), como `buy` y `sell`. El evento se **ordena** (`businessDateOf`) por la de la pata **entregada**, que es la del hecho imponible. Si las dos difieren, aviso `swap_fiscal_dates_differ`. En el caso que motiva el evento (cripto por cripto) son la misma.

### 2.5 Ficheros

| Fichero | Cambio |
|---|---|
| `schema/envelope.ts` | `swap` en `SUPPORTED_EVENT_TYPES` (23 → 24) |
| `schema/events.ts` | `SwapEvent`, en la unión `SupportedEvent` |
| `schema/validate.ts` | Reglas, par divisa/tipo en `FX_PAIRS`, `fx_rate_date` en `FX_DATE_FIELDS`, consistencia (`from ≠ to`, cantidades positivas) |
| `schema/fingerprint.ts` | Tupla de idempotencia: `source`, `broker_ref`, `account_id`, `from_asset_id`, tipo, `value_date`, `quantity_out`, `market_value_out`, `currency` |
| `money/` (nuevo módulo pequeño o dentro de `operations.ts`) | `swapValuation` |
| `projections/operations.ts` | `applySwap` |
| `projections/project-ledger.ts` | Despacho, `businessDateOf`, `recordUsage` |
| `projections/ledger-entries.ts` | Cómo se resume un `swap` en la lista de movimientos |
| `apps/cli/src/commands/add.ts` | `atlas add swap` con sus flags |
| `apps/cli/src/commands/shared.ts` | Alias de flags `from-asset`/`to-asset` ya existen |
| `apps/web/src/format/labels.ts` | «Permuta» y los campos nuevos |
| `apps/web/src/view-models/movements.ts` | La cifra que responde «¿cuánto?» para un `swap` |
| `packages/domain/test/samples.ts` | Muestra obligatoria (el mapa `SAMPLES` es exhaustivo por tipo) |
| `packages/domain/test/schema/envelope.test.ts` | 23 → 24 |
| `packages/domain/test/synth/generator.test.ts` | El comentario del test de cobertura de tipos deja de decir «todos los de §3» y dice cuáles faltan y por qué |

### 2.6 Lo que el `swap` NO hace

- No entra en el libro sintético (Q7 respondida: de acuerdo, y el motivo decisivo es que un subflujo protege los identificadores pero **no** la instantánea).
- No cierra órdenes (`order_placed.side` es `buy | sell`).
- No admite `amount`: sus dos valores de mercado **son** la base.
- No hereda antigüedad ni coste. Se dice en el tipo, en el comentario y en un test con ese nombre.
- No tiene formulario en la web.

---

## Bloque 3 — El endurecimiento, solo y el último

Dos commits. El primero cambia la regla y arregla las fixtures de forma; el segundo, y solo el segundo, regenera el *golden*.

### 3.1 Commit A — la regla

| Fichero | Cambio |
|---|---|
| `packages/domain/src/schema/events.ts` | `fx_rate_date: CivilDate` (deja de ser `?`) en `CashMovementFields`, `StandaloneFeeEvent` **y `ValuationEvent`** |
| `packages/domain/src/schema/validate.ts` | `opt("date")` → `req("date")` en `CASH_MOVEMENT`, `standalone_fee` y `valuation`. El comentario de `FX_DATE_FIELDS` deja de decir «opcional en estos cuatro» |
| `packages/domain/src/projections/fx-rates.ts` | Comentario: ya no hay tipos que puedan traer el tipo sin su fecha |
| `packages/domain/src/synth/scenario.ts` | `deposit()`, `fee()`, `withdrawal()`, el `cash_deposit` del subflujo `bucket-programme` y la rama en euros de `valuation()` emiten `fx_rate_date: lastWorkingDay(fecha de negocio)`. Las dos `valuation` de los subflujos (`benchmark-valuations` y la del cubo) también |
| `tests/fixtures/ledger/valid-v1.jsonl` | 1 línea |
| `tests/fixtures/ledger/legacy-v1-for-test-schema.jsonl` | 1 línea |
| `tests/fixtures/ledger/number-amount.jsonl` | 1 línea |
| Tests y ayudantes con eventos de efectivo en línea | `ledger-builder.ts`, `samples.ts`, `adapters/test/fixtures.ts` y los tests que construyen cash a mano |
| `apps/cli/src/commands/add.ts` | `fx-rate-date` deja de ser opcional de hecho: se documenta en la ayuda |
| `apps/web/src/view-models/forms/specs.ts` | **Ver N2**: el formulario de efectivo en euros no envía hoy `fx_rate_date`. Hay que decidirlo antes de commitear este bloque |

Tras este commit, `npm test` está **rojo en un solo sitio**: el test del *golden*. Es deliberado y es la señal de que la regla ha mordido exactamente donde tenía que morder. El commit B lo cierra.

### 3.2 Commit B — la regeneración, y cómo se demuestra que solo cambian nueve líneas

Este es el procedimiento completo. Se ejecuta en este orden y **no se salta ningún paso**.

**Paso 0 — la predicción, escrita antes de tocar nada, y ya verificada.** Está completa en [`golden-expectation.md`](golden-expectation.md): **veintinueve** líneas con su `id`, su fecha de negocio y su `fx_rate_date` esperado. Resumen de las nueve de efectivo y comisión:

| # | línea | `id` | tipo | `value_date` | día | `fx_rate_date` esperado |
|---|---|---|---|---|---|---|
| 1 | 16 | `01M1F21ZW0HVXPN5PPFMFCCETJ` | `cash_deposit` | 2026-08-25 | martes | **2026-08-25** |
| 2 | 17 | `01M1F220V89HEEBMV38X6TZ7BV` | `cash_deposit` | 2026-09-01 | martes | **2026-09-01** |
| 3 | 18 | `01M1F221TG3J2S13Z3EAKDPFGG` | `cash_deposit` | 2026-09-01 | martes | **2026-09-01** |
| 4 | 41 | `01M9XDRZ80XC95VT3Q0Z1MERPN` | `standalone_fee` | 2026-12-15 | martes | **2026-12-15** |
| 5 | 88 | `01MZ56PS6GTKPEKQYKP0GSAZWJ` | `cash_deposit` | 2027-09-02 | jueves | **2027-09-02** |
| 6 | 138 | `01NJ4WGC78TAC9QYZDB4WZXCP1` | `cash_withdrawal` | 2028-04-08 | **sábado** | **2028-04-07** (viernes) |
| 7 | 146 | `01NP0FJV8015S112R2DHPJ3PNP` | `standalone_fee` | 2028-06-15 | jueves | **2028-06-15** |
| 8 | 155 | `01NWVBBZ78ZF4XD31K965DE3ET` | `cash_deposit` | 2028-09-05 | martes | **2028-09-05** |
| 9 | 180 | `01MCD83A6GQM6VQY66FCFBD47M` | `cash_deposit` | 2027-01-15 | viernes | **2027-01-15** |

Y las veinte valoraciones, entre ellas las **cinco del 31/12/2028, que cae en domingo** y cuyo tipo es el del **viernes 2028-12-29** — el caso exacto del hallazgo 6 del tercer *challenge*, y el motivo por el que la dirección metió `valuation` en el endurecimiento.

**Seis de las veintinueve no toman su propia fecha** (el `cash_withdrawal` del sábado y las cinco valoraciones del domingo). Si el fichero regenerado pusiera ahí la fecha del fin de semana, la regla `fx_rate_date_weekend` lo rechazaría y el error saldría en la carga, no en el diff.

La predicción incluye también: **200 líneas antes y 200 después**; **ningún** `id`, `recorded_at`, `fingerprint`, importe ni orden cambia; la clave nueva va **inmediatamente después de `fx_rate`** en cada línea (es donde la pone el generador, porque `canonicalLine` conserva el orden de inserción del borrador y `completeDraft` añade la huella al final).

**Y algo que ya no hay que prometer, porque está hecho.** Como `fx_rate_date` es *hoy* opcional, el fichero con las veintinueve claves ya es válido sin cambiar código. Se construyó y se comprobó **contra el código de `develop`, antes de escribir nada**: carga, da 200 eventos, y su `snapshotOf(projectLedger(...))` es **idéntico byte a byte** a `synthetic-v1.snapshot.json`; ninguna clave eliminada, ningún valor modificado, claves añadidas solo en los veintinueve `id` previstos. Lo único que queda por demostrar en el bloque 3 es que **el generador produce exactamente ese fichero**.

**Paso 1 — el fichero de contraste, construido sin el generador.** Un script de una sola pasada (en el *scratchpad*, no en el repositorio) toma el `synthetic-v1.jsonl` **de `develop`**, y para cada línea cuyo tipo sea uno de los **cuatro** y que no tenga ya `fx_rate_date`, inserta la clave con el valor de la tabla, justo detrás de `fx_rate`, respetando el resto de bytes. Produce `expected.jsonl`. El script entero está en `golden-expectation.md` §4.

**Paso 2 — la regeneración.** `npm run atlas -- synth --out <scratchpad>/regenerated.jsonl --seed 1`. El comando ya verifica por su cuenta (`integrity` + `deepCheck`) y aborta si el libro generado no cuadra.

**Paso 3 — las cuatro comparaciones.** Todas tienen que pasar:

1. `sha256(regenerated.jsonl) == sha256(expected.jsonl)`. **Byte a byte.** Si falla, el generador ha hecho algo más y la feature para.
2. `wc -l` idéntico (200) y, línea a línea, `id`, `recorded_at` y `type` idénticos a los de `develop`.
3. Diff estructural por claves: para cada par de líneas, el conjunto de claves añadidas es `{}` salvo en los veintinueve identificadores previstos, donde es `{fx_rate_date}`; el conjunto de claves eliminadas o con valor distinto es `{}` en las 200.
4. `snapshotOf(projectLedger(regenerated))` es **idéntico** a `synthetic-v1.snapshot.json`, que **no se regenera**. Esta es la que detecta una regresión de proyección disfrazada de «diff esperado»: la instantánea contiene cuentas, activos, configuración fiscal, posiciones, efectivo, lotes, ganancias, rentas, valoraciones, órdenes, traspasos, tesis, avisos e inválidos. Si algo se moviera, se movería aquí.

**Paso 4 — por qué la comparación 4 tiene que pasar, dicho antes de ejecutarla.** Los veintinueve eventos están **en euros** con `fx_rate: "1"`. La única proyección que lee `fx_rate_date` de un evento de efectivo es `noteFxRates`, y lo primero que hace es **saltarse el euro** (`pair.currency === EUR → continue`). `fxRates` además no entra en la instantánea. `fingerprintOf` no incluye `fx_rate_date` en su tupla para estos tipos, y `valuation` ni siquiera tiene huella. `snapshotOf` serializa una `valuation` sin `fx_rate_date`. `warnFxDate` solo se invoca desde `applyBuy` y `applySell`, y **no se le añade invocación** en este bloque. Por tanto no hay camino por el que la clave nueva pueda mover una cifra. Si la comparación 4 fallara, el hallazgo es justamente que ese razonamiento tiene un agujero, y se para.

**Paso 5 — el commit.** Solo `tests/fixtures/ledger/synthetic-v1.jsonl`. Mensaje:

```
test(fixtures): date the ECB rate of the 29 cash, fee and valuation events
```

y, como excepción a la regla de una sola línea (la dirección lo verificará id por id), el cuerpo enumera los veintinueve identificadores con su fecha de negocio y su `fx_rate_date`, más las cuatro comparaciones y su resultado.

**Paso 6 — si algo no cuadra.** Cualquier diferencia no prevista: **se para, no se toca el fichero y se pregunta.** No se «ajusta la expectativa».

### 3.3 Lo que este bloque deliberadamente no hace

- **No añade `warnFxDate` a los eventos de efectivo ni a las valoraciones**, aunque ahora tendrían el dato: sería una regla nueva y cambiaría los avisos de la instantánea. Queda como posible mejora de la Fase 5.
- **No rellena `fee_kind` en el escenario** (Q8): obligaría a una segunda regeneración del *golden* en la misma feature, que es lo que hace ilegible un diff.
- **No toca `docs/`**. La lista exacta de secciones que quedan desactualizadas está en `questions.md` §«Documentos que quedan desactualizados», para que la dirección no tenga que rastrearlas.

---

## Orden de trabajo y commits

| # | Commit | Bloque |
|---|---|---|
| 0 | `docs(008): spec and plan for the fiscal schema provisions` | artefactos |
| 1 | `fix(web): keep the ECB rate date on a draft the form hides` | 0 (Q0) |
| 2 | `feat(settings): add the income category per asset type` | 1.1 |
| 3 | `feat(schema): record where an asset trades and where its issuer sits` | 1.2 |
| 4 | `feat(schema): tell one kind of standalone fee from another` | 1.3 |
| 5 | `feat(corporate): carry the withholding of a forced sale` | 1.4 |
| 6 | `feat(schema): record whether a corporate action takes the neutrality regime` | 1.5 |
| 7 | `feat(corporate): record the income a grant hands over in kind` | 1.6 |
| 8 | `feat(cli): ask for the new fields where they are still knowable` | 1.7 |
| 9 | `feat(schema): add the swap event with its article 37.1.h valuation` | 2.1–2.2 |
| 10 | `feat(projections): project a swap as a disposal and an acquisition` | 2.3–2.4 |
| 11 | `feat(cli): add the swap wizard` | 2.5 |
| 12 | `feat(schema): require fx_rate_date on cash, fee and valuation events` | 3.1 |
| 13 | `test(fixtures): date the ECB rate of the 29 cash, fee and valuation events` | 3.2 |

`npm run lint` en verde **antes de cada commit** y otra vez como último paso antes de entregar.

---

## Estrategia de test

| Qué | Dónde | Por qué |
|---|---|---|
| Los tres casos del art. 37.1.h + conmutatividad | `test/projections/swap.test.ts` | Es la regla de dominio de la feature |
| Las cuatro direcciones de la regla de recompra sobre un `swap` | `test/projections/wash-sale.test.ts` | Es el hueco de la PR #40 |
| Swap con pérdida + recompra del activo entregado dentro de la ventana | `test/projections/wash-sale.test.ts` | Caso límite exigido por el prompt |
| Un swap **no** hereda antigüedad ni coste | `test/projections/swap.test.ts` | Trampa 1 de `CLAUDE.md`, con ese nombre en el test |
| Rechazo por cada tipo endurecido, con y sin campo, y en fin de semana | `test/schema/validate.test.ts` | Ocho tests, cuatro tipos |
| El borrador de la web en euros es **válido para el dominio** | `apps/web/test/view-models.test.ts` | Reescribe el test que congelaba el defecto de la Q0 |
| **Prueba de que los valores por defecto no cambian nada** | `test/projections/defaults.test.ts` (nuevo) | Construye dos libros idénticos salvo por los campos nuevos y compara `snapshotOf`. Es FR-040 con números |
| Instantánea del *golden* sin regenerar | `test/synth/generator.test.ts` (existente) | Detector de regresión del bloque 3 |
| Etiquetas y formularios exhaustivos | `apps/web/test/format.test.ts`, `view-models.test.ts` (existentes) | Ya fallan solos si falta una etiqueta |
| Propiedades de `swapValuation` | `test/properties/` | `max` conmutativo, resultado no negativo con entradas no negativas |

Cobertura: cada rama nueva (cada `??` de valor por defecto, cada rechazo) lleva su test. El 100 % no se negocia.

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| **Una regresión se cuela disfrazada de «diff esperado»** en el *golden* | Los cuatro contrastes del paso 3, y sobre todo la igualdad byte a byte con un fichero construido sin el generador, y la instantánea sin regenerar |
| **El formulario de efectivo de la web deja de escribir** tras el endurecimiento | Resuelto: el defecto (que ya existe hoy en `buy`, `sell`, `dividend` e `interest` en euros) se arregla en el **commit 1**, antes que nada, con el test que lo congelaba reescrito para exigir un borrador válido |
| Añadir un tipo de evento rompe tests de exhaustividad en tres paquetes | Es deseable: son las listas de comprobación del proyecto. Se recorren todas antes de commitear el bloque 2 |
| `income_category` divergiendo de sus dos mapas hermanos | Resuelto (Q1): patrón completo, como sus dos hermanos, con ADR-0022 como respaldo |
| El `swap` tentando a meterse en el libro sintético | Resuelto (Q7): no entra. El escenario ni siquiera tiene un activo de tipo `crypto`, así que meterlo costaría altas, compras y un diff que haría ilegible el del bloque 3 |
| Conflicto con el agente que trabaja en `apps/web/src/format/messages/` | No se toca ese directorio. Se tocan `apps/web/src/format/labels.ts`, `apps/web/src/view-models/forms/specs.ts` y `apps/web/src/view-models/forms/values.ts`. Confirmado en **Q9** |

---

## Entregables

```text
specs/008-fiscal-provisions/
├── spec.md                  # qué y por qué
├── plan.md                  # este fichero
├── questions.md             # lo que no resuelvo por mi cuenta
├── golden-expectation.md    # la predicción, escrita antes de regenerar (bloque 3)
└── tasks.md                 # tras el visto bueno
```

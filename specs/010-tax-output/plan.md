# Plan de implementación: La salida fiscal (`010-tax-output`)

**Rama**: `feature/010-tax-output` · **Spec**: [`spec.md`](spec.md) · **Preguntas**: [`questions.md`](questions.md)

**Fecha**: 2026-09-19 · **Estado**: **borrador para el visto bueno**. Sin código hasta que la 009, el rediseño y la PR #59 estén en `develop`. · **Entrada**: `docs/prompts/010-tax-output.md` (con §7), ADR-0020, ADR-0022, ADR-0021, ADR-0013, ADR-0016, ADR-0018, ADR-0003, ADR-0015, ADR-0019, ADR-0023.

---

## Resumen

Seis bloques y cuatro demostraciones, en el orden del prompt (§3):

0. **La corrección del motor (P5), la configuración nueva y los cálculos a mano**, estos antes que el código que los calcula.
1. **`tax_return_filed`**: forma, validación, proyección en la pasada A, cadena de complementarias, huella, ejercicio cerrado, ancla desde el libro y comparación con sus causas.
2. **La Renta por casillas**: conceptos del dominio y casillas como datos del ejercicio 2025.
3. **Los modelos 720 y 721** en `packages/domain/src/informative/`, fuera de `tax/`.
4. **La web**: `/fiscal`, la tarjeta del Resumen, el formulario de lo presentado y el ejercicio cerrado en Registrar, Movimientos y Configuración.
5. **La CLI**: `atlas tax --boxes`, `atlas m720`, `atlas m721`, `atlas filed`, y los avisos de cierre.

Las demostraciones: los tres cálculos a mano y la Renta de 2025 por casillas (§6), la Renta sin precios con el 720 dentro (§7), los valores por defecto (§8) y el navegador (§9).

Cinco decisiones de diseño sostienen el plan:

1. **Una sola cadena de ejercicios, con el ancla dentro.** `computeCore` se parte en una cadena (`taxChain`) que recorre los ejercicios, construye el ancla **desde el libro** y devuelve por ejercicio la base, los pendientes y el diferido a 31/12. `taxYear`, `movedTaxYears`, el aviso de ejercicio cerrado y la comparación de lo declarado la usan todos. `TaxOptions.filed` desaparece: el ancla no tiene otra puerta.
2. **Las presentaciones son documentos administrativos de la pasada A**, como las tesis: se proyectan en orden de fichero y cada consulta las filtra por `filed_at`. La cadena de complementarias se valida al proyectar, y anular una sustituida se rechaza por la vía que ya existe para lo consumido (ADR-0003), sin código nuevo en `rectify.ts`.
3. **Los modelos informativos viven en su módulo y leen precios por la única puerta.** `informative/` importa `prices.ts` y la proyección; nada de `tax/` ni `project-ledger.ts` lo alcanza. `prices.ts` gana la fecha del tipo en lo que devuelve, porque la regla del 31/12 la necesita.
4. **La web no calcula nada.** Todo lo que decide (qué presentación está en vigor, qué casilla, qué veredicto, si la tarjeta sube) es una función del dominio; la web pone nombres en llano y enmascara.
5. **Nada nuevo en el informe de la Renta si no hay presentaciones.** Lo que el informe gana (el cierre, la comparación) es opcional y solo aparece con una presentación en vigor; el informe fiscal del libro sintético no se mueve.

---

## Contexto técnico

| | |
|---|---|
| **Lenguaje** | TypeScript estricto, ESM, Node 22 (`.nvmrc`) |
| **Base de la rama** | `feature/visual-system` (`2cdc078`) + el commit de la PR #60 (`docs/`). Se rebasa sobre `develop` cuando las tres estén integradas |
| **Paquetes tocados** | `packages/domain` (el grueso), `apps/cli`, `apps/web` |
| **Dependencias nuevas** | **ninguna**. El navegador, con el Chromium de Playwright de `~/.cache/ms-playwright/` conducido desde el *scratchpad* |
| **Almacenamiento** | Un tipo de evento nuevo (compatible, ADR-0018); campos opcionales de `Settings` (compatibles). Sigue `schema_version = 1`; el catálogo pasa a **25 tipos** |
| **Línea base medida en esta base** | 156 ficheros de test, **1479 tests**; `packages/domain` al 100 % (4333 sentencias, 2238 ramas, 975 funciones, 4131 líneas) |
| **Fixtures** | El *golden* (`synthetic-v1.jsonl`) **no gana eventos**. Las presentaciones se construyen con `LedgerBuilder`. Su instantánea solo gana `filings: []` (§8, predicción antes) |
| **Rendimiento** | Un informe con presentación proyecta hasta 4 cadenas más (§1.6). Un 720 proyecta a 31/12, al 30/09 y en cada fecha del cuarto trimestre con un movimiento de efectivo en una cuenta extranjera (§3.3). Se mide en el móvil con la CPU ×4 |

---

## Verificación contra la constitución

| Principio | Cómo lo cumple este plan |
|---|---|
| **I — el libro es la fuente de verdad** | Lo presentado vive en el libro (ADR-0020) y es un hecho, no un derivado. La salida por casillas y los modelos se recalculan en cada consulta; no se guarda nada calculado salvo `computed`, que es el registro de lo que la aplicación dijo aquel día, no una caché |
| **II — fiscalidad solo del libro** | La Renta no lee precios: el test de arquitectura lo prohíbe a cualquier profundidad, también el módulo de los modelos; el borrado de precios **y de presentaciones `720`/`721`** deja todo idéntico; el ancla solo lee `renta` y solo sus pendientes. Anular una sustituida se rechaza (ADR-0003) |
| **III — compartimentación** | Primera excepción, y solo ella: la salida por casillas, el 720 y el 721 agregan los dos libros **por contribuyente**, rotulados «total fiscal» |
| **IV — nada codificado** | Umbrales, subida, aviso y temporada, en `Settings` con valor por defecto documentado y materializados (ADR-0022). Las casillas son **datos por ejercicio con fuente y fecha**, nunca constantes sin procedencia |
| **V — fallo seguro** | Nunca «no obligado» con datos incompletos; una valoración o un tipo de otra fecha se enseñan marcados; sin casillas comprobadas, conceptos sin números; «no se puede calcular todavía» nunca con tono de error |
| **VI — supervivencia** | Cero dependencias. El evento es JSON legible sin la aplicación; la huella es un SHA-256 de un texto canónico documentado |
| **VII — tests primero donde un error cuesta dinero** | Los cálculos a mano comiteados antes; los casos límite con nombre; los mutantes del prompt con su test; la prueba sin precios en tres formas |

**Desviaciones**: ninguna. Lo que el plan decide y el prompt no fija está en `questions.md` como pregunta o como ficha de criterio.

---

## Bloque 0 — Corrección del motor, configuración y cálculos a mano

### 0.1 La cadena empieza en la primera Renta presentada (P5), primer commit

Hoy `computeCore` fija `firstYear = min(year, años con cifras)` y solo busca el ancla de los años que recorre. **Verificado en esta rama**: con un libro que empieza en 2026 (una ganancia de 300,00) y un ancla de 2025 con −200,00 pendientes de 2023, la base de 2026 sale **300,00** en lugar de 100,00 y el informe no trae ancla.

Arreglo: `firstYear = min(year, primer año con cifras, primer año anclado)`. El «nunca antes de 2018» lo garantizan la validación del evento (bloque 1) y el rechazo actual de cifras anteriores. En este commit el ancla todavía llega por `options.filed` (el evento no existe aún); el bloque 1 la mueve dentro sin tocar esta regla.

Test, con su nombre: *«a return filed for 2025 anchors a ledger that starts in 2026: its losses offset and then expire»*. La Renta de 2025 declara pendientes de 2022 (−100) y de 2023 (−400); 2026 tiene +300: se compensan, los más antiguos primero, los 100 de 2022 y 200 de 2023, y quedan −200 de 2023; 2027 no tiene cifras: `tax_loss_expires` de esos −200 al cierre de 2027. Hoy la base de 2026 sale 300,00 y nada caduca. Y el informe de 2025 marca el ancla como **anterior al libro** (`AnchorDifference.before_ledger: true`), para que la salida diga «traídas de lo declarado» y no «difieren de lo calculado».

### 0.2 Configuración nueva

Mismo patrón que `savings_offset_limit_pct` en la 009: opcionales en `Settings`, resueltos en el punto de uso (`model720ThresholdOf`, …) con su valor por defecto documentado «según se entiende en septiembre de 2026, verificar», y **materializados** por `normalizeSettings` (ADR-0022, N12 de la 009).

| Parámetro | Por defecto | Fuente de la cifra |
|---|---|---|
| `model_720_threshold_eur` | `"50000"` | Arts. 42 bis.4.e) y 42 ter.4.c) RD 1065/2007 |
| `model_720_increase_eur` | `"20000"` | Arts. 42 bis.5 y 42 ter.5 |
| `model_720_alert_threshold_eur` | `"45000"` (hoy sin valor por defecto en el código) | `business-rules.md` §7 |
| `model_721_threshold_eur` | `"50000"` | Art. 42 quater.5.d) |
| `model_721_increase_eur` | `"20000"` | Art. 42 quater.6 (**nuevo respecto al prompt**: las fuentes confirman que la regla se aplica al 721, nota N3) |
| `model_721_alert_threshold_eur` | `"45000"` | `business-rules.md` §7 |
| `renta_season_start` / `renta_season_end` | `"04-01"` / `"06-30"` | §7, P1 del prompt |

Validación: los cinco importes, decimales ≥ 0 (en `DECIMAL_RANGES`); **un aviso por encima de su umbral** se rechaza con `alert_above_threshold` (`{ model, alert, threshold }`); la temporada, `MM-DD` de un día que exista en un año bisiesto, con el inicio no posterior al fin, o `invalid_renta_season`. Los dos códigos, traducidos en `apps/cli/src/output/messages.ts` y en `apps/web/src/format/messages/errors.ts`, con los importes por `f.money`. En la CLI, `atlas settings set` gana los siete *flags* (`ARITY` no cambia; `BOOLEAN_FLAGS` tampoco: ninguno es booleano). En la web, el grupo *Umbrales y avisos* de Configuración gana los cinco importes nuevos y el grupo *Identidad fiscal*, la temporada; enmascarados con la privacidad activa (`system.md` §7.7).

El informe de la Renta **no** lista estos parámetros en `settings.from_code`: no mueven ninguna cifra de la Renta. El del 720 y el del 721 tienen su propio `from_code`.

### 0.3 Los cálculos a mano

Los cuatro de §6 se escriben en `questions.md` y se comitean **antes** que el código que los calcula: el de la complementaria antes del bloque 1, los dos del 720 antes del bloque 3, la Renta de 2025 por casillas antes del bloque 2. Cada uno lo codifica después un test con los literales copiados de `questions.md`; toda discrepancia se investiga y se documenta allí sin tocar el literal hasta saber quién tenía razón.

---

## Bloque 1 — `tax_return_filed`

### 1.1 Forma

Envoltorio de §2 + estos campos. Importes, cadenas decimales en euros; los pendientes y el diferido, **con su signo** (negativos), como en el motor y en `FiledAnchor` (S12).

```json
{"type":"tax_return_filed","model":"renta","tax_year":2025,"filed_at":"2026-06-18",
 "receipt_reference":"100-2025-XXXXXXXXXXXX","supersedes":"01K…",
 "declared":{"savings_base_eur":"175.70",
   "pending_losses":[{"origin_year":2024,"category":"capital_gain","amount_eur":"-260.80"}],
   "deferred_losses_eur":"-20.00"},
 "computed":{"as_of":"2026-06-20","settings_origin":"01K…","settings":{…},
   "savings_base_eur":"175.70","pending_losses":[…],"deferred_losses_eur":"-20.00"},
 "ledger_fingerprint":{"schema_version":1,"lines":187,"sha256":"…"},
 "notes":"…"}
```

`declared` y `computed` de un **720**:

```json
{"accounts":{"balance_eur":"15500.00","q4_average_eur":"15710.47"},
 "securities":{"value_eur":"51000.92"},
 "items":[
   {"category":"accounts","account_id":"acc_ib","balance_eur":"17000.00","q4_average_eur":"15471.34"},
   {"category":"securities","account_id":"acc_ib","asset_id":"etf_us","value_eur":"15000.91"}]}
```

Una categoría ausente es una categoría **no declarada**. Un bien de efectivo es **la cuenta**; uno de valores, **(cuenta, activo)** (S11). El **721** tiene la misma forma con una sola categoría, `crypto`. `computed` añade siempre `as_of` (el día del cálculo), `settings_origin` (el `settings_changed` en vigor o `"default"`) y `settings`: la configuración **resuelta entera** (`normalizeSettings`), porque con `from_code` no vacío el `settings_changed` solo no permite reproducir (S13).

### 1.2 Validación de forma (`validateShape`)

- `model` ∈ `renta | 720 | 721`; `tax_year` entero ≥ 2018 (el motor no admite antes); en el 721, ≥ 2023, primer ejercicio del modelo (nota N4).
- `filed_at`: fecha posterior al 31/12 de `tax_year` (`filed_at_not_after_year`) y **no posterior al día de `recorded_at` en Madrid** (`filed_at_in_future`): nadie registra hoy lo que presentará mañana.
- `receipt_reference`: texto no vacío. `supersedes?`: ULID.
- `declared` y `computed` con la forma de su modelo; pendientes con `origin_year` ≤ `tax_year` y sin repetir (origen, categoría), importe < 0; base ≥ 0; diferido ≤ 0; en 720/721, cada bien con su categoría y sus identificadores, sin repetir.
- `ledger_fingerprint` con los tres campos.

Cada código nuevo, traducido en las dos interfaces.

### 1.3 La huella del libro

**Requisitos** (prompt, bloque 1): cubre todos los eventos que preceden a la presentación en el fichero; **no cambia con `compact` ni con una migración**; permite reproducir el cálculo de aquel día. Una huella de los bytes crudos incumple el segundo. **Propuesta** (S1, **Q1**):

- `sha256` de las `lines` primeras líneas del fichero, cada una **migrada en memoria a la `schema_version` de la huella** y escrita en JSON canónico con las claves ordenadas (`sortKeysDeep` de `snapshot.ts`), unidas con `\n`. `sha256Hex` ya existe en el dominio y funciona en el navegador.
- **Se calcula al escribir** la presentación, sobre los eventos cargados (todos a la versión actual). Ninguna línea anterior puede ser más nueva que la presentación: el cargador rechaza versiones futuras, así que un cliente viejo nunca escribió después de uno nuevo.
- **Verificación** (`integrity`, `atlas check`, la verificación de la web): se toman las `lines` líneas crudas anteriores, se migran **hasta la versión de la huella** (la cadena de migraciones ya admite parar en una versión) y se compara. Una migración nueva en el código no la rompe: las líneas crudas siguen en su versión.
- **`compact`** es lo único que sube las líneas por encima de la versión de la huella. Antes de reescribir, **verifica todas las huellas** y se niega si alguna falla (`CompactRejectedError("filing_fingerprint_mismatch")`); al reescribir, **vuelve a sellarlas** en la versión nueva sobre el prefijo reescrito. La huella verificada antes y la sellada después dan la misma garantía. `snapshotOf` no incluye el `sha256` ni su versión (si los incluyera, el resellado haría abortar a `compact` por «proyección distinta»).
- `integrity` gana el hallazgo `filing_fingerprint_mismatch` (error), traducido en la verificación de la web como los demás.

Reproducir aquel día: `taxChain(prefijo, tax_year, { today: computed.as_of, settings: computed.settings })`, donde el prefijo son las `lines` primeras líneas del fichero.

### 1.4 Proyección

`LedgerState.filings`: las presentaciones en orden de fichero, con su cadena resuelta. **Pasada A''**, tras el catálogo, la configuración y las tesis: una presentación puede nombrar cuentas y activos, que se resuelven contra el catálogo completo (§7.1). Reglas, con código propio cada una:

- Del mismo (modelo, ejercicio) ya hay una **cabeza de cadena** y esta no trae `supersedes` → `filing_already_exists`.
- `supersedes` que no es una presentación, es de otro modelo o de otro ejercicio, ya está sustituida, o tiene `filed_at` posterior al de la nueva → `filing_supersedes_invalid` con el motivo en `details.reason`.
- Una presentación cuyo `supersedes` apunta a una anulada queda inválida: así **anular una sustituida se rechaza** por `reverseEvent`, que ya rechaza lo que deja inválido a otro (ADR-0003), sin una línea nueva en `rectify.ts`. Anular la cabeza sí se puede: la anterior vuelve a estar en vigor.
- Los bienes del 720/721 que nombran una cuenta o un activo inexistentes → `unknown_account` / `unknown_asset`, los que ya existen.

Consultas: `filingInForce(state, model, year, date)` (la última de la cadena con `filed_at ≤ date`), `closedYears(state, date)`. `snapshotOf` gana `filings` (sin la huella, §1.3). `isOperationEvent` excluye el tipo nuevo, como a las tesis.

### 1.5 La cadena y el ancla

`tax/chain.ts`: `taxChain(events, year, options)` es el `computeCore` de hoy partido en dos: el recorrido de ejercicios y la composición del informe. El recorrido:

1. Proyecta y recorre la recompra una vez, como hoy, pero **anota el diferido pendiente al cierre de cada ejercicio** (hoy solo el del ejercicio pedido), para que el aviso de cierre pueda comparar el diferido declarado.
2. Construye el ancla **del libro**: presentaciones `renta` en vigor a `options.today`, y de ellas **solo** `declared.pending_losses`. Ni una `720` ni una `721` (decisión (d)); ni una sustituida.
3. Recorre desde `min(año pedido, primer año con cifras, primer año anclado)` (P5) y devuelve, por ejercicio, `{ base, pending, deferred }` y el núcleo del ejercicio pedido.

`taxYear` compone el informe como hoy; `movedTaxYears` compara `bases`, `pending` y `deferred` por ejercicio (hoy solo `bases`); las alternativas de los dudosos y la diferencia con la configuración anterior usan la misma cadena, **con el ancla** (S9, **Q9**). `TaxOptions.filed` se elimina y los tests de la 009 que lo usan pasan a construir presentaciones con `LedgerBuilder`.

### 1.6 El ejercicio cerrado

`packages/domain/src/filings/closed-years.ts`, **fuera de `tax/`** porque también mira el 720:

```ts
closedYearImpact(before: Reading, after: Reading, today: CivilDate): ClosedYearImpact[]
// Reading = { events, settings? }: un evento nuevo, una corrección, una anulación o un settings_changed.
interface ClosedYearImpact {
  model: "renta" | "720" | "721"; year: number;
  filing_id: Ulid; filed_at: CivilDate;
  by_date: boolean;                     // la fecha del evento cae en ese ejercicio
  moves: { figure: string; before: string; after: string }[];   // vacío = no mueve nada
}
```

- **Renta**: una cadena antes y otra después; por cada ejercicio con Renta en vigor, las cifras de `declared` (base, cada pendiente por origen y categoría, diferido) que cambian. La cadena es barata frente al informe (sin alternativas ni diferencias).
- **720 y 721**: por cada ejercicio con presentación en vigor **no anterior** al año de la fecha del evento (uno de un año posterior al 31/12 no puede mover las cantidades de ese 31/12), el valor de cada categoría declarada y la lista de bienes, antes y después (§3). Solo si el evento toca una cuenta extranjera, una valoración, el catálogo o la configuración.
- **Sin presentaciones en vigor, no se calcula nada**: el camino rápido de todo libro de hoy.

Quién lo usa: `recordEvent`, `correctEvent`, `reverseEvent`, `previewEvent` y `previewCorrection` devuelven `closed: ClosedYearImpact[]` **en lugar de** `priorYear` (que desaparece con `isPriorYear`), más `unfiled_past_years: number[]` para la nota de S8. `atlas settings set` y el diálogo de Configuración lo piden con `before = { events, settings: actual }` y `after = { events, settings: nueva }`. Un solo código de aviso, `closed_year_moved` (con `by_date` y las cifras), y una nota, `past_year_not_filed`.

### 1.7 Lo que el informe gana

`TaxYearReport.filing?`, **solo si hay una Renta en vigor** para el ejercicio:

```ts
filing?: {
  filing_id; filed_at; receipt_reference; chain: Ulid[];     // la original y sus complementarias
  fingerprint_ok: boolean;
  figures: {
    figure: string;                    // "savings_base" | "pending:2024:capital_gain" | "deferred"
    declared: Money; computed_then: Money; now: Money;
    causes?: { at_filing: Money; engine: Money; settings: Money; later_events: Money };
  }[];
}
```

Las causas (Historia 3, escenario 5) salen de cuatro lecturas, exactas y que suman la diferencia:

| Lectura | Libro | Configuración | Resta que da la causa |
|---|---|---|---|
| `declared` | — | — | |
| `computed_then` | — | — | **al presentar** = `computed_then − declared` (lo que el usuario cambió) |
| R0 | prefijo de la huella | `computed.settings` | **motor** = `R0 − computed_then` |
| R1 | prefijo de la huella | la de hoy | **configuración** = `R1 − R0` |
| `now` | el libro entero | la de hoy | **eventos posteriores** = `now − R1` |

Con la huella rota no hay prefijo fiable: `causes` se omite, `fingerprint_ok: false` y se dice por qué. La nota `tax_anchor_differs` aparece en los ejercicios **posteriores** a uno anclado cuya cifra calculada hoy ya no coincide con la declarada: el arrastre sigue lo declarado, y hay que saberlo.

### 1.8 Tests del bloque

Los rechazos de §1.2 y §1.4 con nombre propio (dos sin `supersedes`; `supersedes` a otro modelo, a otro ejercicio, a una sustituida; `filed_at` el 31/12 y el 01/01; una cadena de dos complementarias; anular una sustituida, rechazado; anular la cabeza, aceptado); la consulta anterior a `filed_at`; la huella tras un `compact` con `TEST_SCHEMA_V2` (la migración de prueba de la 003) y con una línea editada a mano (señalada); el ancla que ignora una `720` con cifras; las cuatro causas del cálculo a mano §6.3; la recompra de enero que mueve un diciembre declarado (P4); el camino rápido sin presentaciones.

---

## Bloque 2 — La Renta por casillas

La búsqueda en fuentes oficiales (`questions.md`, «Casillas de 2025») cambió la forma de este bloque en tres cosas. Primera, en 2025 los ETF tienen **apartado propio** (2224–2236, Orden HAC/277/2026). Segunda, el formulario pide cada transmisión con su **pérdida obtenida e imputable** y lleva lo liberado de años anteriores a **otro apartado** (0394–0396). Tercera, la recompra **no tiene casilla con número**. La capa sigue sin recalcular nada, pero **reordena**: las filas del formulario no son las líneas del motor, aunque los totales coincidan (ficha F5, **Q10**).

### 2.1 Conceptos

`tax/boxes/concepts.ts`: identificadores estables en inglés que no dependen de ningún formulario. Cada uno sabe de qué parte de `TaxYearReport` o de la cadena sale.

| Grupo | Conceptos | Sale de |
|---|---|---|
| Rendimientos del capital mobiliario | `rcm.interest`, `rcm.dividends`, `rcm.transmission` (transmisiones en `movable_capital`), `rcm.gross_total`, `rcm.expenses`, `rcm.net`, `rcm.withholding` | `movable_capital.*`, `withholdings` |
| Filas de transmisiones, por apartado (F1) | `gp.iic.row`, `gp.etf.row`, `gp.listed_shares.row`, `gp.crypto.row`, `gp.other.row`. Por fila: denominación, NIF (siempre «falta en tus datos»), fechas, valor de transmisión, valor de adquisición, ganancia, pérdida obtenida, pérdida imputable, retención | `capital_gains.lines` + F5 |
| Totales por apartado | `gp.<apartado>.gains`, `gp.<apartado>.losses` | suma de sus filas |
| Ejercicios anteriores | `gp.prior_years.row` (pérdida que pasa a imputable este año, por origen), `gp.prior_years.losses` | F5 |
| Saldos | `gp.gains_total`, `gp.losses_total`, `gp.balance`, `rcm.balance` | `compensation` |
| Compensación | `offset.rcm_against_gp`, `offset.gp_against_rcm` (fase 1); `pending.<cat>.<origen>.against_same`, `pending.<cat>.<origen>.against_other` (fase 2); `pending_annex.<cat>.<origen>.{start,applied,left}`; `pending_annex.<cat>.<año>.new` | `compensation.steps`, `pending` |
| Base | `base.savings` (0460); `base.savings_taxable` (0510: **no calculable entera**, N8) | `base_eur` |
| Doble imposición | `ddi.income`, `ddi.foreign_tax` (sin casilla, N9), `ddi.first_limit` (rotulado «primer límite», nunca como el importe de la 0588) | `double_taxation` |
| Retenciones | `withholding.rcm` (0597), `withholding.fund_reimbursement` (0603) | `withholdings` |

`transmissionSection(assetType, incomeCategory)` decide el apartado con la tabla de F1. Mientras la dirección no la numere, lleva el criterio `section`, dudoso, en el catálogo, y el test anti-deriva de la 009 obligará a seguir al documento. Un ETC o un ETP en `capital_gain` va a `gp.other.row` **sin casilla**, y la salida lo dice.

### 2.2 Las filas por origen (F5)

La cadena (§1.5) anota el diferido pendiente al cierre de cada ejercicio, con la transmisión que lo generó. `boxes/rows.ts` lo **atribuye a la pérdida original**:

- Si el diferido lo generó una transmisión con resultado propio negativo, es de ella.
- Si su resultado propio era positivo (#21: lo liberado la hizo perder), es de las pérdidas que liberó, a prorrata.

Con `P(O, año)`, lo que de la pérdida O sigue diferido al cierre del año:

- **Fila de O**, en su año: pérdida obtenida = resultado propio; imputable = propio − `P(O, año)`.
- **`gp.prior_years.row`** de cada año posterior: `P(O, año − 1) − P(O, año)`.
- Las ganancias van con su resultado propio. Lo liberado nunca se suma a la fila que lo libera: va a su origen.

**Invariante, con test en cada ejercicio de cada libro de prueba y en los 200 aleatorios**: la suma de las filas de ganancias menos la de las pérdidas imputables menos la de ejercicios anteriores es el saldo de ganancias y pérdidas del informe, redondeos aparte (F2). La marca de recompra se dice como lo que es: «marca la pérdida como no computable por recompra; la casilla no tiene número».

### 2.3 Casillas como datos por ejercicio

`tax/boxes/years/2025.ts`, uno por ejercicio que se añada: `concepto → { box, label, source: { document, url, page }, checked_at, certainty }`. Son **datos, sin lógica**: ningún `if` sobre el ejercicio fuera de la tabla de ejercicios. Los años de origen de los pendientes (2021–2024 en 2025) también son datos: cada ejercicio tiene sus casillas por año de origen. `boxesFor(report, chain)`:

- **Ejercicio sin tabla** → `{ year, mapping: "none", concepts }`: todos los importes, **ningún número**, y la nota `tax_boxes_missing_year`.
- **Concepto sin fila** en la tabla de su ejercicio → ese concepto sin número y `tax_box_missing`. Pasa con el ETC en ganancias, la 0510, la ventana de la doble imposición y la recompra.
- **Nunca** se consulta la tabla de otro ejercicio. Es el mutante «caer en la casilla de otro ejercicio»; el test comprueba que 2024 y 2026 salen sin números aunque exista 2025.

Entran **solo las casillas de certeza alta vistas en el formulario del BOE de 2025** (lista en `questions.md`). En el commit del bloque, cada rótulo se transcribe **literal** de la imagen del BOE con su URL y se vuelve a comprobar el número; `checked_at` es la fecha de esa comprobación.

### 2.4 Redondeo y lo que no se calcula entero

- **Redondeo por fila**, según F2 (**Q3**): transmisión y adquisición redondeadas half-up una vez cada una; el resultado lo calcula el formulario. Si difiere en un céntimo del redondeado por el motor, la nota `tax_box_rounding_differs`.
- **Lo que el libro no tiene** (el NIF de la gestora o del fondo) sale como «falta en tus datos», con `tax_box_value_missing`.
- **La doble imposición** da el primer límite con su rótulo; la base liquidable, la nota de sus dos reducciones (N8).

## Bloque 3 — Los modelos 720 y 721

### 3.1 Dónde vive

`packages/domain/src/informative/`: `holdings.ts` (lo que hay en el extranjero a una fecha), `balances.ts` (saldos diarios y saldo medio del cuarto trimestre), `valuation.ts` (valor de un bien con la regla del 31/12), `verdict.ts` (umbral, subida, extinción, aviso), `m720.ts`, `m721.ts`, `filed.ts` (la última presentación en vigor de un modelo). Importa `projections/` (incluido `prices.ts`) y `filings/`; **nada de `tax/` lo importa** y `project-ledger.ts` no lo alcanza. Tests de arquitectura nuevos en §7.1.

### 3.2 Qué cuenta y con qué cantidades

- `foreignHoldingsAt(events, date)`: proyecta con `asOf = date` y toma **posiciones físicas por cuenta** (`physicalPositions`) y **efectivo por cuenta y divisa** de las cuentas cuyo país **a esa fecha** no es `ES` (S6, **Q6**). Los dos libros, agregados y rotulados.
- **Categorías del 720**: `accounts` (el efectivo) y `securities` (`fund`, `money_market`, `etf`, `etc`, `etp`, `stock`): un solo bloque con un solo umbral, como dice el art. 42 ter.4.c) (valores, IIC y seguros, «conjuntamente»). `crypto` **no** entra en el 720. **721**: `crypto` en cuentas extranjeras, con la frase de P6.
- La clave del bien en el formulario (C, V con su subclave, I) se enseña como dato informativo según la ficha F4; no cambia ningún umbral, porque el bloque es uno.

### 3.3 Valor de cada bien

- **Valores**: `priceAt(state, asset, 31/12, settings)` **sin fuente externa** y comprobando `origin === "manual"` (Nivel 1). La valoración tiene que estar fechada el **31/12** (aunque sea domingo); el tipo, en el **último día de lunes a viernes no posterior al 31/12** (el BCE publica todos los 31/12 que caen entre semana: comprobado de 2018 a 2025, nota N5). Si no, el valor se da **con su fecha y marcado** (`valuation_not_year_end`, `rate_not_year_end`). `PriceLookup` gana `fx_rate_date` (la de la valoración); `lookupOf` lo propaga.
- **Efectivo a 31/12**: el tipo de `state.fxRates` a 31/12 (con `asOf`) y la misma regla de fecha; sin tipo, sin valor (`rate_missing`), nunca un cero.
- **Saldo medio del cuarto trimestre**: saldo al cierre de **cada día** del periodo, convertido al **tipo del 31/12** (FAQ de la AEAT, nota N2). Para no hacer un segundo motor de efectivo, los saldos salen de **proyecciones con `asOf`**: una al 30/09 y una por cada fecha del trimestre con un evento que mueva el efectivo de una cuenta extranjera; entre dos fechas, el saldo es el de la anterior (no hay evento, no hay cambio: no es interpolar). El periodo empieza el 1/10 o, si la cuenta **aparece** en el trimestre, en su primer movimiento (ficha F3, **Q4**). Si en el móvil resulta lento, la alternativa es un observador de fin de día en la pasada B; no se toca `project-ledger.ts` sin medirlo antes.
- **ETF**: el 720 pide su **valor liquidativo** a 31/12 (clave I, ficha F4), no su cotización; la valoración registrada es la que el usuario anota, y la salida le dice cuál debe anotar.
- **Redondeo**: cada bien, half-up a céntimos, **una vez**; la categoría es la suma de los bienes redondeados (#6). El formato oficial es en euros con dos decimales y no fija regla de redondeo (nota N2).

### 3.4 Veredicto

Por categoría (en el 721, una sola), para un **31/12 ya pasado**:

1. **Completo**: todos los bienes con valor y sin marca. `obligado` si la suma **supera** el umbral (`>`: 50.000,00 no obliga). En las cuentas, si **cualquiera** de los dos saldos conjuntos lo supera.
2. **Incompleto** (algún bien sin valor, sin tipo o marcado): si la suma de lo que tiene valor, marcado incluido, supera el umbral → `obligado`, nombrando los valores marcados que lo decidieron (S16); si no → `undetermined`, con la lista de lo que falta como acción. **Nunca `not_obliged`.**
3. **Tras un 720 en vigor** (el último con `tax_year` anterior y `filed_at` ≤ la fecha de consulta; mutante «el penúltimo»): obliga si la categoría **se declaró** en él y sube **más de** `increase` (en las cuentas, cualquiera de los dos saldos; mutante «solo el 31/12»); o si un bien de su lista se tenía a 31/12 del año anterior y no a este (extinción, S7, **Q7**; una cuenta se extingue al marcarse inactiva, no por quedarse a cero; una venta parcial no extingue); una categoría **no declarada** en él obliga como la primera vez. El incompleto sigue la regla 2 con el umbral o con la subida, lo que toque.
4. **Aviso previo**: una categoría no obligada con valor en `[alerta, umbral]` (45.000,00 exactos avisa).
5. **Año en curso**: cantidades y precios a la fecha de consulta, rotulado «estado a dd/mm/aaaa», **sin veredicto**.
6. **Con un 720 en vigor para ese mismo ejercicio**: «presentado el dd/mm/aaaa», y lo declarado frente a lo calculado hoy por categoría y por bien.

`fiscalAttention(events, today)` (`informative/attention.ts`) junta lo que decide la tarjeta del Resumen: temporada de Renta (fechas de `Settings`, bordes incluidos), la Renta del año anterior sin registrar, y **algo que hacer** en el 720/721 del último 31/12: obligado sin presentación, volver a presentar, `undetermined` (S14, **Q11**) o por encima del aviso. Carga lo justo: sin cuentas extranjeras no proyecta nada.

### 3.5 Criterios

Toda salida del 720 y del 721 lleva `#11` y los que la dirección numere de las fichas F3 y F4, con su certeza. `informative/` usa el catálogo de `tax/criteria.ts` (el catálogo **sí** puede importarse: es una tabla sin precios; lo que no puede pasar es lo contrario).

---

## Bloque 4 — La web

### 4.1 Rutas y navegación

- `/fiscal?ejercicio=AAAA` (por defecto, el año anterior al de la fecha de consulta) y `/fiscal/presentar/:modelo/:año`. Rutas perezosas, como las doce de hoy. **No** marcan ningún destino de la barra; Ajustes no se marca tampoco (nunca dos, `system.md` §4.2).
- Se llega desde la **tarjeta fiscal del Resumen** y desde una fila de **Ajustes** («Fiscal: Renta y modelos 720 y 721»).
- La tarjeta del Resumen: `FiscalCard`, que importa `fiscalAttention` con un `import()` dinámico **después de pintar**, con un esqueleto de su tamaño; arriba del todo si `fiscalAttention` dice temporada o algo que hacer, al final si no. Los cuatro bordes de la temporada, con test de posición.

### 4.2 La pantalla

Orden de lectura y componentes existentes (`system.md` §5):

1. **Cabecera**: título, selector de ejercicio (`select` nativo), la fecha de consulta y la etiqueta de estado: «Declarado el dd/mm/aaaa» (`.tag` hecho) o «Sin declarar» (neutra).
2. **La base del ahorro**: `.hero-figure` con el importe por `Amount`, rotulada «Total fiscal · cartera y cubo juntos» y «Es la base, no lo que pagas». Debajo, `.kpis` (ganancias y pérdidas, rendimientos, compensado) y tres `.disclosure`: las operaciones de cada total en `DataTable` (activo y fecha, nunca un identificador) y la compensación paso a paso.
3. **Criterios**: en cada cifra, las etiquetas `.tag` (aviso para uno en disputa, neutra para media o baja) y la lista entera plegada. Nombres en llano en `view-models/fiscal/criteria.ts`, con un test que recorre `CRITERION_IDS` en las **dos** interfaces.
4. **Criterios dudosos**: filas `.row` con el nombre, la certeza, la dirección en palabras («si el criterio está mal, declaras de menos» / «pagas de más»), el dinero en juego por `Amount` (o «no cuantificable desde tus datos») y las operaciones plegadas.
5. **Pérdidas pendientes y lo que caduca**: filas por origen y tipo de renta con «caduca tras 2029»; lo que caduca en el ejercicio, como `.notice` de aviso.
6. **Tu declaración por casillas**: tabla casilla · rótulo · importe, con la fuente y la certeza plegadas; sin correspondencia, un `.notice` de información («Las casillas de 2024 no están comprobadas: te damos los importes por conceptos, sin números de casilla»).
7. **Lo declarado**: con Renta registrada, lo declarado frente a lo calculado y, si difieren, las causas en frases; sin ella, «Registrar lo presentado».
8. **Modelo 720** y **Modelo 721**: por categoría, valor, veredicto (`.tag`) y motivo en una frase; lo que falta, como `.pending` con su acción («Registra las valoraciones a 31/12 de 2 activos»), nunca como error; la comparación con la última presentación. **Ni barra ni porcentaje frente al umbral**, con o sin privacidad (sin gráficas, `brief.md` §7).
9. **Estados**: vacío (un `.empty` con el siguiente paso), sin nada que declarar («Base 0,00 €: nada que declarar en la base del ahorro»), con eventos inválidos (la lista y «Verificar», sin cifras), cargando (`.skel` del tamaño de lo que llega).

### 4.3 Registrar lo presentado

`/fiscal/presentar/:modelo/:año`: el formulario de siempre (`Field`, `.field` con unidad «€»), **precargado con `computed` y enmascarado hasta recibir el foco** (`system.md` §5.10); fecha de presentación, justificante y notas. Si ya hay una presentación de ese modelo y ejercicio, el título dice «Complementaria» y `supersedes` va solo. La vista previa es **una frase** («Vas a registrar la Renta de 2025, presentada el 18/06/2026, con una base de •••• €…») y la confirmación. Escribe por el mismo `write.ts` que los demás eventos; tras escribir, vuelve a `/fiscal?ejercicio=AAAA` con la confirmación en la dirección.

### 4.4 El ejercicio cerrado en el resto de la web

- **Registrar y Corregir**: la vista previa enseña `closed` con el agrupador de avisos (sin enlaces, `system.md` §5.6): «Afecta a la Renta de 2026, presentada el 15/06/2027: la base pasa de •••• € a •••• €».
- **Anular**: el diálogo destructivo lo dice antes de confirmar.
- **Después de escribir**: `Rectified.tsx` deja `&ejercicio=anterior` y lleva `&cerrado=renta-2026,720-2026`; el aviso nombra las declaraciones. `past_year_not_filed` va como nota informativa (S8).
- **Configuración**: el diálogo que hoy usa `movedFiscalYears` pasa a `movedTaxYears` + `closedYearImpact` y separa «ejercicios declarados» (aviso) de «ejercicios pasados sin declaración registrada» (nota).

### 4.5 Paquete y rendimiento

El motor fiscal entra en la web por primera vez, y solo en trozos perezosos: `/fiscal`, `/fiscal/presentar`, la vista previa de Registrar y Corregir (para `closed`) y el `import()` de la tarjeta del Resumen. Se comprueba en el paquete construido que el arranque no contiene `tax/` ni `informative/`. El techo del arranque no se mueve; el total se fija en lo medido más el margen, con el motivo escrito en `check-bundle.mjs`, como hizo la 009. Se mide con la CPU frenada ×4 cuánto tarda el informe de un ejercicio del libro sintético (proyecta el libro varias veces por las alternativas) y el 720 de un año; si pasa de un segundo, se pinta primero la base y los dudosos llegan después con su esqueleto.

---

## Bloque 5 — La CLI

| Comando | Qué hace |
|---|---|
| `atlas tax <año> [--lots] [--json]` | Como hoy, más el cierre y la comparación (`filing`) cuando hay Renta en vigor |
| `atlas tax <año> --boxes [--json]` | La Renta por casillas, con la procedencia de cada correspondencia o la declaración de que no la hay |
| `atlas m720 <año> [--json]`, `atlas m721 <año> [--json]` | El estado del modelo con su veredicto, lo que falta y la comparación con lo presentado |
| `atlas filed <renta\|720\|721> <año>` | Enseña lo calculado con una clave por cifra (`base`, `pending.2024.capital_gain`, `accounts.balance`, `item.acc_ib.etf_us`…); `--set <clave>=<importe>` repetible sustituye una cifra por lo presentado; `--filed-at`, `--receipt`, `--notes`; `--supersedes <id>` para una complementaria (y sin él, si ya hay una en vigor, el error dice cómo); `--yes` o la confirmación de siempre |

`ARITY`: `m720: 2`, `m721: 2`, `filed: 3`; `tax` sigue en 2. `BOOLEAN_FLAGS`: `--boxes`. `add`, `ca`, `edit`, `delete` y `settings set` imprimen `closed_year_moved` y `past_year_not_filed` con el mismo código y las mismas cifras que la web. `atlas check` imprime `filing_fingerprint_mismatch`.

---

## §6 — Los cálculos a mano

Método de la 009: diseño del libro con importes elegidos para el papel; cálculo paso a paso en `questions.md`; **commit antes del código**; test que codifica los literales; contraste y documentación de cada discrepancia. El diseño y las cifras previas están en `questions.md` (sección «Cálculos a mano»); estas son sus claves:

1. **§6.1 — El 720 a 31/12/2027** (viernes): dos cuentas de IBKR (`IE`) y una de MyInvestor (`ES`, fuera); efectivo en euros y dólares con su saldo medio del cuarto trimestre (46 días a 10.000, 45 a 14.000, 1 a 12.000; 61 días a 3.000 USD y 31 a 5.500 USD, al tipo del 31/12); un saldo negativo de −1.500 que se netea; un ETF en dólares, un ETC y un ETP valorados el 31/12 (el ETP en el medio céntimo: 8.000,005 → 8.000,01); unas acciones valoradas el 30/12, marcadas. Cuentas: 15.500,00 y 15.710,47, **no obligado**. Valores: 51.000,92, **obligado decidido con un valor marcado** (sin él, 45.000,92: por encima del aviso).
2. **§6.2 — Los 20.000 € con dos 720**: 60.000,00 (2027, presentado); 80.000,00 (2028: +20.000,00, no obliga); 80.000,01 (2029: +20.000,01 sobre **2027**, no sobre 2028: obliga) y las cuentas a 50.000,01 por primera vez (obligan); 2030: los valores bajan pero un bien de la lista se vendió (extinción, obliga) y las cuentas suben 20.000,01 **solo en el saldo medio** (obliga).
3. **§6.3 — La complementaria**: Renta de 2027 con −290,00 pendientes; corrección de una venta y complementaria que declara −200,00 (lo calculado era −190,00); 2028 anclado en la complementaria: base **600,00** (con la original, 510,00; sin ancla, 612,00); la anulación de la original, rechazada; la comparación de 2027 con sus cuatro causas (+10,00 al presentar, 0,00 del motor, −2,00 y +2,00 de configuración, +16,00 y +4,00 de eventos posteriores), que suman la diferencia total.
4. **§6.4 — La Renta de 2025 por casillas**. El libro a mano incluye:
   - un reembolso de fondo con pérdida diferida a la mitad y otro con ganancia y retención;
   - un ETF, unas acciones con pérdida y otras que liberan una pérdida de 2024 (va a la 0395);
   - una cripto;
   - un ETC en ganancias, sin casilla;
   - intereses con retención, un dividendo de EE. UU. con doble imposición y una custodia;
   - una Renta de 2024 presentada con un pendiente de 2023 anterior a la aplicación.

   Cifras de control: 0422 660,00; 0423 320,00; **0424 340,00** (igual al saldo del motor); 0429 130,00; 0441 300,00; **0460 170,00**. El mismo libro en 2024 sale por conceptos y sin números.

---

## §7 — La Renta sigue sin leer un precio, con el 720 dentro

1. **Estructural** (`tests/architecture.test.ts`): (a) el camino fiscal sigue siendo todo lo que alcanzan `project-ledger.ts` y cada fichero de `tax/`, **incluidos `tax/boxes/`**; (b) **ningún fichero del camino fiscal alcanza un fichero de `informative/`**, a ninguna profundidad (mismo recorrido transitivo que ya prohíbe `prices.ts` y `valuations.ts`); (c) `informative/` solo lee valoraciones por `prices.ts` (el test textual de hoy ya lo cubre).
2. **Por borrado**: `withoutPricesOrInformativeFilings(events)` borra lo que borraba la 009 (`valuation`, `unit_price` informativo, `nav_*`, `per_unit`, `income_eur`) **y todas las presentaciones `720` y `721`**. En el libro sintético (todos sus ejercicios), en los libros a mano de la 009 y en los de esta feature (con presentaciones `renta`, `720` y `721`), `taxReportJson` y la salida por casillas son **idénticos byte a byte**. Y la propiedad de la 009 con 200 libros aleatorios, a los que se añaden presentaciones aleatorias de los tres modelos.
3. **Que no esté vacía**: el mismo borrado **cambia** la salida del 720 de §6.1 (sin valoraciones, los valores pasan a `undetermined`) y la del §6.2 (sin el 720 de 2027, 2028 obliga por primera vez).

---

## §8 — Los valores por defecto no cambian nada

1. **Predicción antes**, en `specs/010-tax-output/snapshot-expectation.md`: la instantánea del libro sintético gana exactamente la clave `filings: []` y nada más; el informe fiscal (`synthetic-v1.tax.json`) **no se mueve**. Se comitea antes del commit que añade el tipo de evento.
2. Sin presentaciones y con la configuración por defecto, `atlas tax` de todos los ejercicios del libro sintético da la misma salida (texto y `--json`) que en la base de la rama.
3. Lo nuevo del informe (`filing`, `anchor.before_ledger`) solo aparece con presentaciones: se enumera en la predicción, no se «compara con develop».
4. Cualquier movimiento no previsto es un hallazgo: se para y se pregunta.

---

## §9 — El navegador

Chromium de Playwright desde el *scratchpad*, nunca en un `package.json`. Capturas medidas a **400×890 con DPR 3**, **2045×1141** y **360** (sin desplazamiento lateral); libro vacío, libro sintético y uno con la Renta declarada y un 720 obligado; privacidad puesta y quitada (**los desbordamientos se miden con la privacidad quitada**); claro y oscuro al menos una vez. Una presentación registrada **desde la web**, con el antes y el después; la tarjeta del Resumen dentro y fuera de temporada. Objetivos de 44 px y tablas que se deciden por el sitio de su tarjeta.

---

## Orden de trabajo y commits

| # | Commit | Bloque |
|---|---|---|
| 1 | `docs: bring prompt 010 and the amended ADR-0020 from PR 60` | hecho |
| 2 | `docs(010): spec, plan and questions for the tax output` | este |
| 3 | `fix(tax): start the year chain at the first filed return` | 0.1 (P5) |
| 4 | `feat(settings): add the informative return thresholds and the tax season` | 0.2 |
| 5 | `docs(010): hand-computed supplementary return` | §6.3, antes del 6 |
| 6 | `docs(010): predict what the filing event moves in the golden snapshot` | §8 |
| 7 | `feat(schema): add the tax_return_filed event` | 1.1–1.2 |
| 8 | `feat(projections): project filed returns and their supplementary chain` | 1.4 |
| 9 | `feat(ledger): fingerprint the ledger before a filed return and reseal it on compact` | 1.3 |
| 10 | `refactor(tax): share one year chain that anchors on the filed returns` | 1.5 |
| 11 | `feat(filings): warn when an event moves a closed tax year` | 1.6 |
| 12 | `feat(tax): compare what was filed with what the ledger says today` | 1.7 |
| 13 | `test(tax): check the supplementary return by hand` | §6.3 |
| 14 | `docs(010): hand-computed 720 and 20,000 euro trigger` | §6.1–§6.2, antes del 15 |
| 15 | `feat(prices): return the date of the rate with every price` | 3.3 |
| 16 | `feat(informative): compute the 720 and 721 with a fail-safe verdict` | 3 |
| 17 | `test(informative): check the 720 by hand` | §6.1–§6.2 |
| 18 | `docs(010): hand-computed 2025 return by boxes` | §6.4, antes del 19 |
| 19 | `feat(tax): lay the savings base out by concept and 2025 box` | 2 |
| 20 | `test(tax): check the 2025 boxes by hand` | §6.4 |
| 21 | `test(tax): prove the return reads no price with the 720 inside` | §7 |
| 22 | `test(tax): prove the defaults change nothing` | §8 |
| 23 | `feat(cli): add boxes, the informative returns and filed returns` | 5 |
| 24 | `feat(web): add the fiscal screen and its summary card` | 4.1–4.2 |
| 25 | `feat(web): record a filed return from the fiscal screen` | 4.3 |
| 26 | `feat(web): say which filed return a change affects` | 4.4 |
| 27 | `build(web): set the bundle ceiling to what the tax output measures` | 4.5 |
| 28 | `docs(010): implementation notes` | cierre |

`npm run lint` verde antes de cada commit y como último paso. Nunca `git push`, nunca fusiones.

---

## Estrategia de test

| Qué | Dónde |
|---|---|
| P5, con su nombre | `packages/domain/test/tax/chain.test.ts` |
| Configuración nueva: valores por defecto, rangos, `alert_above_threshold`, temporada | `packages/domain/test/settings/settings.test.ts` |
| Forma del evento y sus rechazos | `packages/domain/test/schema/validate.test.ts` |
| Cadena de complementarias, anulaciones, consulta anterior a `filed_at` | `packages/domain/test/projections/filings.test.ts` |
| Huella: escritura, verificación, línea editada, `compact` con `TEST_SCHEMA_V2` | `packages/domain/test/filings/fingerprint.test.ts`, `test/usecases/compact.test.ts` |
| Ancla desde el libro; ignora 720/721 y sustituidas | `packages/domain/test/tax/chain.test.ts` |
| Ejercicio cerrado: por fecha, por cifra (P4), `settings_changed`, 720 | `packages/domain/test/filings/closed-years.test.ts` |
| Comparación y causas | `packages/domain/test/tax/filing-comparison.test.ts` |
| **Complementaria a mano** | `packages/domain/test/tax/supplementary.test.ts` |
| Casillas: con tabla, sin tabla, concepto sin fila, nunca otro ejercicio | `packages/domain/test/tax/boxes.test.ts` |
| Filas por origen (F5): el invariante de totales en todos los libros y en 200 aleatorios; el #21 con propio positivo y negativo | `packages/domain/test/tax/boxes-rows.test.ts`, `test/properties/tax.test.ts` |
| **Renta de 2025 a mano** | `packages/domain/test/tax/boxes-2025.test.ts` |
| Valor con la regla del 31/12; saldos diarios y medio | `packages/domain/test/informative/{valuation,balances}.test.ts` |
| Veredicto: bordes, incompleto, subida, extinción, aviso, año en curso | `packages/domain/test/informative/verdict.test.ts` |
| **720 a mano** (los dos) | `packages/domain/test/informative/m720-hand.test.ts` |
| 721 | `packages/domain/test/informative/m721.test.ts` |
| Atención fiscal y temporada | `packages/domain/test/informative/attention.test.ts` |
| Sin precios con el 720 dentro (borrado y propiedad) | `packages/domain/test/tax/no-prices.test.ts` (ampliado) |
| Arquitectura | `tests/architecture.test.ts` |
| Mensajes y nombres de criterios en las dos interfaces | `tests/messages.test.ts`, `apps/web/test/fiscal-criteria-names.test.ts` |
| CLI | `apps/cli/test/commands/{tax-boxes,m720,m721,filed}.test.ts`, e2e |
| Web | `apps/web/test/fiscal/*.test.tsx`, posición de la tarjeta en los cuatro bordes |

### Mutantes previstos (§5 del prompt) y el test que los mata

| Mutante | Lo mata |
|---|---|
| `>` por `>=` en cada umbral | los bordes 50.000,00 / 50.000,01, 20.000,00 / 20.000,01 y 45.000,00 del cálculo §6.1–§6.2 y de `verdict.test.ts` |
| Comparar con el penúltimo 720 | §6.2, 2029 (+20.000,01 sobre 2027; +0,01 sobre 2028) |
| Aceptar una sustituida como ancla | §6.3, 2028: 600,00 frente a 510,00 |
| Leer una `720` en el ancla | `chain.test.ts`: una `720` con cifras junto a una `renta`; y el borrado de §7 |
| Caer en la casilla de otro ejercicio | `boxes.test.ts`: 2024 y 2026 sin números |
| Aceptar una valoración que no es del 31/12 sin marcarla | §6.1, las acciones del 30/12 |
| «No obligado» con un precio ausente | `verdict.test.ts`: lo conocido por debajo del umbral → `undetermined` |
| Mirar la subida de las cuentas solo a 31/12 | §6.2, 2030 |
| Volver a empezar la cadena en el primer ejercicio con cifras (P5) | el test de 0.1 |

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| **Una casilla creíble y falsa** | Solo casillas vistas en un documento oficial de 2025, con URL y fecha; nunca de otro ejercicio (test); lo dudoso no se codifica |
| Un precio entra en la Renta por la puerta de atrás (las cifras de un 720 presentado) | El ancla filtra `renta`; test estructural transitivo; borrado de las presentaciones 720/721 |
| La huella da una falsa alarma tras `compact` | Verificar y volver a sellar en `compact`; test con la migración de prueba |
| El aviso de cierre es caro en el móvil | Camino rápido sin presentaciones; el 720 solo con eventos que tocan cuentas extranjeras; medido |
| El 720 multiplica las proyecciones | Solo en las fechas del trimestre con movimiento en una cuenta extranjera; medido; alternativa escrita |
| El motor fiscal entra en el arranque de la web | Carga perezosa; comprobación en el paquete construido |
| Los tests de la 009 que pasan `filed` | Se reescriben con presentaciones reales en el mismo commit que quita el parámetro; sus literales no cambian |
| Conflicto con otros agentes en `apps/web` | Los cambios fuera de `routes/fiscal` son puntuales (Resumen, Ajustes, Registrar, `Rectified.tsx`, Configuración, catálogos) y cada uno en su commit |

---

## Entregables

```text
specs/010-tax-output/
├── spec.md                      # qué y por qué
├── plan.md                      # este fichero
├── questions.md                 # preguntas, fichas, casillas, cálculos a mano y documentos a actualizar
├── snapshot-expectation.md      # predicción del golden (commit 6)
└── tasks.md                     # tras el visto bueno
```

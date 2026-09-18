# Lo que espero que cambie en el *golden*, escrito antes de regenerarlo

**Feature**: `008-fiscal-provisions`, bloque 3 · **Fecha**: 2026-09-18 · **Base**: `origin/develop` (`6a203a0`)

Este fichero se escribe **antes** de tocar el generador. Después se compara con lo que salga. Cualquier diferencia entre esta predicción y el resultado es un **hallazgo**, no un detalle: la feature para y se pregunta.

> **Revisión del 2026-09-18, tras la respuesta de la dirección (Q3).** `valuation` **entra** en el endurecimiento junto a los otros tres. La predicción pasa de **9 líneas a 29**. Motivo fiscal: el Modelo 720 valora a cotización de 31/12 **convertida al tipo del BCE de ese día**, así que una valoración en divisa sin la fecha de su tipo es justo el dato que ADR-0013 dice que no se puede perder. Y la ventana de ADR-0018 se cierra con esta feature: decidirlo por omisión habría sido peor que decidirlo.

---

## 1. La predicción

`tests/fixtures/ledger/synthetic-v1.jsonl` tiene **200 líneas**. **Veintinueve** de ellas son `cash_deposit`, `cash_withdrawal`, `standalone_fee` o `valuation` **sin** `fx_rate_date`. Tras el endurecimiento, esas veintinueve ganan la clave y **ninguna otra cosa cambia**.

El valor es el que el generador ya usa en los otros trece sitios donde emite el campo: `lastWorkingDay(fecha de negocio)`, el último día hábil anterior o igual (el BCE no publica en fin de semana). La fecha de negocio es `value_date` en los tres primeros tipos y `date` en `valuation`.

### 1.1 Efectivo y comisiones — 9 líneas

| # | línea | `id` | tipo | `value_date` | día | `fx_rate_date` esperado |
|---|---|---|---|---|---|---|
| 1 | 16 | `01M1F21ZW0HVXPN5PPFMFCCETJ` | `cash_deposit` | 2026-08-25 | martes | `2026-08-25` |
| 2 | 17 | `01M1F220V89HEEBMV38X6TZ7BV` | `cash_deposit` | 2026-09-01 | martes | `2026-09-01` |
| 3 | 18 | `01M1F221TG3J2S13Z3EAKDPFGG` | `cash_deposit` | 2026-09-01 | martes | `2026-09-01` |
| 4 | 41 | `01M9XDRZ80XC95VT3Q0Z1MERPN` | `standalone_fee` | 2026-12-15 | martes | `2026-12-15` |
| 5 | 88 | `01MZ56PS6GTKPEKQYKP0GSAZWJ` | `cash_deposit` | 2027-09-02 | jueves | `2027-09-02` |
| 6 | 138 | `01NJ4WGC78TAC9QYZDB4WZXCP1` | `cash_withdrawal` | 2028-04-08 | **sábado** | **`2028-04-07`** |
| 7 | 146 | `01NP0FJV8015S112R2DHPJ3PNP` | `standalone_fee` | 2028-06-15 | jueves | `2028-06-15` |
| 8 | 155 | `01NWVBBZ78ZF4XD31K965DE3ET` | `cash_deposit` | 2028-09-05 | martes | `2028-09-05` |
| 9 | 180 | `01MCD83A6GQM6VQY66FCFBD47M` | `cash_deposit` | 2027-01-15 | viernes | `2027-01-15` |

**Ocho toman su propia fecha valor. Uno no**: el número 6 cae en **sábado**, y su tipo es el del viernes anterior.

### 1.2 Valoraciones — 20 líneas

| # | línea | `id` | cuenta · activo | `date` | día | `fx_rate_date` esperado |
|---|---|---|---|---|---|---|
| 10 | 43 | `01MB6M4G78QPDZF79309SRDBR9` | `acc_ibkr` · `ast_btc` | 2026-12-31 | jueves | `2026-12-31` |
| 11 | 44 | `01MB6M4H6GHZXK8C28A9N95B3Y` | `acc_mi` · `ast_world` | 2026-12-31 | jueves | `2026-12-31` |
| 12 | 45 | `01MB6M4J5R201CRQKEASCPVWKP` | `acc_mi` · `ast_bonds` | 2026-12-31 | jueves | `2026-12-31` |
| 13 | 46 | `01MB6M4K50GNG76FKNQMAKVRFV` | `acc_mi` · `ast_mm` | 2026-12-31 | jueves | `2026-12-31` |
| 14 | 108 | `01N8JF6V78K7Q5V23J1JFEJ2Y0` | `acc_ibkr` · `ast_btc` | 2027-12-31 | viernes | `2027-12-31` |
| 15 | 110 | `01N8JF6X5R2CJ51GDGE2VNPQ2Y` | `acc_mi` · `ast_world` | 2027-12-31 | viernes | `2027-12-31` |
| 16 | 111 | `01N8JF6Y50Z2CTBC2HDYA6F13Y` | `acc_mi` · `ast_smallcap` | 2027-12-31 | viernes | `2027-12-31` |
| 17 | 112 | `01N8JF6Z48A1R8XBJXEM5QQPW4` | `acc_mi` · `ast_bonds` | 2027-12-31 | viernes | `2027-12-31` |
| 18 | 113 | `01N8JF703GJNYK56098X6WVHBM` | `acc_mi` · `ast_mm` | 2027-12-31 | viernes | `2027-12-31` |
| 19 | 166 | `01P60WNX78V6BDTT57V8G4GS15` | `acc_ibkr` · `ast_btc` | 2028-12-31 | **domingo** | **`2028-12-29`** |
| 20 | 168 | `01P60WNZ5RYYJ1833QQXY56NS5` | `acc_mi` · `ast_world` | 2028-12-31 | **domingo** | **`2028-12-29`** |
| 21 | 169 | `01P60WP0508CEDD7B91CY4G3TX` | `acc_mi` · `ast_smallcap_b` | 2028-12-31 | **domingo** | **`2028-12-29`** |
| 22 | 170 | `01P60WP1489NJ7S09RQV67EA4J` | `acc_mi` · `ast_bonds_i` | 2028-12-31 | **domingo** | **`2028-12-29`** |
| 23 | 171 | `01P60WP23GYP3PPCM9PMSMF4EZ` | `acc_mi` · `ast_mm` | 2028-12-31 | **domingo** | **`2028-12-29`** |
| 24 | 173 | `01M1F21H78TAXYCJQE33NVK2SJ` | `acc_mi` · `ast_world` | 2026-09-01 | martes | `2026-09-01` |
| 25 | 174 | `01MG13ZK80KGFHXYEJZ23BA7Y5` | `acc_mi` · `ast_world` | 2027-03-01 | lunes | `2027-03-01` |
| 26 | 175 | `01MYTX3V80QMPE0TPGZJK0J4X8` | `acc_mi` · `ast_world` | 2027-09-01 | miércoles | `2027-09-01` |
| 27 | 176 | `01NDFHEN80YJTNV7GF20DMVNAZ` | `acc_mi` · `ast_world` | 2028-03-01 | miércoles | `2028-03-01` |
| 28 | 177 | `01NW9AJX80MXATN9HR9K7V6TPZ` | `acc_mi` · `ast_world` | 2028-09-01 | viernes | `2028-09-01` |
| 29 | 200 | `01P60WNW80X12D4XMGH9C6FEV0` | `acc_bucket` · `ast_delta` | 2028-12-31 | **domingo** | **`2028-12-29`** |

**Seis de las veintinueve no toman su propia fecha**: el `cash_withdrawal` del sábado y las **cinco valoraciones del 31/12/2028, que cae en domingo** — que es exactamente el caso que motivó el hallazgo 6 del tercer *challenge* (*«el 31/12 cae en fin de semana dos de cada siete años»*) y por el que la dirección decidió endurecer también `valuation`. Su tipo es el del **viernes 2028-12-29**.

Las líneas 167, 172, 178 y 179 son valoraciones en **USD** que **ya** llevan `fx_rate_date` (el generador lo emite hoy solo cuando la divisa no es el euro). No cambian.

### 1.3 Y además, con el mismo detalle

- **200 líneas antes y 200 después.** Ni una más.
- **Ningún `id`, `recorded_at`, `fingerprint`, importe, divisa, fecha, cantidad ni nota cambia** en ninguna de las 200 líneas. La huella no incluye `fx_rate_date` (`fingerprint.ts`), y `valuation` ni siquiera tiene huella.
- **El orden de las líneas no cambia.**
- **La clave nueva va inmediatamente después de `fx_rate`** en cada una de las veintinueve. Es donde la pone el generador: `canonicalLine` escribe primero el sobre y luego el resto en el orden de inserción del borrador, y `completeDraft` añade la huella al final.
- **`tests/fixtures/ledger/synthetic-v1.snapshot.json` no se regenera y no cambia.**

Fuera del *golden*, y en el commit de la regla (no en el de la regeneración), cambian tres fixtures más, una línea cada una. **Ninguna de ellas tiene `valuation`**, así que la ampliación de la Q3 no las toca:

| fichero | línea | tipo | `value_date` | `fx_rate_date` |
|---|---|---|---|---|
| `valid-v1.jsonl` | 4 | `cash_deposit` | 2026-09-01 | `2026-09-01` |
| `legacy-v1-for-test-schema.jsonl` | 3 | `cash_deposit` | 2026-09-01 | `2026-09-01` |
| `number-amount.jsonl` | 4 | `cash_deposit` | 2026-09-01 | `2026-09-01` |

---

## 2. Por qué la instantánea no puede moverse

Dicho antes de comprobarlo, para que la comprobación signifique algo:

1. **Las veintinueve líneas están en euros**, con `fx_rate: "1"`.
2. La **única** proyección que lee el `fx_rate_date` de estos eventos es `noteFxRates`, y lo primero que hace con cada par es `if (pair.currency === EUR) continue`.
3. `state.fxRates` **no entra** en `snapshotOf`.
4. `snapshotOf` serializa una `valuation` con `event_id`, `account_id`, `asset_id`, `date`, `quantity`, `unit_value`, `currency`, `fx_rate` y `source`. **`fx_rate_date` no está en esa lista**, así que no entra ni para las valoraciones en divisa que ya lo llevan.
5. `warnFxDate` —el aviso de «fecha del tipo posterior a la fecha fiscal»— solo lo invocan `applyBuy` y `applySell`. **No se le añaden invocaciones en esta feature**, precisamente para no crear avisos nuevos.
6. `applyCashDeposit`, `applyCashWithdrawal`, `applyStandaloneFee` y `applyValuation` no miran la fecha del tipo.
7. `fingerprintOf` no incluye `fx_rate_date` en la tupla de los tres tipos que tienen huella.

No hay camino por el que la clave nueva pueda mover una cifra. **Si la instantánea se moviera una sola línea que no estuviera prevista, el hallazgo es que este razonamiento tiene un agujero**, y eso vale más que la feature entera: se para y se pregunta.

---

## 3. Comprobación previa, ya ejecutada (2026-09-18, antes de escribir código)

Como `fx_rate_date` es **hoy** opcional en los cuatro tipos, el fichero con las veintinueve claves añadidas ya es válido sin ningún cambio de código. Eso permite verificar la predicción **antes** de tocar el generador, y así se ha hecho: primero con las 9 líneas de la versión original de este documento, y después con las **29** tras la respuesta de la dirección.

Se construyó `expected.jsonl` a partir del `synthetic-v1.jsonl` de `develop` con la transformación del apartado 4, y se comprobó sobre el código de `origin/develop`, **sin modificar nada**:

| Comprobación | 9 líneas | 29 líneas |
|---|---|---|
| El fichero carga sin errores y da 200 eventos | ✅ | ✅ |
| `snapshotOf(projectLedger(expected))` **idéntico** a `synthetic-v1.snapshot.json` | ✅ | ✅ |
| Ninguna clave eliminada en ninguna de las 200 líneas | ✅ | ✅ |
| Ningún valor modificado en ninguna de las 200 líneas | ✅ | ✅ |
| Claves añadidas solo en los `id` previstos, y solo `fx_rate_date` | ✅ | ✅ |

**Antes de escribir una línea de producción ya está demostrado que el cambio previsto no mueve ninguna proyección.** Lo que queda por demostrar en el bloque 3 es solo que **el generador produce exactamente ese fichero y no otro**.

---

## 4. La transformación de contraste

Construye el fichero esperado **sin usar el generador**. Es deliberadamente trivial para que se pueda auditar de un vistazo: recorre las líneas, y en las que son de uno de los cuatro tipos y no tienen ya la clave, inserta `"fx_rate_date":"<último día hábil>"` justo detrás de `"fx_rate":"…"`. Todo lo demás se copia byte a byte. El `assert` de una sola coincidencia del ancla es lo que impide que una sustitución se cuele donde no debe.

```python
"""Builds the expected golden without using the generator."""
import datetime, json, sys

SRC, DST = sys.argv[1], sys.argv[2]
TYPES = {"cash_deposit", "cash_withdrawal", "standalone_fee", "valuation"}

def last_working_day(d: str) -> str:
    day = datetime.date.fromisoformat(d)
    while day.weekday() >= 5:          # 5 = sábado, 6 = domingo
        day -= datetime.timedelta(days=1)
    return day.isoformat()

out, touched = [], []
for n, raw in enumerate(open(SRC, encoding="utf-8"), 1):
    line = raw.rstrip("\n")
    if not line:
        out.append(raw); continue
    event = json.loads(line)
    if event.get("type") in TYPES and "fx_rate_date" not in event:
        value = last_working_day(event.get("value_date") or event["date"])
        anchor = '"fx_rate":%s' % json.dumps(event["fx_rate"])
        assert line.count(anchor) == 1, (n, anchor)
        line = line.replace(anchor, '%s,"fx_rate_date":%s' % (anchor, json.dumps(value)))
        touched.append((n, event["id"], event["type"], event.get("value_date") or event["date"], value))
    out.append(line + "\n")

open(DST, "w", encoding="utf-8").writelines(out)
print("patched %d lines of %d" % (len(touched), len(out)))
for row in touched:
    print("  line %-4d %s  %-16s date=%s  fx_rate_date=%s" % row)
```

Sobre el *golden* de `develop` imprime `patched 29 lines of 200` y las veintinueve filas de las tablas 1.1 y 1.2, en orden de fichero.

---

## 5. El protocolo del bloque 3, paso a paso

1. Commit de la regla (`fx_rate_date` obligatorio en los cuatro tipos, generador emitiéndolo siempre, tres fixtures de forma). Tras él, `npm test` queda rojo **en un solo sitio**: el test del *golden*. Es la señal de que la regla ha mordido donde tenía que morder.
2. `npm run atlas -- synth --out <scratchpad>/regenerated.jsonl --seed 1`. El comando verifica por su cuenta (`integrity` + `deepCheck`) y aborta si el libro generado no cuadra.
3. Las cuatro comparaciones, **todas obligatorias**:
   1. `sha256(regenerated.jsonl) == sha256(expected.jsonl)`. **Byte a byte.** Es la que demuestra que el generador no ha hecho nada más: dos caminos independientes, el mismo fichero.
   2. 200 líneas, y `id`/`recorded_at`/`type` idénticos posición a posición.
   3. Diff estructural por claves: añadidas solo en los veintinueve `id`, solo `fx_rate_date`; ninguna eliminada, ninguna modificada, en las 200.
   4. `snapshotOf(projectLedger(regenerated))` idéntico a `synthetic-v1.snapshot.json`, **que no se regenera**.
4. Copiar el fichero a `tests/fixtures/ledger/synthetic-v1.jsonl` y commitear **solo eso**, con los veintinueve identificadores enumerados en el cuerpo del mensaje.
5. **Si algo no cuadra: parar, no tocar el fichero y preguntar.** No se «ajusta la expectativa».

---

## 6. Resultado

*(Se rellena al ejecutar el bloque 3, comparando con los apartados 1 y 3.)*

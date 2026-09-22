# Predicción: qué mueve el valor por defecto nuevo de `income_category`

**Fecha**: 2026-09-22 · **Bloque**: 0.3 del [plan](plan.md) · **Decisión**: criterio **#24** de `docs/fiscal-questions.md` (consulta vinculante DGT [V0267-25](https://petete.tributos.hacienda.gob.es/consultas/?num_consulta=V0267-25)).

`DEFAULT_INCOME_CATEGORY.etc` y `.etp` pasan de `capital_gain` a `movable_capital`.

**Este fichero se escribe y se comitea antes de tocar el valor por defecto.** Después se regenera `tests/fixtures/ledger/synthetic-v1.tax.json` y se compara clave por clave. **Cualquier diferencia que no esté aquí es un hallazgo: se para y se pregunta** (prompt §7, decisión (m)).

La aritmética de abajo está calculada a mano sobre el *golden* **tal y como está hoy en la rama**, no copiada de una salida nueva.

---

## 1. Por qué solo se mueve 2027

El libro sintético tiene un único activo de tipo `etc` (`ast_gold`) y **ningún** `etp`. Sus movimientos, leídos del fichero:

| Fecha | Evento | Cuenta |
|---|---|---|
| 2026-09-05 | `buy` 12 × 191,64 | `acc_ibkr` |
| 2027-05-04 | `transfer` (parte a `acc_ibkr2`) | — |
| 2027-06-06 | `corporate_action` (contrasplit) con venta forzosa en las dos cuentas | `acc_ibkr`, `acc_ibkr2` |

La **única transmisión** de un ETC en todo el libro es la del contrasplit del 06/06/2027. Comprobado además contra el informe congelado: `ast_gold` solo aparece en `capital_gains.lines` de **2027**, y `movable_capital.transmissions` está vacío en los cuatro ejercicios.

→ **2026, 2028 y 2029 son idénticos byte a byte.**

## 2. Lo que se mueve en 2027

Las dos líneas del contrasplit (mismo `event_id`, una por cuenta):

| Cuenta | `computable_eur` | Redondeado |
|---|---|---|
| `acc_ibkr` | `-2.1139083171` | −2,11 |
| `acc_ibkr2` | `-5.4046934669` | −5,40 |
| | | **−7,51** |

### 2.1 Las dos líneas cambian de apartado y de etiqueta

- Salen de `capital_gains.lines` y entran en `movable_capital.transmissions`, en ese orden (el de `core.transmissions`).
- `category` pasa de `"capital_gain"` a `"movable_capital"`.
- En `criteria`, `24:etc_gain` pasa a `24:etc`. El resto de la lista no cambia y la posición tampoco: en el orden del catálogo `24:etc` va justo antes de `24:etc_gain`, y solo hay uno de los dos.

### 2.2 Los saldos

| Cifra | Antes | Después | Cuenta |
|---|---|---|---|
| `capital_gains.gains_eur` | 267,64 | **267,64** | ninguna pérdida es ganancia |
| `capital_gains.losses_eur` | −95,11 | **−87,60** | −95,11 + 7,51 |
| `capital_gains.balance_eur` | 172,53 | **180,04** | 267,64 − 87,60 |
| `movable_capital.balance_eur` | 1,82 | **−5,69** | 1,82 − 7,51 |
| `compensation.capital_gain_eur` | 172,53 | **180,04** | |
| `compensation.movable_capital_eur` | 1,82 | **−5,69** | |
| `compensation.limit_eur.capital_gain` | 43,13 | **45,01** | 25 % de 180,04 |
| `compensation.limit_eur.movable_capital` | 0,46 | **0** | 25 % de un saldo negativo es 0 |
| `compensation.capital_gain_final_eur` | 172,53 | **174,35** | 180,04 − 5,69 |
| `compensation.movable_capital_final_eur` | 1,82 | **0** | absorbido entero |
| **`base_eur`** | 174,35 | **174,35** | **no cambia** |

`compensation.pending` sigue vacío: el saldo negativo de rendimientos se absorbe entero en la fase 1 y no queda nada que arrastrar. `compensation.expired` sigue vacío.

### 2.3 Aparece un paso de compensación

`compensation.steps` pasa de `[]` a **un** paso:

```json
{"phase":1,"from":"movable_capital","origin_year":2027,"against":"capital_gain",
 "amount_eur":"5.69","limited":true,"criteria":["10","22"]}
```

5,69 cabe de sobra en el límite del 25 % de 180,04, que son 45,01.

### 2.4 El apartado de dudosos pierde una entrada y no gana ninguna

Hoy 2027 lista `24:etc_gain` (`difference`, con las tres diferencias a 0). Después:

- La alternativa de #24 se etiqueta por la lectura **aplicada** (`categoryCriterion`): con `movable_capital` aplicado, la entrada sería `24:etc`, que es de **certeza alta**, y `doubtful()` filtra por `isDoubtful` al final. **Desaparece del apartado y no la sustituye nada** (nota N18).
- `24:etp` no aparecía y sigue sin aparecer: no hay ningún `etp` en el libro.

### 2.5 Lo que **no** cambia en el apartado de dudosos

Esto es lo que más fácilmente daría una sorpresa, así que va razonado:

- **`2:listed`** (hoy base +84,16, pendiente 0, diferido −84,17). Su alternativa lee la ventana de los cotizados a un año. Con un año, la compra del 05/09/2026 cae dentro de la ventana de la venta del 06/06/2027 y **las dos pérdidas de `ast_gold` se difieren enteras**: 84,17 = 76,66 de `ast_epsilon` + 7,51 de `ast_gold`. Una pérdida diferida no entra en **ningún** saldo, así que la base de la alternativa no depende de la categoría del ETC: **las tres diferencias se quedan igual**.
- **`4`** (difference +10,54) y **`5`** (exposure 717,35) se calculan sobre `core.transmissions`, que es la lista **entera** de transmisiones antes de repartirse en los dos apartados. La categoría no la toca: **igual**.
- **`1`**, **`7`**, **`13`**, **`18`**: no tocan ninguna línea de `ast_gold` (`1` y `18`) o son exposiciones sobre la lista entera (`7`, `13`): **igual**.
- El **orden** de los dudosos lo fija el orden del catálogo, y solo se quita una entrada.

### 2.6 Lo que no cambia en el resto del informe

- **`wash_sale`**: los diferidos de 2027 son `ast_world` (−90,82) y `ast_delta` (−224,75); ninguno es un ETC. **Igual**.
- **`settings.from_code`**: sigue listando `income_category.etc` y `.etp`, porque los tres `settings_changed` del libro sintético **no** materializan `income_category` (nota N16). Igual.
- **`settings_diff`**: compara dos `settings_changed` que tampoco la materializan, así que las dos lecturas se mueven juntas: `changes` sigue vacío y `base_before_eur` = `base_after_eur` = 174,35. Igual.
- **`notes`**, `withholdings`, `double_taxation`, `in_kind`, `scope`, `today`, `year`: igual.
- **`tests/fixtures/ledger/synthetic-v1.snapshot.json`**: **no se mueve**. `fiscal_settings` guarda el último `settings_changed` **tal cual se escribió**, sin normalizar, y ese no lleva `income_category`.

---

## 3. Los tests de la 009 que usan `etc` o `etp` con la configuración por defecto

Uno por uno, con lo que mueve cada uno. Los que no están en esta lista no deben moverse.

| Test | Qué hace hoy | Qué mueve el valor por defecto nuevo | Qué se hace |
|---|---|---|---|
| `packages/domain/test/tax/exercise-ledger.ts` (el libro del cálculo a mano de la 009) | escribe `{...DEFAULT_SETTINGS, …}`, así que su `settings_changed` **materializa** `income_category` con lo que diga el código | su `etc_gold` pasaría a rendimientos y los literales de `exercise.test.ts` dejarían de ser el cálculo a mano que dicen codificar | **commit anterior**: fija `income_category` en `capital_gain` explícito (nota N17). Sus literales no se mueven |
| `packages/domain/test/tax/year.test.ts`, «with the default, every disposal is a capital gain» | vende `etc_e` con la configuración por defecto y espera `capital_gains.lines` con una línea y `movable_capital.transmissions` vacío | se invierte: la línea del ETC va a rendimientos | se reescribe para decir lo que el valor por defecto dice hoy: un ETC es rendimiento del capital mobiliario y un fondo, ganancia patrimonial |
| `packages/domain/test/tax/year.test.ts`, «compares with the settings before the last change» | `taxBuilder()` (por defecto) y encima un `settings_changed` con `etc: movable_capital`; espera un cambio `capital_gain → movable_capital` y `base_before_eur` 200 | con el valor por defecto nuevo las dos lecturas son iguales: `changes` quedaría vacío | el primer `settings_changed` fija `etc: capital_gain` explícito; el cambio vuelve a ser real y los literales (200) no se mueven |
| `packages/domain/test/tax/moved-years.test.ts` (dos casos) | compara `DEFAULT_SETTINGS` contra `{…, income_category: {etc: "movable_capital"}}`; espera 2027 de 300 a 375 | las dos lecturas pasan a ser la misma: `movedTaxYears` devolvería `[]` | se invierte el sentido: antes `etc: capital_gain` explícito, después el valor por defecto. Las cifras (300 → 375) no se mueven |
| `packages/domain/test/tax/year.test.ts`, «an ETC set to movable capital…», «#24: names the reading…», «a release of a loss of the other category…» | fijan `income_category` explícitamente en la configuración del libro | **nada**: lo explícito manda sobre el valor por defecto | sin cambios |
| `packages/domain/test/tax/review.test.ts`, `windowCriterion` | solo nombra variantes de #2 | nada | sin cambios |
| `packages/domain/test/properties/tax-ledgers.ts` (200 libros aleatorios) | incluye `ast_etc`; los tests comprueban **invariantes** (la base cuadra, nada depende de un precio), no cifras concretas | las cifras internas de algunos libros cambian; **los invariantes no** | sin cambios; si alguno fallara, es un hallazgo |
| `packages/domain/test/synth/generator.test.ts` | comprueba qué tipos de activo genera el sintético | nada | sin cambios |
| `tests/fiscal-criteria.test.ts` | compara la tabla del documento con el catálogo | nada: el catálogo ya trae las cuatro variantes de #24 y el documento ya está fusionado | sin cambios |
| `apps/cli/test/commands/tax-figures.test.ts` | contrasta la salida de `atlas tax` con el cálculo a mano de la 009 | nada, porque ese libro queda fijado en `capital_gain` | sin cambios |
| `packages/domain/test/tax/proofs.test.ts`, «reproduces …synthetic-v1.tax.json» | congela el informe del libro sintético | el fichero se regenera con el diff de §2 | se regenera y se enumera el diff |
| `packages/domain/test/projections/snapshot` / la instantánea del libro | `fiscal_settings` sin normalizar | nada (§2.6) | sin cambios |

---

## 4. Resultado de la comparación

Se rellena **después** de regenerar, sin tocar nada de lo de arriba.

- [ ] 2026, 2028 y 2029, idénticos byte a byte.
- [ ] 2027, exactamente las diferencias de §2.
- [ ] La instantánea del libro, sin cambios.
- [ ] Los tests de §3, exactamente los que se han tocado.

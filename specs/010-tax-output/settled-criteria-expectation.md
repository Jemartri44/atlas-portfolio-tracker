# Predicción: lo que añade el apartado de criterios firmes

**Escrita y comiteada antes de regenerar** `tests/fixtures/ledger/synthetic-v1.tax.json`
(prompt 010, decisión (m); regla de la casa sobre ficheros dorados).

**Fecha**: 2026-09-23 · **Bloque**: 2 · **Decisión**: la dirección eligió la opción (b) del
apartado «Criterios firmes: qué se ve y qué no» de `questions.md`.

---

## 1. Qué cambia en el código, y por qué mueve el dorado

`doubtful()` en `packages/domain/src/tax/year.ts` construye **un apartado por criterio que la
declaración aplica** y, en su última línea, tira todo lo que no es dudoso:

```ts
return items.filter((entry) => isDoubtful(entry.criterion)).sort(…);
```

Desde que los criterios **#18** y **#19** subieron a certeza alta (2026-09-23), ese filtro
descarta un importe que ya estaba calculado: lo que movería la lectura contraria de una regla
que sí aplicamos. El cambio **no calcula nada nuevo**: sustituye el filtro por una partición y
devuelve las dos listas.

Por eso el informe gana una clave, y por eso hay que predecir qué entra en ella.

## 2. Lo que se espera que se mueva, clave por clave

`taxReportJson` ordena las claves (`sortKeysDeep`), así que la clave nueva `settled` cae
**después de `settings_diff` y antes de `today`** (`settings` < `settings_diff` < `settled`).

| Ejercicio | Qué gana | Por qué |
|---|---|---|
| **2026** | `"settled": []` | No hay ninguna transmisión: ningún criterio se aplica |
| **2027** | `"settled": [ … una entrada, el #18 … ]` | Tres transmisiones declaran el #18 |
| **2028** | `"settled": []` | Sus líneas declaran 1, 2:listed, 3, 4, 5, 6 y 14: ninguno de certeza alta con apartado |
| **2029** | `"settled": []` | No hay transmisiones |

**Nada más se mueve.** En particular:

- `doubtful` **no cambia en ningún ejercicio**: conserva exactamente el mismo filtro y el mismo
  orden. Si se moviera una sola entrada, es un hallazgo.
- Ninguna otra clave del informe se toca: ni `base_eur`, ni `compensation`, ni las líneas, ni
  `notes`, ni `settings_diff`.
- La instantánea del libro (`synthetic-v1.snapshot.json`) **no se mueve**: no guarda criterios.

## 3. La entrada de 2027, campo a campo

Derivada de `WashSaleOutcome.alternatives["18"]` y `no_carrier_for_18` **con el código de hoy**,
antes de tocar nada, sobre el libro sintético a fecha de consulta `2030-01-01`:

```json
{
  "base_difference_eur": "0",
  "certainty": "high",
  "criterion": "18",
  "direction": "none",
  "documented_risk": "aggressive",
  "event_ids": [
    "01MBP2GS80T8F1MS8PT0M7FK2R",
    "01MN8FTA80DDTPKAG5TNV3Q20X",
    "01N4F4Y58036KX1852YTTM0XD3"
  ],
  "measure": "difference",
  "reason": "no_carrier_left"
}
```

Las tres operaciones son las que llevan `18` en sus criterios en 2027 (`ast_world`,
`ast_epsilon` y `ast_delta`). La diferencia es **0,00** y la razón es `no_carrier_left`: la
lectura contraria del #18 contaría también los títulos que la propia venta consumió, pero un
aplazamiento necesita un lote donde esperar y no queda ninguno homogéneo en cartera, así que
**no difiere ni un céntimo más**. `directionOf(0, 0)` da `none`.

**Y es justo el caso que hace falta ver**: un cero aquí no es «no pasa nada», es «lo hemos
mirado y no cambia nada», que es información distinta de no haberlo mirado. Por eso el apartado
**no filtra por importe distinto de cero** (condición 2 de la dirección).

## 4. Lo que se mueve fuera del dorado, y que también hay que revisar

| Fichero | Qué |
|---|---|
| `packages/domain/src/tax/report.ts` | `DoubtfulItem` pasa a llamarse `CriterionStake` (las dos listas guardan lo mismo: lo que un criterio pone en juego). `TaxYearReport` gana `settled` |
| `apps/cli/src/commands/tax.ts` | Apartado **9** nuevo, «Criterios firmes»; «Lo que este motor no calcula» pasa a 10 y «Diferencias con la configuración anterior» a 11 |
| `apps/cli/test/commands/tax.test.ts` | Los rótulos de los apartados renumerados |
| `README.md` | El contrato de `atlas tax` pasa de **diez** apartados a **once** |

La leyenda de criterios del final de `atlas tax` gana los criterios que solo aparecen en el
apartado nuevo (en 2027, ninguno: el #18 ya salía en las líneas).

---

## 5. Resultado de la comparación

*(Se rellena después de regenerar, enumerando el diff clave por clave.)*

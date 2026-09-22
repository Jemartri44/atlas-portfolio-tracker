# Predicción: qué mueve la corrección de etiquetas de los criterios #17 a #24

**Fecha**: 2026-09-22 · **Origen**: revisión adversarial de los criterios #17 a #24, verificada contra las fuentes por la dirección (2026-09-22).

**Se escribe y se comitea antes de tocar el catálogo.** Después se regenera `tests/fixtures/ledger/synthetic-v1.tax.json` y se compara clave por clave. **Cualquier diferencia que no esté aquí es un hallazgo: se para y se pregunta.**

Este lote es **solo etiquetas y prosa**: ninguna cifra se calcula distinto. Lo que se mueve es lo que el informe **dice sobre** sus cifras.

---

## 1. Lo que cambia en el catálogo y en el documento

| Criterio | Certeza | Riesgo | Por qué |
|---|---|---|---|
| `24:etc` | **alta → media** | **conservador → ambas** | La *ratio* de la V0267-25 es «es un valor de deuda», no «es un ETC»: un ETC de oro con derecho de entrega obliga a **entregar**, no a pagar, y eso la consulta no lo resuelve. Y el art. 49.1 es simétrico: con pérdida en el ETC y dividendos en el cubo se paga **menos** (agresivo); con ganancia en el ETC y pérdidas patrimoniales, **más** (conservador) |
| `24:etp` | **media → baja** | **conservador → ambas** | No hay **ninguna** consulta sobre ETP de criptomonedas, y la DGT sí tiene doctrina consolidada de que la cripto en tenencia directa es ganancia patrimonial |
| `24:etc_gain` | baja (igual) | **agresivo → ambas** | La simetría del art. 49.1 vale igual para la lectura contraria |
| `24:etp_gain` | media (igual) | **agresivo → ambas** | Íd. |
| `20` | media (igual) | **ambas → agresivo** | Netear por operación nunca difiere **más** que por lote —el valor absoluto de la pérdida neta es siempre menor o igual que la suma de las pérdidas por lote—, así que siempre se paga menos hoy y no existe escenario contrario |
| `19` | **media → baja** | agresivo (igual) | No hay norma ni consulta, y la mecánica del manual apunta **en contra**: cada transmisión se evalúa con su propia ventana y su propio recuento |
| `17` | media (igual) | agresivo (igual) | Solo prosa: se añade la **tercera lectura** (que la comisión de una permuta **no se deduzca nunca**, con lo que el riesgo deja de ser un desfase temporal y pasa a ser **permanente**) y la pista del manual del Modelo 100 sobre repartirla entre las dos patas |
| `23` | alta (igual) | conservador (igual) | Solo prosa: los tres flecos abiertos y que la etiqueta describe **el valor por defecto de la clasificación**, no el criterio |

**Fuera de este lote, y por qué:**

- **`18`**: la dirección pide subir la certeza y **quitar la etiqueta agresiva**, y no dice qué la sustituye. Cambiar una dirección de riesgo es una decisión fiscal, así que queda **preguntada y sin tocar**.
- **`2` (ventana de los fondos, `1y` → `2m`)**: cambia comportamiento y **choca con `windowCriterion`**, que está congelado. Preguntado; va en su propio lote con su propia predicción.

## 2. Lo que se mueve en el fichero dorado

Solo el **apartado de dudosos**, y solo de **2027**, que es el único ejercicio con transmisiones de un ETC.

`isDoubtful` es «todo lo que no es certeza alta». Con `24:etc` bajando de alta a media, la entrada que el bloque 0 había **quitado** del apartado de dudosos **vuelve a entrar**:

```
/2027/doubtful   9 entradas → 10
```

La entrada nueva, en la última posición (el orden es el del catálogo, y `24:etc` va tras `18`):

```json
{"criterion":"24:etc","certainty":"medium","documented_risk":"both",
 "measure":"difference","event_ids":["01MQTWHB78RC2FADH9B774BHS5","01MQTWHB78RC2FADH9B774BHS5"],
 "base_difference_eur":"0","pending_difference_eur":"0","deferred_difference_eur":"0"}
```

Las tres diferencias a cero, como las tenía `24:etc_gain` antes del bloque 0: leer el ETC de la otra manera mueve el reparto entre los dos saldos y **no mueve la base**.

**Nada más se mueve:**

- **2026, 2028 y 2029, idénticos byte a byte**: no tienen ninguna transmisión de ETC ni de ETP.
- Las **nueve entradas de dudosos que ya estaban** en 2027 (`1`, `2:listed`, `4`, `5` ×1, `7` ×2, `13` ×2, `18`) no cambian: ninguno de los criterios tocados es suyo. `20` y `19` **no aparecen** en ningún ejercicio del libro sintético, así que sus cambios de etiqueta no mueven nada aquí.
- Las **líneas de transmisión** llevan identificadores de criterio, no certezas: `24:etc` sigue siendo la etiqueta de las dos líneas de `ast_gold` y no cambia.
- Ninguna **cifra**: ni saldos, ni compensación, ni base, ni pendientes, ni diferidos.
- La **instantánea del libro** no se mueve: no guarda criterios.

## 3. Lo que se mueve en los tests

| Test | Qué mueve |
|---|---|
| `tests/fiscal-criteria.test.ts` | Nada: lee el documento y el catálogo, y los dos cambian a la vez, en el mismo commit |
| `test/tax/income-category-default.test.ts`, «stops doubting the ETC» | **Se invierte**: con certeza media el ETC vuelve a ser dudoso. El test pasa a comprobar que aparece como `24:etc`, con certeza media y riesgo ambas |
| `test/tax/year.test.ts`, «#24: names the reading each of ETC and ETP applies» | Espera hoy que `24:etc` **no** esté entre los dudosos y que el riesgo de `24:etp` sea conservador. Pasa a esperar los cuatro dudosos, con `both` |
| `test/tax/proofs.test.ts`, el dorado | Se regenera con el diff de §2 |
| Todo lo demás | Sin cambios: ninguna cifra se mueve |

En `tests/fiscal-criteria.test.ts` sobran además dos exenciones de `DOCUMENT_SILENT`: las de `24:etc_gain` y `24:etp_gain`, que existían porque el documento solo declaraba una certeza y un riesgo. Con «Media (ETC) / Baja (ETP)» y «Ambas», las cuatro variantes dicen exactamente lo que dice el documento y **las exenciones se retiran**, que es apretar el test, no relajarlo.

---

## 4. Resultado de la comparación

Se rellena después, sin tocar nada de lo de arriba.

- [ ] Solo 2027, y solo `doubtful`.
- [ ] La entrada nueva es `24:etc`, media, ambas, con las tres diferencias a cero.
- [ ] 2026, 2028 y 2029, byte a byte.
- [ ] Ninguna cifra movida en ningún ejercicio.

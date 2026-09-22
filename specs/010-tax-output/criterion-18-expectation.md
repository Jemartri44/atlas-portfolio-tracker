# Predicción: qué mueve subir la certeza del criterio #18

**Fecha**: 2026-09-23 · **Origen**: revisión adversarial (A9). La dirección pidió subir la certeza del #18 **solo si se verifica la fuente**, y dejarla como está si no.

**Se escribe y se comitea antes de tocar el catálogo.** Después se regenera `tests/fixtures/ledger/synthetic-v1.tax.json` y se compara clave por clave. **Cualquier diferencia que no esté aquí es un hallazgo: se para y se pregunta.**

---

## 1. La fuente, verificada

**Manual práctico de Renta 2025 de la AEAT**, capítulo 11, página «Pérdidas patrimoniales que no se computan fiscalmente como tales» (`sede.agenciatributaria.gob.es`, **actualizada el 17/03/2026**), leída el 2026-09-23. Dice, con todas las letras:

> «Se considera que existe una recompra cuando se adquieren valores homogéneos dentro de los dos meses anteriores o posteriores a la venta y **dichos valores continúan en el patrimonio del contribuyente tras la transmisión**.»

Es exactamente el criterio #18: solo cuentan las adquisiciones que **permanecen en el patrimonio** después de la venta; una compra que la propia venta consume por FIFO no bloquea la pérdida. Lo dice el manual de la propia administración, que es el mismo apoyo que sostiene al #19 (allí, una consulta vinculante). La certeza pasa de **Media** a **Alta**.

**La dirección del riesgo no cambia y sigue siendo `aggressive`**, que es lo que la dirección ya resolvió para el #18 y el #19: la columna responde «si este criterio está mal, ¿se pagó de más o de menos?», y contar también lo consumido diferiría **más** pérdida, así que la lectura aplicada deduce antes. Subir la certeza hace el fallo más improbable, no de otro signo.

## 2. Lo que cambia en el catálogo y en el documento

| Criterio | Certeza | Riesgo |
|---|---|---|
| `18` | **media → alta** | agresivo (igual) |

`docs/fiscal-questions.md` fila #18 y `FISCAL_CRITERIA["18"]` de `packages/domain/src/tax/criteria.ts`, **en el mismo commit** (lo exige `tests/fiscal-criteria.test.ts`).

## 3. Lo que se mueve en el fichero dorado

`isDoubtful` es «todo lo que no es certeza alta». Con el #18 en alta, su entrada **sale** del apartado de dudosos. Solo aparece en un sitio de todo el fichero:

```
/2027/doubtful   11 entradas → 10
```

La entrada que desaparece es la décima (índice 9), entre `13` y `24:etc`, que es el orden del catálogo:

```json
{"criterion":"18","certainty":"medium","documented_risk":"aggressive",
 "measure":"difference","event_ids":["01MBP2GS80T8F1MS8PT0M7FK2R","01MN8FTA80DDTPKAG5TNV3Q20X","01N4F4Y58036KX1852YTTM0XD3"],
 "base_difference_eur":"0","direction":"none","reason":"no_carrier_left"}
```

**Nada más se mueve.** En concreto:

- El **`18` sigue en `criteria`** de las tres líneas de transmisión que lo aplican (`/2027/capital_gains/lines/{0,1,5}/criteria[5]`): el criterio se sigue aplicando y se sigue diciendo; lo que deja de haber es una **lectura alternativa** que ofrecer.
- Ni una cifra: la diferencia que ofrecía esa entrada ya era **0,00** en este libro (`no_carrier_left`: la venta no dejó títulos que pudieran cargar el diferimiento).
- Ningún otro ejercicio: 2026, 2028 y 2029 no tienen ninguna entrada del #18 en dudosos.
- `synthetic-v1.jsonl` y `synthetic-v1.snapshot.json` **no se tocan**: esto no cambia ningún evento ni ninguna proyección.

## 4. Lo que se mueve en los tests, y por qué

Tres assertions miran la entrada de dudosos del #18. Siguen el patrón que ya se usó con el #19 cuando subió a alta (commit `bc61bb3`): el criterio se sigue nombrando en la línea, y se comprueba que **no** es dudoso.

| Fichero | Qué |
|---|---|
| `packages/domain/test/tax/wash-sale.test.ts` (dos casos) | Pasan de comprobar `base_difference_eur` y `reason` de la entrada a comprobar que el `18` está en `criteria` de la línea y **no** en `doubtful` |
| `packages/domain/test/tax/hand-checked.test.ts` | Íd.: `doubtful(report, "18")` pasa a ser `undefined` |
| `apps/cli/test/commands/tax-figures.test.ts:261` | La marca de dudoso de la CLI: `"1* 2:fund_1y* 3 6 14 18*"` → `"1* 2:fund_1y* 3 6 14 18"` |

## 5. Lo que esto **cuesta**, dicho aquí

Es el mismo efecto que la dirección dejó anotado para el #19 y congeló para el bloque 2: **una lectura alternativa deja de verse porque hemos dejado de dudar de ella**. En el libro sintético la cifra en juego es 0,00 €, pero en un libro real la lectura contraria del #18 (contar también la recompra que la propia venta consumió) puede diferir una pérdida grande, y con el criterio en certeza alta esa cifra no aparece en ningún sitio.

Se anota en las pendientes de `questions.md` junto a la del #19: **las dos se deciden en el bloque 2**, que es donde se elige qué ve el usuario y dónde. No se resuelve aquí.

---

## 6. Resultado de la comparación (2026-09-23)

**Cumplida al pie de la letra.** Regenerado `tests/fixtures/ledger/synthetic-v1.tax.json` y comparado con el anterior, el `diff` entero es **una sola entrada borrada**, la del `18` en `/2027/doubtful`, exactamente la que predice el apartado 3:

```diff
@@ -991,20 +991,6 @@
       {
         "base_difference_eur": "0",
         "certainty": "medium",
-        "criterion": "18",
-        "direction": "none",
-        "documented_risk": "aggressive",
-        "event_ids": [
-          "01MBP2GS80T8F1MS8PT0M7FK2R",
-          "01MN8FTA80DDTPKAG5TNV3Q20X",
-          "01N4F4Y58036KX1852YTTM0XD3"
-        ],
-        "measure": "difference",
-        "reason": "no_carrier_left"
-      },
-      {
-        "base_difference_eur": "0",
-        "certainty": "medium",
         "criterion": "24:etc",
```

Ni una línea más: el `18` sigue en los tres `criteria`, ninguna cifra se movió, y `synthetic-v1.jsonl` y `synthetic-v1.snapshot.json` no se tocaron. **Nada no previsto.**

Los cuatro sitios de test del apartado 4 son los cuatro que fallaron al aplicar el cambio, ni uno más. Suite completa: **163 ficheros, 1.576 tests**, verde.

Una corrección de redacción que no estaba prevista: la celda de certeza no puede decir «Alta (subida de **media**…)», porque `tests/fiscal-criteria.test.ts` busca palabras clave en la celda y leía las dos certezas. Queda «Alta (subió el 2026-09-23, al verificarse el manual de la AEAT)».

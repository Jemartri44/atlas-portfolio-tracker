# Predicción: el criterio de los ETC y los ETP pasa a ser el #24 del documento

**Escrita antes de tocar el código.** Si al regenerar se mueve algo que no esté aquí, **se para y se pregunta**.

## Por qué

La PR #60 dio número a la pregunta que el catálogo tenía sin él: la fila **#24** de `docs/fiscal-questions.md`, la categoría de renta de los ETC y los ETP, con certeza **alta (ETC) / media (ETP)** y riesgo **conservador**. Mi test anti-deriva lo cazó («#24: missing in the catalogue»). La entrada `etc_etp_category` (`disputed` / `both`, eximida por `NOT_IN_THE_TABLE`) se parte en variantes del #24 y la exención desaparece.

## Qué cambia en el código

Como con la ventana efectiva del #2, **se etiqueta por la lectura que se aplica de verdad**. Eso pide cuatro identificadores y no dos, porque la certeza y el riesgo, y con ellos si el criterio es dudoso y si lleva estrella, dependen de la lectura aplicada, y el catálogo los guarda por identificador:

| Identificador | Cuándo se aplica | Certeza | Riesgo |
|---|---|---|---|
| `24:etc` | `income_category.etc` = rendimiento del capital mobiliario (lo que dice el documento) | alta | conservador |
| `24:etp` | `income_category.etp` = rendimiento del capital mobiliario | media | conservador |
| `24:etc_gain` | `income_category.etc` = ganancia patrimonial (lo contrario del documento) | media | **agresivo** |
| `24:etp_gain` | `income_category.etp` = ganancia patrimonial | media | **agresivo** |

- Con la lectura del documento, el ETC deja de ser dudoso (certeza alta) y el ETP sigue siéndolo.
- Con la contraria, las dos son dudosas y su riesgo documentado es agresivo: una pérdida compensaría al 100 % lo que la lectura documentada limita al 25 %.
- El riesgo agresivo no está en la fila del documento, que solo da el conservador de su propia lectura: las dos variantes `_gain` se eximen **solo en el riesgo**, con su motivo, como ya hacen `2:listed_1y`, `2:crypto` y `2:other`.
- La lectura alternativa se calcula **por tipo de activo** en lugar de dar la vuelta a los dos a la vez, para que cada variante diga lo suyo.
- `NOT_IN_THE_TABLE` desaparece del test anti-deriva: ya no hay nada en el catálogo fuera de la tabla.
- **El valor por defecto no cambia**: `income_category` sigue siendo ganancia patrimonial para los dos hasta el bloque 0 de la feature 010. Por eso, con la configuración de hoy, lo que se etiqueta es la variante `_gain`.

## Qué se mueve en `synthetic-v1.tax.json`

Solo el ejercicio **2027**, y solo donde estaba `etc_etp_category`. El libro tiene un ETC (`ast_gold`) y un ETP; solo el ETC se transmite, en el contrasplit `01MQTWHB78RC2FADH9B774BHS5`, que da una línea por cuenta.

1. En las **dos líneas** de ese evento, el criterio `etc_etp_category` pasa a `24:etc_gain`. Sigue siendo el último de la lista, porque el orden es el del catálogo y el #24 va después del #23.
2. El **dudoso** de ese criterio cambia tres valores y conserva el resto:

   | Campo | Antes | Después |
   |---|---|---|
   | `criterion` | `etc_etp_category` | `24:etc_gain` |
   | `certainty` | `disputed` | `medium` |
   | `documented_risk` | `both` | `aggressive` |

   `measure` sigue siendo `difference`; `base_difference_eur`, `pending_difference_eur` y `deferred_difference_eur` siguen en `0`; `direction`, en `none` (dar la vuelta al criterio no mueve la base de 2027); y `event_ids`, las dos líneas del mismo evento. Sigue siendo el último dudoso del año.

No aparece ningún dudoso del ETP: no hay ninguna transmisión suya, así que su lectura alternativa no toca ninguna cifra. Los ejercicios 2026, 2028 y 2029 no cambian.

`synthetic-v1.jsonl` y `synthetic-v1.snapshot.json` **no se mueven**: nada de esto toca la proyección. `tax-hand-v1.jsonl` tampoco tiene ETC ni ETP, así que sus cifras siguen igual.

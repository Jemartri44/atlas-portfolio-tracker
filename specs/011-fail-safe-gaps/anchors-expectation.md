# Predicción: qué se mueve en `synthetic-v1.tax.json` al conservar todas las anclas

**Escrita y comiteada ANTES de regenerar nada** (feature 011, bloque 6). Si al comparar aparece una sola diferencia que no esté aquí, **es un hallazgo: se para y se pregunta.**

## Qué cambia en el código

`TaxYearReport.anchor?: AnchorDifference` —un campo opcional que llevaba **una** sustitución, la última— pasa a `anchors: AnchorDifference[]`, **siempre presente**, con todas las que la cadena aplicó y vacía cuando no hubo ninguna.

**Por qué siempre presente y no opcional.** Es la convención que el resto del informe ya sigue con sus listas, comprobada sobre el propio dorado: `in_kind`, `doubtful`, `settled` y `notes` **no** son opcionales y se serializan aunque estén vacías —`in_kind` sale como `[]` en los cuatro ejercicios y `settled` en tres de los cuatro—; lo que se omite son los campos que **no** son listas y pueden no existir (`filing`, `settings_diff`). Si «no hubo sustituciones» y «lista vacía» significan lo mismo, un campo siempre presente es más simple y evita que alguien lea «no lo sé» donde la respuesta es «no hubo». *(La primera propuesta fue dejarlo opcional **para no mover este fichero**; la dirección lo corrigió con el argumento correcto: el dorado registra lo que el diseño decide, no lo decide.)*

## Qué se mueve, exactamente

El libro sintético **no tiene ninguna presentación** —comprobado: `grep -c tax_return_filed tests/fixtures/ledger/synthetic-v1.jsonl` da **0**—, así que **ninguna sustitución ocurre en ninguno de sus cuatro ejercicios**. Hoy, en consecuencia, ninguno de los cuatro lleva la clave `anchor`:

```
¿alguno tiene anchor hoy? {'2026': False, '2027': False, '2028': False, '2029': False}
```

**La predicción, entera:**

- **Cuatro líneas añadidas**, una por ejercicio: la clave `"anchors": []` en `2026`, `2027`, `2028` y `2029`.
- La clave sale **ordenada alfabéticamente** dentro de cada ejercicio (`sortKeysDeep`), es decir **entre `"6"`… no: entre las claves que la rodean**, que son `base_eur` y `capital_gains`. Queda como primera clave del objeto de cada ejercicio, porque `anchors` precede a `base_eur`.
- **Ninguna cifra cambia**: ni una base, ni una ganancia, ni un pendiente, ni un diferido, ni un criterio, ni una nota. La forma de `AnchorDifference` no se toca y su contenido tampoco; lo único que cambia es **cuántas** caben y que la lista existe siempre.

**Lo que NO se mueve, y comprobarlo es parte de la predicción:**

- `tests/fixtures/ledger/synthetic-v1.jsonl` — el libro no gana ni pierde un evento.
- `tests/fixtures/ledger/synthetic-v1.snapshot.json` — la instantánea de la proyección no conoce el informe fiscal.
- `tests/fixtures/ledger/tax-hand-v1.jsonl` y su informe a mano.

## Cómo se comprueba después

1. `git diff --stat` sobre `tests/fixtures/`: **un** fichero, `synthetic-v1.tax.json`.
2. `git diff` del fichero: **exactamente cuatro líneas añadidas**, todas `"anchors": [],`, y **ninguna línea borrada ni modificada**.
3. Comparación clave por clave entre el JSON de antes y el de después: la única diferencia es la clave `anchors` en la raíz de cada ejercicio, con valor `[]`.

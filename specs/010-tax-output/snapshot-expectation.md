# Predicción: qué mueve el tipo de evento `tax_return_filed`

**Fecha**: 2026-09-22 · **Bloque**: 1 del [plan](plan.md) · **Decisión**: ADR-0020.

**Se escribe y se comitea antes del commit que añade el tipo de evento.** Después se comparan las dos instantáneas congeladas y **cualquier diferencia que no esté aquí es un hallazgo: se para y se pregunta** (decisión (m) del prompt).

El libro sintético **no gana eventos** (lección de la 008: un evento nuevo en el escenario rebaraja los identificadores de todo lo posterior). Los casos con presentaciones se construyen con `LedgerBuilder`. Por eso lo único que puede moverse de sus dos ficheros congelados es lo que el **tipo nuevo** añade a la forma de la proyección, aunque el libro no tenga ninguno.

---

## 1. `tests/fixtures/ledger/synthetic-v1.snapshot.json`

Hoy tiene 16 claves de primer nivel, en el orden que impone `sortKeysDeep`:

```
accounts · assets · cash · fiscal_settings · gains · in_kind_income · income ·
invalid · lots · orders · positions · settings_history · theses ·
transfer_requests · valuations · warnings
```

**Predicción: gana exactamente una clave, `filings`, con el valor `[]`, y nada más.**

- Va **entre `cash` y `fiscal_settings`**, porque `snapshotOf` ordena las claves y `filings` < `fiscal_settings` < `gains`.
- El valor es la lista vacía: el libro sintético no tiene ninguna presentación.
- **Ninguna otra clave cambia**, ni en contenido ni en orden. El tipo nuevo no toca el catálogo, ni el efectivo, ni los lotes, ni las ganancias, ni los avisos: es un documento administrativo, como una tesis, y no es una operación (`isOperationEvent` lo excluye, igual que excluye a las tesis).
- El fichero crece, por tanto, **una línea** (`"filings": [],`).

**La huella no entra en la instantánea.** `ledger_fingerprint.sha256` y su `schema_version` quedan fuera a propósito (§1.3 del plan): `compact` vuelve a sellar las huellas al reescribir, y si la instantánea las llevara, la comprobación de `compact` —proyectar antes y después y exigir la misma instantánea— abortaría por un cambio que el propio `compact` acaba de hacer. Lo que sí entra de cada presentación es su identidad y sus cifras.

## 2. `tests/fixtures/ledger/synthetic-v1.tax.json`

**Predicción: no se mueve ni un byte.**

Lo que el informe gana en el bloque 1 —`filing` (la comparación con lo declarado) y `anchor.before_ledger`— es **opcional y solo aparece con una presentación `renta` en vigor**. El libro sintético no tiene ninguna, así que:

- `filing` está ausente en los cuatro ejercicios, y una clave ausente no se serializa.
- `anchor` sigue ausente: sin presentaciones no hay ancla.
- Ninguna cifra cambia: el tipo nuevo no entra en ningún saldo.

El informe fiscal de este fichero **ya se movió** en el bloque 0 por el valor por defecto de `income_category`, con su propia predicción (`income-category-expectation.md`). A partir de ahí, **congelado**.

## 3. Lo que sí cambia, y no está congelado en un fichero

- **El catálogo de tipos de evento pasa de 24 a 25.** `SUPPORTED_EVENT_TYPES` gana `tax_return_filed`, y con él los tests de exhaustividad que recorren el catálogo: etiquetas y traducciones en las dos interfaces, `knownFieldsOf`, la cobertura de `FX_FIELDS`. **Fallarán solos** (es el precedente de la 008, Q9) y se arreglan en el mismo commit.
- `schema_version` **sigue siendo 1**: un tipo de evento nuevo es un cambio **compatible** según ADR-0018, igual que `swap` en la 008.
- El libro sintético **no** gana el evento, así que `synthetic-v1.jsonl` no se toca y ningún identificador se rebaraja.

---

## 4. Resultado de la comparación

Se rellena después, sin tocar nada de lo de arriba.

- [ ] La instantánea gana `filings: []` y nada más.
- [ ] El informe fiscal, byte a byte igual.
- [ ] El `.jsonl` del libro sintético, sin tocar.

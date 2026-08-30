# Preguntas abiertas — feature 002-corporate-actions

Dudas encontradas al leer la documentación que el prompt me prohíbe resolver por mi cuenta (nada fiscal ni estructural se decide en esta feature). Cada una lleva el supuesto provisional con el que sigo trabajando; si el usuario elige otra opción, se ajusta antes de implementar la parte afectada.

## Q1 — Componente en efectivo de una fusión: ¿qué vende el `forced_sale`? (fiscal y de esquema)

**Contexto.** `data-schema.md` §6.5 y ADR-0011 definen `forced_sale` como "idéntica a un `sell` en FIFO" / "como un `sell` FIFO por cada cuenta": resta posición física, consume lotes y genera ganancia. El ejemplo de fusión con pago parcial en efectivo del mismo §6.5 (1 nueva por 2 antiguas **más 3 € por antigua**) escribe:

```json
{"op":"forced_sale","quantity":"all","unit_price":"3", ...},
{"op":"convert","to_asset_id":"ast_new","ratio":"0.5"}
```

Con la semántica de venta, `forced_sale` de `"all"` a 3 € vendería las 10 acciones antiguas por 30 € (pérdida de 970 €) y dejaría **nada** que canjear: el `convert` siguiente fallaría por falta de lotes. El comentario del ejemplo ("se expresa como venta del componente en efectivo por acción antigua") sugiere otra semántica —cobrar 3 € por acción sin entregar acciones—, que no es un `sell` y no está definida en ninguna primitiva. Además, el ejemplo usa la forma antigua del efecto (`quantity` a nivel de efecto, `note`) en vez de `per_account[]` (decisión d del prompt).

**Opciones.**
- **(a) `forced_sale` es siempre una venta** (lo que dicen la tabla y el ADR). El componente en efectivo de una fusión se modela vendiendo una **parte** de las acciones antiguas: cantidad y precio los fija el usuario con el asesor (por ejemplo, la fracción cuyo valor de canje equivale al efectivo recibido) y el `convert` posterior aplica el ratio al resto. El asistente `merger --cash-per-share` no puede calcular esa cantidad sin un valor de canje, así que se reserva para los picos del activo nuevo (tras el `convert`), y el componente en efectivo se registra con `raw`. Sin cambio de esquema; el ejemplo de §6.5 habría que corregirlo.
- **(b) Nueva semántica "cobro sin entrega"**: una primitiva (o un parámetro de `forced_sale`) que registra efectivo y ganancia sin restar posición ni consumir lotes enteros —fiscalmente, el efectivo reduce el coste de los lotes o tributa como ganancia con coste cero, según lo que diga el asesor—. Requiere ADR y cambio de `data-schema.md` §6.5.
- **(c) Tratar el efectivo de la fusión como `dividend`** (rendimiento del capital mobiliario) y dejar `convert` puro. Sin cambio de esquema, pero es una calificación fiscal que no me corresponde.

**Respuesta del usuario (2026-08-30): (a).** `data-schema.md` §6.5 y `docs/fiscal-questions.md` #13 lo recogen desde `develop` (PR #14). Además el usuario fijó que `ratio` admite fracción `nuevas/antiguas` con división a 10 decimales y resto exacto al último lote y a la última cuenta (spec A2, FR-007/008/009). Razonamiento original: es la única lectura compatible con la tabla y con la propiedad "`forced_sale` = `sell`" que el prompt exige testear. El asistente `merger` genera `forced_sale` solo para los picos (después del `convert`, sobre el activo nuevo); la fila de §8.5 "antes del `convert`, sobre el activo antiguo" queda soportada por `raw` con la cantidad que decida el usuario.

## Incoherencias menores detectadas (no bloquean; se resuelven a favor del documento más reciente)

- **ADR-0011** describe `forced_sale` con `quantity`/`all` y `fee?` a nivel de efecto y `grant` con `account_id` suelto; `data-schema.md` §6.5 (decisión d del prompt) los sustituye por `per_account[]`. Se usa el esquema.
- **`data-schema.md` §6.2** lista `notes` de `corporate_action` sin `?`; el prompt §3.1 lo marca opcional. Se usa el prompt (`notes?`), como en el resto de operaciones.
- **`data-schema.md` §6.2** dice que `forced_sale` "reparte el efectivo entre cuentas en proporción a su posición física"; con `per_account[]` el reparto es explícito, cuenta a cuenta (hallazgo 8 del *challenge*). No hay reparto automático.
- **Identificadores de lote.** En la 001 son `<event_id>#<n>` con `n` contado dentro del activo; un `issuer_restructuring` con dos `convert` en cadena crearía `#0` en dos activos. Se pasa a contar `n` por evento en todo el libro (los libros de la 001 no cambian: cada evento creaba lotes en un solo activo). Detalle de implementación, no de esquema.
- **`data-schema.md` §7.1** dice "tesis en la primera pasada, en orden de fichero, como el catálogo". Para que un `thesis_opened` pueda preceder en el fichero al `asset_created` de su activo (igual que una compra), las tesis se aplican en la pasada A **después** de todo el catálogo, en orden de fichero (supuesto A5 del spec). No cambia el documento.

## Notas de implementación

*(Se rellena durante `/speckit-implement`.)*

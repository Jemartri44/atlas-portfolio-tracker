# ADR-0005 — Representación de dinero y cantidades

**Estado:** Aceptada (2026-08-30).

## Contexto

El dominio manipula importes (EUR y divisa), cantidades (participaciones con 4-6 decimales, cripto con hasta 18) y tipos de cambio (4-6 decimales). La constitución prohíbe la coma flotante. JavaScript no tiene tipo decimal nativo.

## Opciones consideradas

1. **`big.js` envuelta en tipos propios.** Precisión decimal arbitraria; fichero único de ~6 KB, sin dependencias, MIT, API estable desde 2014. No obliga a fijar escalas: se guarda exactamente lo que dice el bróker.
2. **`bigint` con escalas fijas.** Cero dependencias, pero escalas fijadas para siempre y reescalado/redondeo manual en cada multiplicación y división: mucha superficie de error en el código más crítico.
3. **`decimal.js`.** Más completa, semántica de dígitos significativos (no la de dinero), ~30 KB.

Cómo entra la librería: **vendorizada** (copia en el repo) frente a dependencia npm.

Redondeo: **exacto por dentro y redondeo tardío** frente a redondear por lote y almacenar redondeado.

## Decisión

1. **`big.js` vendorizada** en `packages/domain/vendor/big.js` con su licencia y versión anotadas. El paquete `domain` no tiene dependencias npm en runtime. Actualización manual y documentada; en la práctica, nunca.
2. Solo los tipos `Money`, `Quantity`, `Price` y `FxRate` usan `Big` por dentro. `Money` lleva divisa y rechaza operar entre divisas distintas; la conversión solo existe mediante un `FxRate` con fecha. `Quantity` es adimensional. `Price` es `Money` por unidad.
3. **Exacto por dentro, redondeo tardío.** Lo que viene del bróker se guarda tal cual; los derivados (p. ej. coste unitario en EUR = precio × tipo de cambio) con 10 decimales. Se redondea a céntimos únicamente en la salida fiscal (**half-up**, criterio comercial de la AEAT, *verificar con asesor*) y en la presentación. Cuando una venta consume varios lotes, la ganancia se calcula exacta lote a lote, se suma y se redondea **una vez por operación**. Nunca half-even.
4. **Serialización como cadenas** en JSON y en el libro (`"123.4567"`): punto decimal, sin exponente ni separadores. Un `number` en un campo monetario es error de validación al cargar.
5. Guardarraíl: el paquete `domain` no expone `number` en campos monetarios; un test de contrato falla si aparece. La regla de lint se decide en ADR-0008.

## Consecuencias

- `packages/domain/vendor/big.js` + `VENDOR.md` con origen, versión, hash y procedimiento de actualización.
- Módulo `money/` en el dominio con los cuatro tipos y sus tests de propiedades (asociatividad de sumas, `a − a = 0`, redondeo idempotente, rechazo de divisas mezcladas).
- El esquema del libro (ADR-0006) declara todos los campos numéricos como cadenas decimales.

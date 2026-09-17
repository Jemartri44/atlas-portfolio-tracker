# ADR-0016 — Consulta del libro a una fecha con `asOf`

**Estado:** Aceptada (2026-09-18). Origen: revisión de la feature 004, hallazgo bloqueante 1.

## Contexto

La Fase 2 introdujo vistas con `--date` (pesos del núcleo, calculadora de aportación, costes, simulador de traspaso). La fecha seleccionaba el **precio manual** (`manualPrices`) y la **configuración** (`settingsAt`), pero las **cantidades** salían de `state.positions`, es decir, de la foto tras aplicar *todos* los eventos del libro. El resultado eran números incoherentes y silenciosos: sobre el libro sintético, `atlas weights --date 2027-06-30` informaba de cero participaciones de un fondo que en esa fecha sí tenía posición (el cambio de clase que lo vacía es de 2028) y de 28,7 participaciones de otro que en 2027 todavía no existía; la calculadora repartía la aportación sobre esos valores y el simulador movía una cantidad inexistente en la fecha pedida.

El libro ya se proyecta **cronológicamente** en pasadas (`docs/data-schema.md` §7.1, respuesta Q1 de la feature 001): catálogo, configuración, tesis y rectificaciones en orden de fichero, y después las operaciones y el seguimiento ordenados por `(fecha de negocio, posición en el fichero)`. Faltaba poder detener esa segunda pasada en una fecha.

Restricciones que pesan: un solo motor de lotes (la constitución II y ADR-0009 no admiten un segundo FIFO); el libro entero cabe en memoria y proyectar es lineal (ADR-0002); y una referencia registrada tarde debe seguir resolviéndose contra el catálogo completo (§7.1).

## Opciones consideradas

1. **Que cada proyección filtre por fecha por su cuenta.** Ventaja: cambio local. Inconvenientes: duplica la noción de "fecha de negocio" en cada proyección; y las proyecciones derivadas del FIFO (lotes, ganancias, diferimientos) no se pueden filtrar *a posteriori*, porque el resultado depende del orden en que se consumieron los lotes: habría que rehacer el motor.
2. **Una proyección de posiciones a una fecha, aparte.** Ventaja: no toca la proyección principal. Inconveniente: sería un segundo motor que reimplementa compras, ventas, traspasos y las cinco primitivas de eventos corporativos — exactamente lo que el proyecto evita desde ADR-0011.
3. **Cortar la segunda pasada de la proyección en la fecha (`asOf`)** (elegida). Ventaja: un único motor, las proyecciones no cambian, y la foto es **coherente** entre cantidades, lotes, efectivo, ganancias, valoraciones y pendientes. Inconveniente: una consulta a otra fecha exige proyectar otra vez (lineal y en memoria: irrelevante a esta escala).

## Decisión

`ProjectOptions` gana `asOf?: CivilDate`. Con él, la **segunda pasada** ignora por completo los eventos cuya fecha de negocio sea posterior a `asOf`: no entran en lotes, posiciones, efectivo, ganancias, rendimientos, valoraciones, órdenes ni solicitudes pendientes. La **primera pasada no cambia** (catálogo, configuración, tesis y rectificaciones completos, en orden de fichero), de modo que las referencias siguen resolviéndose como manda §7.1 y la configuración se sigue eligiendo con `settingsAt`. Sin `asOf`, el comportamiento es idéntico al anterior.

Las vistas con `--date` proyectan con `asOf` puesto a esa fecha. `asOf` **no** es un viaje en el tiempo del catálogo: un activo dado de alta después de la fecha existe en el catálogo, simplemente no tiene posición ni precio, así que no aparece en las filas.

## Consecuencias

- `docs/data-schema.md` §7 y §7.1 recogen el corte; `loadAndProject` propaga `asOf`; `costSummary`, que recorre eventos crudos, usa la misma función de fecha de negocio que la proyección.
- La Fase 3 lo necesita más que la 2 (patrimonio total, P&L latente y equivalente en índice a una fecha), y la valoración a 31/12 del Modelo 720 se vuelve una consulta directa.
- Lo que se vuelve más difícil: nada del motor; lo que se vuelve más fácil: cualquier vista histórica, incluida la evolución temporal de la web (Ronda 7), que se obtiene proyectando a varias fechas.
- Cualquier vista que acepte una fecha **debe** proyectar con `asOf`: mezclar cantidades del final con precios de una fecha pasada es el defecto que este ADR cierra.

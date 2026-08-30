# ADR-0012 — Eventos de efectivo, base de coste por importe, órdenes pendientes y traspaso de custodia

**Estado:** Aceptada (2026-08-30). Origen: hallazgos 1, 2, 4 y 9 del *challenge* externo del 2026-08-30 (`~/atlas-private/reviews/`).

## Contexto

El esquema v1 no tenía forma de registrar un cambio de divisa dentro de una cuenta ni los intereses de una cuenta remunerada, así que `cashBalances` nunca cuadraría con IBKR ni MyInvestor (ADR-0004 promete conciliar efectivo). La suscripción a un fondo —la operación más frecuente— no cabe en `buy` porque el VL se conoce a D+1/D+2 y la base de coste que la comercializadora informa a Hacienda es el importe pagado, no `quantity × VL`. Un traspaso de custodia (mismo ISIN, otro depositario) no es hecho imponible pero `transfer` lo rechazaba. La huella de idempotencia descartaba fills parciales idénticos.

## Decisión

1. **Nuevos eventos de efectivo:** `fx_exchange` (venta de una divisa y compra de otra dentro de una cuenta, con ambos importes, comisión y los dos tipos BCE) e `interest` (interés bruto con retención española). Ambos alimentan `cashBalances`; `interest` alimenta los rendimientos del capital mobiliario. Los **lotes de divisa** para diferencias de cambio no se proyectan todavía: los eventos ya guardan los datos y la proyección se añadirá en la Fase 5 cuando el asesor confirme el tratamiento, sin cambio de esquema.
2. **`amount` como base de coste.** `buy` y `sell` admiten `amount` (importe bruto liquidado en `currency`). Si está presente, es la base de coste o de transmisión y `unit_price` pasa a ser informativo; si no, se usa `quantity × unit_price`.
3. **Órdenes pendientes** con el patrón de ADR-0010: `order_placed` registra la orden el día que se da (regla 20 cumplida) sin conocer VL ni cantidad; `order_updated` permite cancelarla o anotarla; el `buy`/`sell` posterior referencia `order_id` y la cierra. Proyección `pendingOrders`. Ningún evento de seguimiento toca lotes ni efectivo.
4. **Traspaso de custodia:** `transfer` con `from_asset_id == to_asset_id` se admite para cualquier activo (también no `transferable`), sin `nav`; solo mueve `physicalPositions` entre cuentas. Los lotes fiscales no cambian (son globales, ADR-0009). Completa ADR-0010.
5. **Huella de idempotencia:** incluye el identificador del bróker (`broker_ref`: `tradeID` de IBKR, referencia de MyInvestor) cuando existe; en manual, el `id` propio. Una huella repetida es un **aviso con confirmación**, nunca un rechazo silencioso.

## Consecuencias

- `docs/data-schema.md` §3, §4, §6.2, §7 actualizados; prompt 001 amplía su alcance con estos eventos.
- La CLI y la importación de extractos pueden proponer el cierre de órdenes y traspasos pendientes al detectar la ejecución.

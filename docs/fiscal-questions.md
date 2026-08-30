# Preguntas pendientes para el asesor fiscal

Todo lo que los documentos marcan como *verificar con asesor*, consolidado. Cada respuesta se traduce en un valor de `Settings` o en una nota en `business-rules.md`; ninguna exige cambiar el esquema. Fecha de referencia: agosto de 2026.

| # | Pregunta | Dónde impacta | Valor por defecto mientras tanto |
|---|---|---|---|
| 1 | Para acciones, ETF, ETC y ETP: ¿la fecha de la alteración patrimonial (y del tipo de cambio) es la de **contratación** o la de **liquidación**? ¿Y para participaciones de fondos? | ADR-0013, `fiscal_date_rule` | Cotizados → contratación; fondos → fecha valor |
| 2 | Plazo de la regla de recompra con pérdidas: ¿**un año** para participaciones de fondos y cripto (no admitidos a negociación) y **dos meses** para cotizados? ¿Un traspaso entrante o unas acciones liberadas cuentan como adquisición? | ADR-0013, `wash_sale_window_days` | 365 / 61; traspaso y liberadas no cuentan |
| 3 | Comisiones: ¿se confirma que la de compra se suma al coste de adquisición y la de venta se resta del valor de transmisión? ¿Y las comisiones de custodia o conectividad (`standalone_fee`)? | `business-rules.md` §5.3 | Sí / no deducibles |
| 4 | Diferencias de cambio en efectivo en divisa (comprar USD, gastarlos meses después): ¿ganancia patrimonial al reconvertir? ¿Método de imputación (FIFO por divisa)? | Fase 5, eventos `fx_exchange` | Sin proyección todavía |
| 5 | Tipo de cambio en días sin publicación del BCE: ¿último publicado anterior? | ADR-0013 | Último anterior |
| 6 | Redondeo a céntimos en la declaración: ¿half-up por operación? | ADR-0005 | Half-up, una vez por operación |
| 7 | Escisión (*spin-off*): ¿reparto del coste según proporción publicada por el emisor o según valores de mercado del primer día? | `data-schema.md` §8.5 | Lo que publique el emisor |
| 8 | Fork de cripto: ¿coste de adquisición cero y fecha del fork? | ADR / `business-rules.md` §6 | Cero |
| 9 | Liquidación de una sociedad (valor a cero): ¿cuándo es computable la pérdida? ¿Basta la exclusión de cotización? | `data-schema.md` §8.5 | Solo con disolución |
| 10 | Compensación de pérdidas con rendimientos del capital mobiliario: porcentaje vigente. | `business-rules.md` §5.5 | Pendiente |
| 11 | Modelo 720: valoración a 31/12 de ETC/ETP en bróker extranjero, ¿valor de cotización al cambio BCE del 31/12? ¿Umbral por categoría con efectivo y valores separados? | `valuation`, `business-rules.md` §5.8 | Sí / sí |
| 12 | Retención a cuenta en reembolsos de fondos: ¿siempre 19 % sobre la plusvalía calculada por la comercializadora? ¿Cómo se informa en la declaración? | `sell.withholding` | Registrar lo retenido |

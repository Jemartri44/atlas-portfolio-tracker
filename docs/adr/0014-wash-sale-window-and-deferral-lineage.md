# ADR-0014 — Ventana de recompra de fecha a fecha y diferimiento ligado al linaje de lotes

**Estado:** Aceptada (2026-08-31), con verificación fiscal pendiente (`docs/fiscal-questions.md` #14 y #15). Revisa la decisión 2 de ADR-0013. Origen: hallazgos 1 y 3 del segundo *challenge* externo (2026-08-31).

## Contexto

ADR-0013 parametrizó la ventana de la regla de recompra como `wash_sale_window_days` (61 / 365 días), presentando los días como equivalentes a los "dos meses" y "un año" del art. 33.5 LIRPF. No lo son: la norma se cuenta **de fecha a fecha**. Con aportación mensual el mismo día del mes, una venta el 01-07 y una recompra el 01-09 son 62 días —fuera de la ventana de la app, dentro de la ley—, y el error existe en las dos direcciones y en años bisiestos. Además, `data-schema.md` §8.4 decía que la pérdida diferida se libera "cuando esos lotes se transmitan", pero un `transfer`, un `convert` o un `carve_out` **consumen** los lotes recomprados y crean lotes nuevos que heredan fecha y coste: con la letra anterior, la pérdida no se liberaba nunca o se liberaba en el ejercicio del traspaso, que no es hecho imponible. El campo es un valor de `Settings` serializado en el libro: cambiar su forma tarde exige migración; el motor de la regla llega en la Fase 5.

## Opciones consideradas

**Forma de la ventana**

1. **Mantener días fijos (61/365).** Ventaja: nada que cambiar. Inconveniente: fiscalmente incorrecto en el caso normal de la aportación mensual; corregirlo tras la Fase 5 exige migrar `settings_changed` ya escritos.
2. **`wash_sale_window` con `"2m"`, `"1y"` o `"<n>d"`, contada de fecha a fecha** (elegida). Ventaja: reproduce la norma y sigue siendo configurable por tipo de activo; la forma antigua se acepta al cargar (equivale a `"<n>d"`), así que no hay migración. Inconveniente: aritmética de meses naturales (fin de mes) que hay que definir (pregunta #14).

**Pérdida diferida cuyos lotes se consumen sin transmisión**

1. **Se libera al cerrarse el lote original** (traspaso incluido). Inconveniente: declara la pérdida en un ejercicio sin hecho imponible.
2. **No se libera nunca si el lote se traspasó.** Inconveniente: pierde dinero real en el ciclo normal del núcleo (reembolso con pérdida → aportaciones → traspaso).
3. **El diferimiento viaja con los lotes descendientes** (`source_lot_id`; en `carve_out`, repartido por `cost_share`) y se libera cuando **estos** se transmiten (elegida). Ventaja: coherente con que los descendientes heredan antigüedad y coste. Inconveniente: el motor fiscal debe seguir el linaje (ya existe para trazabilidad).

## Decisión

`Settings.wash_sale_window[asset_type]` con valores `"2m"`, `"1y"` o `"<n>d"`, contados de fecha a fecha en meses/años naturales (por defecto `"2m"` cotizados, `"1y"` fondos, monetario y cripto); `wash_sale_window_days` sigue aceptándose como forma antigua. El diferimiento viaja con el linaje de lotes y se libera al transmitirse los descendientes. *Verificar con asesor* (#14, #15).

## Consecuencias

- `docs/data-schema.md` §8.4 y `business-rules.md` §5.4 y §7 actualizados; caso límite nuevo en la constitución VII (v1.4.0).
- La feature 004 (bloque 0) cambia solo `Settings` y su validación; el motor de la ventana y del linaje es de la Fase 5.
- ADR-0013 conserva su nota de revisión; el resto de sus decisiones (fecha fiscal por tipo, sentido de `fx_rate`) siguen vigentes.

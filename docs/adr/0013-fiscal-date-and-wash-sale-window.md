# ADR-0013 — Fecha fiscal y ventana de recompra por tipo de activo; sentido de `fx_rate`

**Estado:** Aceptada con verificación pendiente (2026-08-30). Los valores por defecto se confirman con el asesor fiscal (`docs/fiscal-questions.md`). Origen: hallazgos 5, 6 y 7 del *challenge* externo. *Revisión del challenge 2026-08-31 (hallazgo 1): la ventana se cuenta de fecha a fecha en meses/años naturales, no en días; la forma vigente del parámetro es `wash_sale_window` (`"2m"`/`"1y"`/`"<n>d"`, con `wash_sale_window_days` como forma antigua aceptada), definida en `docs/data-schema.md` §8.4.*

## Contexto

El esquema decía "la fecha valor manda para fiscalidad" de forma global. Para valores cotizados el criterio habitual de la AEAT es la **fecha de contratación** (una venta el 30/12 con liquidación el 02/01 cambia de ejercicio); para fondos, la fecha del reembolso/VL aplicado. La regla de recompra era "dos meses" fija, cuando para participaciones de fondos (no admitidas a negociación) el plazo es de **un año** (art. 33.5.f LIRPF) —es decir, todo el núcleo `equity` y `fixed_income`. Y `fx_rate` se guardaba invertido y redondeado (EUR por divisa) cuando el BCE publica divisa por EUR: no reproducible desde la tabla oficial y con un sesgo de céntimos por operación.

## Decisión

1. **`fiscal_date` derivada por tipo de activo**, parametrizada en `Settings.fiscal_date_rule{}`. Valores por defecto hasta verificación: `stock`, `etc`, `etp`, `crypto` → `trade_date`; `fund`, `money_market` → `value_date`. Toda regla fiscal (ejercicio, antigüedad del lote, tipo de cambio, ventana de recompra) usa `fiscal_date`. `trade_date` y `value_date` se guardan siempre, así que cambiar la regla no exige migración.
2. **Ventana de recompra parametrizada** en `Settings.wash_sale_window_days{}` por tipo de activo. Por defecto: `fund`, `money_market`, `crypto` → 365; `stock`, `etc`, `etp` → 61 (dos meses). Un `transfer` entrante **no** cuenta como adquisición; `scale` (acciones liberadas) y `grant` con coste cero tampoco. *Verificar.*
3. **`fx_rate` = tipo del BCE tal cual** (unidades de `currency` por EUR, todos los decimales publicados). `eur = amount / fx_rate` con la precisión de ADR-0005. Cada evento guarda `fx_rate_date`; en días sin publicación (fines de semana, festivos TARGET) se aplica el último tipo publicado anterior (*verificar*).

## Consecuencias

- La constitución II pasa a decir "tipo de cambio del BCE de la fecha fiscal".
- Casos límite obligatorios: venta el 30/12 con liquidación el 02/01; pérdida en fondo seguida de aportación mensual a los cinco meses.
- Si el asesor corrige un valor por defecto, es un `settings_changed`, no un despliegue.

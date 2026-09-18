# ADR-0013 — Fecha fiscal y ventana de recompra por tipo de activo; sentido de `fx_rate`

**Estado:** Aceptada (2026-08-30). Verificación resuelta el 2026-09-18: los criterios están fijados en `docs/fiscal-questions.md`, con su fundamento y su grado de certeza, por la dirección del proyecto y **sin asesor fiscal**; los de certeza baja quedan marcados allí para revisarlos antes de que muevan cantidades relevantes. Los valores por defecto se confirman con el asesor fiscal (`docs/fiscal-questions.md`). Origen: hallazgos 5, 6 y 7 del *challenge* externo. *La decisión 2 (ventana en días) está revisada por ADR-0014: se cuenta de fecha a fecha, con la forma `wash_sale_window` definida en `docs/data-schema.md` §8.4. La misma decisión 2 está revisada de nuevo el 2026-09-18 en lo relativo al traspaso entrante: ver la nota bajo la decisión.*

## Contexto

El esquema decía "la fecha valor manda para fiscalidad" de forma global. Para valores cotizados el criterio habitual de la AEAT es la **fecha de contratación** (una venta el 30/12 con liquidación el 02/01 cambia de ejercicio); para fondos, la fecha del reembolso/VL aplicado. La regla de recompra era "dos meses" fija, cuando para participaciones de fondos (no admitidas a negociación) el plazo es de **un año** (art. 33.5.f LIRPF) —es decir, todo el núcleo `equity` y `fixed_income`. Y `fx_rate` se guardaba invertido y redondeado (EUR por divisa) cuando el BCE publica divisa por EUR: no reproducible desde la tabla oficial y con un sesgo de céntimos por operación.

## Decisión

1. **`fiscal_date` derivada por tipo de activo**, parametrizada en `Settings.fiscal_date_rule{}`. Valores por defecto hasta verificación: `stock`, `etc`, `etp`, `crypto` → `trade_date`; `fund`, `money_market` → `value_date`. Toda regla fiscal (ejercicio, antigüedad del lote, tipo de cambio, ventana de recompra) usa `fiscal_date`. `trade_date` y `value_date` se guardan siempre, así que cambiar la regla no exige migración.
2. **Ventana de recompra parametrizada** en `Settings.wash_sale_window_days{}` por tipo de activo. Por defecto: `fund`, `money_market`, `crypto` → 365; `stock`, `etc`, `etp` → 61 (dos meses). ~~Un `transfer` entrante **no** cuenta como adquisición~~; `scale` (acciones liberadas) y `grant` con coste cero tampoco. *Verificar.*

   > **Revisión del 2026-09-18.** La parte tachada queda **sustituida**: un `transfer` entrante **sí** cuenta como adquisición, mediante `Settings.wash_sale_transfer_counts` (por defecto `true`). El criterio está en `docs/fiscal-questions.md` #2b y su mecánica en `docs/data-schema.md` §8.4. Motivo: un traspaso es una adquisición de valores homogéneos aunque no tribute en origen (art. 94 LIRPF), y contar difiere la pérdida, que es la lectura prudente; no contarla la deduce antes y es la arriesgada. **Argumento en contra, que conviene conocer:** el mismo art. 94 hace que las participaciones recibidas conserven la fecha de adquisición original, lo que debilita considerarlas una adquisición *en la fecha del traspaso*. Por eso el criterio es configurable y su certeza está declarada como media.
   >
   > Esta contradicción vivió tres semanas entre el ADR y los otros dos documentos, y **el código implementaba el ADR**: el caso central del núcleo no avisaba. La destapó la revisión adversarial de los criterios fiscales del 2026-09-18 y se corrigió en la PR #40. Lección: cuando un criterio nuevo revisa a un ADR anterior, la nota va en el ADR **el mismo día**, no cuando se note.
3. **`fx_rate` = tipo del BCE tal cual** (unidades de `currency` por EUR, todos los decimales publicados). `eur = amount / fx_rate` con la precisión de ADR-0005. Cada evento guarda `fx_rate_date`; en días sin publicación (fines de semana, festivos TARGET) se aplica el último tipo publicado anterior (*verificar*).

## Consecuencias

- La constitución II pasa a decir "tipo de cambio del BCE de la fecha fiscal".
- Casos límite obligatorios: venta el 30/12 con liquidación el 02/01; pérdida en fondo seguida de aportación mensual a los cinco meses.
- Si el asesor corrige un valor por defecto, es un `settings_changed`, no un despliegue.

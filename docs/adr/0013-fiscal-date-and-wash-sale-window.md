# ADR-0013 — Fecha fiscal y ventana de recompra por tipo de activo; sentido de `fx_rate`

**Estado:** Aceptada (2026-08-30). Verificación resuelta el 2026-09-18: los criterios están fijados en `docs/fiscal-questions.md`, con su fundamento y su grado de certeza, por la dirección del proyecto y **sin asesor fiscal**; los de certeza baja quedan marcados allí para revisarlos antes de que muevan cantidades relevantes. Los valores por defecto se confirman con el asesor fiscal (`docs/fiscal-questions.md`). Origen: hallazgos 5, 6 y 7 del *challenge* externo. *La decisión 2 (ventana en días) está revisada por ADR-0014: se cuenta de fecha a fecha, con la forma `wash_sale_window` definida en `docs/data-schema.md` §8.4. La misma decisión 2 está revisada de nuevo el 2026-09-18 en lo relativo al traspaso entrante: ver la nota bajo la decisión.*

## Contexto

El esquema decía "la fecha valor manda para fiscalidad" de forma global. Para valores cotizados el criterio habitual de la AEAT es la **fecha de contratación** (una venta el 30/12 con liquidación el 02/01 cambia de ejercicio); para fondos, la fecha del reembolso/VL aplicado. La regla de recompra era "dos meses" fija, cuando para los valores **no admitidos a negociación** el plazo es de **un año** (art. 33.5 **g)** LIRPF; la **f)** son los dos meses de los admitidos —errata corregida el 2026-09-22, este ADR citaba la f) para el año). Y `fx_rate` se guardaba invertido y redondeado (EUR por divisa) cuando el BCE publica divisa por EUR: no reproducible desde la tabla oficial y con un sesgo de céntimos por operación.

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

---

## Nota del 2026-09-22 (feature 010): los fondos pasan a dos meses

Este ADR daba por hecho que las participaciones de fondos **no** están admitidas a negociación y les asignaba el año de la letra g). La verificación de fuentes de la feature 010 lo desmiente: el **art. 4.9 del RD 1082/2012** dice, para los fondos que garanticen el reembolso diario, que cumplir la obligación de difusión diaria del valor liquidativo «determinará que las participaciones en los correspondientes fondos tengan la consideración de **valores admitidos a cotización a los efectos de aquellas disposiciones que regulen regímenes específicos de inversión**». **La cláusula final acota ese apoyo**: el art. 33.5 f) LIRPF no es obviamente una de esas disposiciones, así que el fundamento reglamentario es discutible por sí solo. Lo que sostiene la decisión son las dos únicas consultas sobre el asunto (**DGT 0011-00** y **DGT V2067-06**), que encajan las participaciones de fondos en la **letra f)**, la de los dos meses. El Manual de ayuda del Modelo 100 de 2025 las incluye expresamente en el supuesto de dos meses.

**`DEFAULT_WASH_SALE_WINDOW.fund` y `.money_market` pasan de `"1y"` a `"2m"`**, con certeza **media** y dirección **agresiva**: el fundamento reglamentario está escrito para fondos españoles de una SGIIC inscrita en la CNMV, y **ninguna fuente resuelve el caso de un UCITS extranjero**, que es lo que se contrata habitualmente. El monetario va con ellos: en este catálogo es un **fondo** monetario, con ISIN, TER y `transferable`, no una letra ni un depósito. Todo ello en el criterio **#2** de `docs/fiscal-questions.md`. La decisión no reemplaza este ADR: cambia un valor por defecto, que es justamente lo que este ADR hizo configurable.

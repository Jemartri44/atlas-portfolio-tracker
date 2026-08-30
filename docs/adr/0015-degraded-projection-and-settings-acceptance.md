# ADR-0015 — Proyección degradada en consultas y aceptación de `settings_changed` que invalida el pasado

**Estado:** Aceptada (2026-08-31). Origen: hallazgo 2 del segundo *challenge* externo (2026-08-31).

## Contexto

Tras la feature 001, toda consulta de la CLI proyecta el libro en modo estricto: un único evento inválido (una edición manual del JSONL, una migración con semántica nueva, un invariante endurecido en el futuro) deja `positions`, `gains` o `export csv` sin respuesta; solo sobreviven `check --deep` y `export jsonl`. Y como `recordEvent` reproyecta el libro completo, un `settings_changed` que cambie `fiscal_date_rule` y reordene cronológicamente un par compra/venta históricos se rechaza entero — exactamente el cambio que ADR-0013 promete resolver "con un `settings_changed`, no un despliegue". Los hechos registrados no cambian con la regla; cambia su interpretación, así que no existe nada que "rectificar antes". La constitución V exige degradar de forma visible, nunca en silencio ni con un sistema mudo.

## Opciones consideradas

1. **Todo estricto (statu quo).** Ventaja: imposible mostrar un dato dudoso. Inconvenientes: la app entera muere por un evento; la promesa de ADR-0013 es incumplible; no hay camino de reparación (para rectificar con `edit`/`delete` hay que poder consultar).
2. **Consultas de solo lectura degradadas (`collectErrors`) con aviso en cabecera; mutaciones estrictas; `settings_changed` registrable con confirmación explícita que lista los eventos que pasan a ser inválidos** (elegida). Ventajas: el libro siempre se puede leer y reparar; el cambio de regla fiscal es posible y deja rastro de sus efectos; el aviso permanente impide normalizar el estado degradado. Inconveniente: una consulta puede mostrar proyecciones parciales — mitigado con la cabecera obligatoria y `atlas check`.
3. **Aceptar cualquier evento que invalide el pasado con confirmación.** Inconveniente: abre la puerta a escribir operaciones incoherentes a sabiendas; solo `settings_changed` tiene la propiedad de "reinterpretar sin cambiar hechos".

## Decisión

Opción 2. `recordEvent` gana `acceptInvalid`, admitido **solo** para `settings_changed`: sin él, rechaza listando los eventos que pasan a ser inválidos (espejo de `reverseEvent` con los dependientes); la CLI exige el flag explícito `--accept-invalid`. Todas las consultas de solo lectura proyectan con `collectErrors: true` y, si hay inválidos, imprimen cabecera de aviso e incluyen `invalid_count` en `--json`. Las demás mutaciones siguen exigiendo un libro válido.

## Consecuencias

- `docs/data-schema.md` §6.1 actualizado; implementación en el bloque 0 de la feature 004.
- La "reparación" de un libro degradado es siempre visible: consultar → `atlas check` → rectificar; ningún comando finge normalidad.
- El motor fiscal (Fase 5) hereda un criterio claro: la configuración vigente reinterpreta el pasado y sus efectos se listan al cambiarla.

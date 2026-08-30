# ADR-0010 — Modelo del traspaso: un hecho contable atómico más eventos de seguimiento

**Estado:** Aceptada (2026-08-30).

## Contexto

Un traspaso entre fondos tarda días: reembolso en origen con una fecha valor, suscripción en destino con otra. Modelarlo como dos hechos contables separados crea un estado intermedio (reembolso sin suscripción) que, si queda huérfano, el FIFO interpretaría como una venta. Pero el usuario quiere **ver en la app cómo va un traspaso** y que la app pueda vigilarlo automáticamente.

## Opciones consideradas

1. Un único evento `transfer` con ambos lados, registrado al completarse. Atómico, pero sin visibilidad del tránsito.
2. Dos eventos contables `transfer_out` / `transfer_in`. Visibilidad, pero estado intermedio peligroso y validación de emparejamiento permanente.
3. **Un único `transfer` contable + eventos de metadatos de seguimiento sin efecto sobre lotes.**

## Decisión

Opción 3.

- `transfer` sigue siendo el **único hecho contable**: lleva los dos lados (`from_*`, `quantity_out`, `nav_out`, `value_date_out`, `to_*`, `quantity_in`, `nav_in`, `value_date_in`) y es lo único que transforma lotes. Es atómico: no puede existir medio traspaso en el libro.
- `transfer_requested` registra la orden (origen, destino, cantidad o importe, fecha de solicitud). `transfer_request_updated` añade etapas: `redeemed` (reembolso ejecutado, con `nav_out` y `value_date_out` si se conocen), `subscribed`, `cancelled`. Ninguno toca lotes.
- El `transfer` final referencia `request_id` y cierra la solicitud. Un `transfer_requested` sin `transfer` es un traspaso **pendiente**, nunca una venta.
- Proyección `pendingTransfers`: solicitudes abiertas con su etapa y días transcurridos.

## Consecuencias

- Vigilancia automática: un trabajo programado avisa si una solicitud lleva abierta más de `transfer_max_days` (configurable); la importación de extractos propone completar el `transfer` cuando detecta la suscripción destino (Ronda 6).
- Simulador de traspaso y vista "en tránsito" se alimentan de `pendingTransfers`.
- Detalle de campos en `data-schema.md` §6.

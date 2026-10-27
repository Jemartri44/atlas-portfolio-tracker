# Preguntas abiertas — 028 Reparto por plataforma y rebalanceo

Cada una lleva lo que se haría **si no se contesta** (siempre lo más reversible). Ninguna bloquea el visto bueno al diseño; las dos primeras cambian lo que se construye.

1. **¿De dónde salen las comisiones?** Hoy no hay ninguna comisión configurada en `Settings`. Por defecto se **leen del libro**: la de la última compra o venta equivalente (mismo activo y cuenta), con su fecha a la vista, y «desconocida» si no hay ninguna. Es recalculable y no inventa nada (constitución I), pero una tarifa por tramos o porcentual se estima mal con un solo dato. La alternativa es un esquema de comisiones por cuenta en `Settings`, que es un campo nuevo en una foto completa (ADR-0018, ADR-0022) y pide decidir el formato antes. *Si no se contesta:* se lee del libro. ¿Las comisiones de MyInvestor e IBKR son fijas, por tramos o un porcentaje?
2. **¿Las comisiones salen del importe del mes o van aparte?** Por defecto van **aparte**: «ingresar» = compras − efectivo que ya hay + comisiones, y se dice. Meterlas dentro obliga a resolver el reparto y las comisiones a la vez, y una comisión desconocida lo falsearía.
3. **¿Aviso de «la comisión se come buena parte» con un umbral?** El dueño pidió no inventar un mínimo, y «buena parte» es un número. Por defecto: cada paso enseña su comisión y su porcentaje sobre el importe y el resumen señala el peor, **sin umbral**. Si quiere uno suyo (por ejemplo, avisar a partir de un 2 %), sería un ajuste nuevo sin valor por defecto; ver la pregunta 1 para su coste.
4. **¿El umbral de la regla 3 también frena los traspasos?** Por defecto sí: sin ningún activo a más de `deviation_threshold_pp` no se propone nada, ni siquiera un traspaso gratis, para no mover por ruido y por el tiempo fuera de mercado. La regla 3 solo habla de vender; si se prefiere, los traspasos pueden ignorar el umbral.
5. **Lejanía en puntos de peso.** «Más lejos de su peso» se mide en puntos porcentuales bajo el objetivo (como el umbral de la regla 3), no en proporción a su objetivo: un satélite del 5 % que está 2 puntos bajo cuenta igual que un fondo del 60 % 2 puntos bajo.
6. **El efectivo que ya hay en la cuenta se descuenta del ingreso** (ADR-0004), pero no se reserva para otra cosa. Si una parte está reservada, el «ingresar» saldrá corto.
7. **Para el plan técnico, no para el dueño.** Hay que confirmar que el motor admite una venta hipotética en una copia del libro, incluida una en divisa extranjera (precio ya en euros). Si no se puede sin tocar criterios fiscales, **se para y se pregunta** antes de seguir.

## Respuestas (dirección, 2026-10-27)

1. Se leen del libro; sin esquema de comisiones en `Settings`.
2. Van aparte del importe del mes.
3. Sin umbral propio: se enseña la comisión y su porcentaje y se señala la mayor.
4. El umbral de la regla 3 frena también los traspasos **dentro del botón**; el simulador de traspaso suelto sigue libre.
5-7. Sin objeciones: valen los valores por defecto.

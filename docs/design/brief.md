# Encargo de diseño de la interfaz de Atlas

> **Estado.** El encargo original (septiembre de 2026) ya se entregó y se implementó; este documento conserva solo lo que sigue valiendo como requisito. El sistema visual resultante está en [`system.md`](system.md) y en `apps/web/src/styles/`. Lo que el diseño de entonces suponía sobre dónde viven los datos (fichero local, navegador) quedó superado por [ADR-0035](../adr/0035-cloud-ledger-single-source.md).

## Qué es la interfaz

Una aplicación **personal** (un único usuario, residente fiscal en España) para gestionar una cartera a 20 años: anotar operaciones hechas a mano, ver cómo va la cartera, repartir la aportación del mes, seguir el cubo especulativo y preparar la Renta. **Nunca ejecuta órdenes.**

**Solo funciona en la nube** (ADR-0035): se entra con Google, el libro se lee de la API y se escribe en ella; no hay copia en el dispositivo y sin conexión no se muestra nada. Eso fija los estados de arranque: sin sesión, cargando, error de red, libro de solo lectura. No hay elección de dónde guardar los datos.

**Tono:** pensar con calma a largo plazo, no *trading*. Sin tickers parpadeando, colores chillones, confeti ni gamificación. Orden, confianza y tranquilidad; nada añadido por añadir.

## Dispositivos

Móvil de referencia 400 × 890 (prioridad principal, uso con una mano), móvil pequeño 360 × 800, tableta 768 × 1024, portátil 1440 × 900 y monitor 2045 × 1141 (aprovechar el ancho con varios bloques lado a lado). Sin desplazamiento horizontal desde 360 hasta 2045 px. Modo claro y oscuro, igual de cuidados.

## Navegación

Una sola navegación a la vez, con cinco destinos: Resumen, Movimientos, Registrar (la acción principal), Cartera y Cubo. Ajustes aparte. En móvil, barra inferior con Registrar al centro. El interruptor del modo privacidad, siempre a un toque.

## Modo privacidad

La aplicación **se abre con él activado**: oculta importes y cantidades (euros, participaciones, precios unitarios) y deja visibles porcentajes, pesos, fechas y nombres. Es el caso principal del diseño, no una variante. La máscara tiene siempre el mismo ancho para no delatar la magnitud, también dentro de las frases de aviso; lo que el usuario teclea en un formulario no se oculta.

## Pantallas

Cada una responde a una pregunta y lo esencial se ve sin desplazarse: **Resumen** (¿cómo va todo y qué tengo que hacer?: patrimonio siempre desglosado en núcleo, cubo y efectivo; avisos; últimos movimientos), **Movimientos** (¿qué hice y cuándo?; nada se borra: «editar» es anular y registrar el bueno), **Registrar** (anotar rápido y sin equivocarse, con vista previa del efecto), **Cartera**, **Cubo** y **Ajustes**.

## Estados que son lo normal

- **Datos parciales:** el precio de un activo faltará a menudo. Se muestra «sin dato» (nunca un cero) y los totales llevan la marca «parcial».
- Libro vacío (bienvenida con los tres primeros pasos), cargando (esqueleto del tamaño final, nada salta), error (qué pasó y qué hacer, sin recargar), libro con problemas (banda permanente), muchos avisos (un único componente de aviso, con la misma acción en todas partes).

## Gráficas

Tres: evolución del patrimonio (tres series, nunca una agregada), reparto frente al objetivo y cubo frente al índice. Rango con botones, sin zoom; donde no hay datos hay un hueco explicado, nunca una recta inventada; el eje no muestra importes en modo privacidad; hay una tabla equivalente.

## Contenido

Todo en español natural, sin identificadores internos. Formato español (`1.234,56 €`), cifras tabulares alineadas a la derecha, fechas `18/09/2026` en tablas. Ganancia y pérdida se distinguen por el signo y la etiqueta, no solo por el color.

## Restricciones técnicas

HTML y CSS planos con variables CSS, sin *framework* de estilos; nada de recursos externos (fuentes, imágenes, iconos remotos); iconos en SVG en línea; objetivos táctiles de al menos 44 px; contraste AA en claro y oscuro; texto de cuerpo de 15-16 px en móvil y nada por debajo de 13 px; sin animaciones decorativas (respetar «reducir movimiento»).

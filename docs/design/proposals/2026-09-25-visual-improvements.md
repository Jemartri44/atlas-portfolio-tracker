# Propuesta de mejoras visuales

> **Estado: Propuesta**, 2026-09-25. No cambia nada de `apps/web`. Es material de entrada para el rediseño que parte de [`brief.md`](../brief.md) y para la próxima revisión de [`system.md`](../system.md); no sustituye a ninguno de los dos. Donde una mejora contradice algo ya aprobado (una decisión D1–D13, una regla del encargo), se dice expresamente en la columna **Decisión**, y la última palabra es de la dirección.
>
> **Maquetas estáticas**: [`mockups/resumen-privacidad.html`](mockups/resumen-privacidad.html) (Resumen con la privacidad activada, en 400 px y a partir de 1.800 px) y [`mockups/indicadores.html`](mockups/indicadores.html) (indicadores pequeños que se leen sin importes, y la paleta de ganancia y pérdida). HTML y CSS sin recursos externos, sin scripts, sin atributos `style` y con los datos inventados de la §9 del encargo.

---

## 0. Cómo se ha hecho

- **La aplicación de verdad**: el *build* de producción de `origin/develop` (`3be2480`), con su CSP, servido con `vite preview`, que ya está en las dependencias de desarrollo.
- **Capturas**: el Chromium que la máquina ya tiene en `~/.cache/ms-playwright/chromium-1234`, conducido por el protocolo DevTools con el `fetch` y el `WebSocket` nativos de Node 22, como en las revisiones de las *features* 006, 007 y 014. **No se ha instalado nada** y el repositorio no gana ningún paquete. El guion vive fuera del repositorio, igual que las capturas (`system.md`: «las capturas de referencia se guardan fuera del repositorio»).
- **Datos sintéticos**: `atlas synth --seed 1`, con 200 eventos, 4 cuentas, 15 activos y ejercicios de 2026 a 2028. El reloj del navegador se fijó en el **20/01/2029** con un guion inyectado por DevTools, fuera de la aplicación, para que se viera la historia entera y no un libro de un mes.
- **Matriz**: 400×890 con densidad ×3 (lo visible sin desplazarse) y la página entera; 2045×1141; claro y oscuro; privacidad activada y desactivada; libro vacío y primer arranque. Son 78 capturas de 13 pantallas. Además se contaron, en el DOM, las máscaras, los porcentajes visibles, el texto por debajo de 13 px y los objetivos táctiles de menos de 44 px.
- **Límites de la medición**:
  - La fuente fue la de Linux (Ubuntu Sans), no Roboto ni Segoe.
  - Los campos de fecha salieron como `mm/dd/yyyy` porque el Chromium sin interfaz usa la configuración regional `en-US`. En el teléfono, con `es-ES`, no pasa.
  - En las capturas de página entera, la barra inferior fija sale a mitad de página: es un efecto de la captura.
- **Referencias del usuario**: `~/personal/atlas/privado/ui-refs/` solo tiene **una** imagen, la de Ghostfolio, y es el contraejemplo. Muestra una barra superior y otra lateral que repiten destinos, un título centrado que ocupa una franja entera, una tabla de una sola fila flotando en blanco y un porcentaje rojo con un icono de oso. **No hay ninguna referencia positiva**: todo lo que sigue se argumenta desde el encargo y desde las capturas.

### Punto de partida

El sistema «papel y tinta» de `system.md` **ya está implantado** y resuelve casi toda la §13 del encargo: una sola navegación, avisos agrupados con cuatro a la vista, bloque «pendiente» sin tono de error, estados vacíos con un único paso, cifras tabulares, máscara con unidad y ningún texto que se lea por debajo de 13 px. La medición lo confirma: todo lo que queda por debajo de 13 px son los puntos de la máscara, que no se leen. Tampoco hay desplazamiento lateral en ninguna pantalla, a 400 ni a 2045. Esta propuesta es **la capa siguiente**: lo que se ve mal **con datos de dos años y la privacidad activada**, que es como se abre la aplicación.

**Presupuesto del bundle, medido en este *build***:

| | Techo | Medido | Margen |
|---|---|---|---|
| Arranque | 75.869 B (74,1 KiB) | 74,1 KiB | **Decenas de bytes** |
| Total | 280.064 B (273,5 KiB) | 273,5 KiB | **Decenas de bytes** |

Los estilos de la aplicación son **una sola hoja de 9,9 KiB gzip que va en el arranque** (`index.css` importa las 16 hojas). Por eso **cualquier regla CSS nueva cuesta bytes del arranque**, y cualquier código nuevo, aunque sea perezoso, cuesta bytes del total. Las cifras de coste de cada mejora son estimaciones razonadas (una regla CSS simple ocupa unos 25–40 B gzip; un componente SVG pequeño de Solid, unos 0,3–0,6 KiB), no mediciones.

---

## 1. Lo que conviene conservar

Una sola navegación, con Registrar en el centro. El papel cálido y el único acento de Prusia, que cumple AA en los dos modos. Las filas en dos líneas en el móvil. El bloque «pendiente» neutro. El aviso único con icono por gravedad. Los huecos dibujados en las gráficas en lugar de líneas inventadas. La máscara de ancho fijo con su unidad. El modo oscuro de gris carbón. En las capturas oscuras no hay nada roto: la banda de peligro, el acento claro con texto oscuro y las series se leen bien.

---

## 2. Diagnóstico por pantalla

**Longitud medida** (pantallas de 890 px en el móvil y de 1.141 px en el monitor, libro sintético y privacidad activada):

| Pantalla | Móvil | Monitor | Máscaras | Porcentajes a la vista |
|---|---|---|---|---|
| Resumen | 2,8 | 1,4 | 9 | 11 |
| Movimientos | 2,6 (20 filas) | 1,4 | 20 | 0 |
| Detalle de un movimiento | 1,0 | 1,0 | — | — |
| Registrar (elegir) | 1,2 | 1,0 | — | — |
| Registrar compra | 1,7 | 1,3 | — | — |
| Cartera | 2,7 | 1,2 | 24 | 25 |
| Cubo | 3,5 | 1,7 | 20 | 7 |
| Ajustes | 2,4 | 1,1 | 0 | 0 |
| Configuración | 1,8 | 1,1 | — | — |
| Verificación | 2,1 | 1,1 | — | — |
| Declaración | 4,2 | 2,4 | 11 | 0 |

### Hallazgos transversales

- **T1. Muchas tarjetas se quedan en muros de «•••• €» con la privacidad activada.** Es el estado por defecto y hoy es el que peor informa. En el Cubo hay 20 máscaras y solo 7 porcentajes; *Presupuesto y control*, *Tesis frente al índice* y la *Aportación del mes* de la Cartera se quedan sin nada legible. El encargo pide que el estado con privacidad sea «el que más bonito tiene que quedar», y casi todas esas cifras tienen una forma en porcentaje que no delata la magnitud (M1).
- **T2. La jerarquía del primer pantallazo no sigue la importancia.** Ver el Resumen, abajo.
- **T3. En el monitor el diseño es correcto pero no aprovecha el sitio.** El cuerpo baja a 15 px desde 1.024 px y no vuelve a subir. La gráfica mide 240 px de alto en una tarjeta de 1.540 px de ancho, una proporción de 6,4:1 que aplana cualquier tendencia. A 2045×1141, la gráfica de evolución empieza por debajo del pliegue.
- **T4. Ganancia, pérdida y peligro.** La pérdida (`#a2392b`) y el peligro (`#9e2f27`) son el mismo rojo: ΔE 2,1 en OKLab con visión normal. Eso contradice «el rojo solo aparece ante un problema de verdad». Además, ganancia y pérdida se separan poco con deuteranopía: ΔE 6,3 en claro, que es un aviso, y **4,2 en oscuro, que no pasa**. El signo salva el significado, pero el color no aporta nada a quien tiene daltonismo (M6).
- **T5. Las clases de activo, comparadas todas con todas.** Renta variable y cripto fallan en los dos modos: ΔE 2,0 con protanopía en claro, 2,9 con deuteranopía en oscuro y 11 con visión normal. Pasan en pares adyacentes, que es como se validaron para la barra apilada, donde no van juntas. Mientras cada marca lleve su nombre no es un defecto, pero **ninguna gráfica nueva debe poner esas dos series juntas sin etiqueta directa**.

### Por pantalla

**Primer arranque.**
- *Jerarquía* clara, con una tarjeta y un botón principal.
- *Defecto*: el botón «Importar desde la carpeta de la consola» se parte en dos líneas dentro de sus 44 px a 400 px de ancho, y el texto toca los bordes. Lo mismo pasa en Ajustes.
- *En el monitor*: la tarjeta flota en un lienzo casi vacío, lo que es aceptable en una elección.

**Resumen.**
- *Jerarquía*: en enero, el primer pantallazo del móvil se lo llevan la tarjeta *Declaración* (un tercio de la pantalla, con un aviso del 720) y un *Patrimonio total* que, con privacidad y precio parcial, es «•••• €» más un bloque «pendiente» de 160 px por **un solo activo** sin precio. El aviso de **perder datos** («nunca se han exportado») aparece a 1,3 pantallas. La regla «el riesgo de perder datos va siempre primero» se cumple dentro de *Atención*, pero no en la pantalla.
- *Densidad*: *Últimos movimientos* enseña cinco valoraciones del mismo día, 31/12/2028: cinco filas que dicen una sola cosa.
- *Gráfica*: con precios anotados a mano, en 7 de 9 fechas falta algo. La cartera principal queda en tres trazos sueltos, y el cubo y el efectivo, aplastados contra el suelo en la escala de la cartera. Leída entera, parece rota aunque sea honesta.
- *Escritorio*: *Declaración* ocupa sola 4 de las 12 columnas en la primera fila y deja 8 vacías; es el «océano de blanco» del contraejemplo.
- *Vacío*: bien resuelto. Primeros pasos con su estado, en fila de cuatro tarjetas en el monitor.
- *Oscuro*: correcto.

**Movimientos.**
- *Densidad*: en el móvil, cada día lleva su cabecera. Con una operación por día, cada evento gasta unos 95 px y 20 movimientos ocupan 2,6 pantallas; en veinte años de libro eso pesa.
- *Escritorio*: la fecha es un enlace subrayado en cada fila, lo que da 20 subrayados en columna, y la columna *Estado* está vacía en todas las filas vigentes.
- *Filtros*: bien, en columna lateral.

**Detalle.**
- Bien resuelto: la frase arriba, los datos en dos columnas y el registro técnico plegado.
- En el móvil queda más de media pantalla vacía bajo la tarjeta, que es aceptable.

**Registrar.**
- *Densidad*: las siete baldosas del día a día miden unos 100 px cada una. El grupo ocupa media pantalla, y «Otros registros» queda en el pliegue.
- *Formulario de compra*: 1,7 pantallas. Las dos fechas, con su pista cada una, suman 230 px.
- Botones y campos a 44 px y a 16 px: correcto.

**Cartera.**
- *Gráfica*: las dos barras apiladas de 12 px (actual y objetivo) comparan bien el primer segmento y mal el resto. En el oro (10 %) y la cripto (5 %) las diferencias son de 2–4 px. Sin embargo, la **desviación**, que es lo que la pantalla tiene que responder, está solo en cifras.
- *Privacidad*: la *Aportación del mes*, que es la pregunta de la pantalla, sale como tres «•••• €» y cinco filas de «•••• €». Solo quedan legibles los «peso tras aportar».
- *Costes*: en el escritorio, una tabla de seis columnas con tres de máscaras.
- *Escritorio*: *Pesos* deja un hueco de 240 px bajo su pie (tarjeta `.is-natural`), que es aceptable.

**Cubo.**
- *Gráfica*: dos puntos al principio y **una banda de «sin precios» que ocupa el 85 % del ancho**. Con la privacidad desactivada, el eje dice «400, 0, −200» sin unidad.
- *Privacidad*: *Presupuesto y control* y *Tesis frente al índice* se quedan en máscaras. Las posiciones dicen «sin dato» en *Peso en el cubo* porque el total es parcial.
- *Densidad*: 3,5 pantallas en el móvil. La regla de parada y la de recogida van en texto corrido con dos etiquetas «no evaluada».

**Ajustes y Configuración.**
- Estructura buena.
- Botones de ancho irregular apilados: «Exportar», «Importar un archivo» y el botón partido en dos líneas.
- El interruptor de privacidad está bien.

**Declaración.**
- 4,2 pantallas en el móvil, con 11 máscaras y ningún porcentaje. Es aceptable en una pantalla que se abre pocas veces al año.
- Lo que falta es **el tiempo**: qué fecha importa y cuándo. Ver la §3.4.

---

## 3. Gráficas para una cartera a 20 años

El encargo fija **tres gráficas y ninguna más** (§7). Esta sección respeta esa regla para las gráficas de series y propone, aparte, **indicadores en línea**: marcas SVG del tamaño de una fila, sin ejes, que acompañan a una cifra. Donde una propuesta supone una cuarta gráfica, se marca como decisión.

### 3.1 Desviación frente a los pesos objetivo

- **Qué falta**: ver la desviación de un vistazo. La barra doble enseña el reparto; la desviación es una **diferencia** y se lee mejor como distancia a una marca.
- **Forma**: una **tira divergente por tipo de activo**. Tiene una pista de ±5 pp, una banda del umbral, la marca del objetivo en el centro y un punto donde está el peso actual, unido al centro por un trazo. El punto se colorea **solo si el dominio emite el aviso** (decisión (c) de `system.md`). Es el `Gauge` que ya existe (D7, 72×12) llevado a ancho completo y a cada fila del móvil. La barra doble se queda arriba como miniatura del reparto. Ver `mockups/indicadores.html`, tarjeta A.
- **Dibujo**: SVG a mano con coordenadas **en porcentaje** (`cx="61%"`) y radios en píxeles. Así el punto no se deforma sin `viewBox` estirado, y no hace falta ningún `style` (CSP).
- **Coste**: unos 0,2 KiB en el total (reutiliza `Gauge`) y unos 60 B de CSS en el arranque.
- **Más adelante, no ahora**: la deriva de la desviación en el tiempo (cuatro líneas alrededor de 0 con la banda del umbral), útil para ver cada cuánto se rebalancea. Se haría con uPlot en el mismo *chunk*, por unos 0,5 KiB. Depende de proyectar pesos en cada fecha, y con precios manuales tendría tantos huecos como la evolución.

### 3.2 Evolución del patrimonio: cartera principal, cubo y efectivo desglosados

- **Qué falta**:
  1. **Una espina que no tenga huecos**: lo **aportado** a la cartera principal (entradas menos salidas de efectivo de sus cuentas, en escalón). Sale solo de los movimientos, no depende de ningún precio y responde a la pregunta a 20 años: «¿cuánto he puesto y cuánto vale?». Con la privacidad activada, la distancia entre las dos líneas se ve sin cifras.
  2. **Una escala por serie**: el cubo (7 %) y el efectivo (6 %) se aplastan en la escala de la cartera principal (87 %).
- **Forma propuesta**: **paneles alineados que comparten el eje de fechas** (*small multiples*). Arriba va la cartera principal con su aportado (132 px en el móvil y unos 300 en el monitor); debajo, dos tiras de 44–64 px, una para el cubo y otra para el efectivo, **cada una con su escala** y rotuladas «escala propia». No es un gráfico de doble eje: son tres gráficas en una pila. Ver `mockups/resumen-privacidad.html`.
- **Descartado**:
  - El área apilada, que daría el total en su borde, pero un solo precio que falte abriría un hueco en todas las capas de encima: con 7 de 9 fechas incompletas no quedaría nada.
  - El anillo.
  - La escala logarítmica: con aportaciones mensuales el crecimiento es casi lineal durante años.
- **El hueco**:
  - *Opción A*: como hoy, cortar la línea y dibujar la banda, que ahora ocupa poco porque la espina cruza por encima.
  - *Opción B*: el **último precio conocido sostenido** en escalón, más apagado y con su antigüedad al pasar por encima. Es lo que pide el principio *fail safe* («último valor conocido con su edad»), no une dos puntos lejanos, y uPlot ya trae `paths.stepped` en el fichero vendorizado.
  - B contradice la letra del encargo §7 y **requiere decisión**.
- **Rango**: con precios mensuales, «1 mes» enseña uno o dos puntos. Proponer «Este año · 1 año · 5 años · Todo». También requiere decisión.
- **Dibujo**: uPlot, tres instancias con `cursor.sync`, que ya está en el fichero vendorizado. En el dominio, una proyección nueva `contributedSeries(book)`, con 100 % de cobertura y su definición en `business-rules.md` (qué cuenta como aportación: ingresos y retiradas de efectivo en cuentas de la cartera principal; los traspasos internos no cuentan).
- **Coste**: arranque 0; total unos +0,8–1,2 KiB (0,4 del dominio en su *chunk*, 0,4 del cableado y 0,1 de CSS).

### 3.3 Rendimiento del cubo frente a su índice

- **Qué sobra**: una gráfica cuyo 85 % es banda de hueco. Una gráfica que no puede dibujarse tiene que dejar su sitio a una frase (el bloque «pendiente» de `system.md` §5.7), no enseñar el andamiaje.
- **Qué falta**:
  1. La gráfica **en porcentaje sobre lo aportado**, el mismo `vs_index_pct` que ya calcula `bucket-stats.ts` pero en cada fecha. Con eso se lee con la privacidad activada, y con el eje, porque un porcentaje no delata la magnitud.
  2. **Por tesis**, una **mancuerna**: el punto de la tesis y el anillo del índice sobre una escala común, y la diferencia en puntos en tinta con su signo. Ver `mockups/indicadores.html`, tarjeta D.
- **Regla del hueco propuesta**: si en el rango elegido el hueco supera la mitad del ancho, el rango salta al último tramo con datos. Si no queda ninguno, la tarjeta enseña el bloque pendiente y ninguna gráfica.
- **Coste**: total unos +0,4 KiB por la serie en porcentaje y +0,4 KiB por las mancuernas. Arranque unos 50 B.

### 3.4 Calendario fiscal

- **Qué falta**: el tiempo fiscal. Las fechas que cuestan dinero si se pasan:
  - el fin de una ventana de recompra;
  - el 31/12, que es la valoración de los modelos 720 y 721;
  - el 31/03, que es su plazo;
  - la campaña de la Renta.
  Hoy están repartidas en frases de avisos.
- **Forma**: una **tira anual** de 12 meses, con la campaña como banda, «hoy» como línea de acento y las fechas como marcas de **forma distinta**: triángulo para una ventana, cuadrado para un plazo y círculo para una valoración. Debajo va la lista con fecha y frase. Todo son fechas, así que se ve entero con la privacidad activada. Ver `mockups/indicadores.html`, tarjeta E.
- **Dónde**: en `/fiscal`, y en su versión corta en la tarjeta *Declaración* durante la campaña.
- **Datos**: las fechas de la campaña y de los modelos ya son `Settings` (feature 010); el fin de una ventana lo calcula el dominio para sus avisos. **Ninguna fecha fiscal escrita en la interfaz.**
- **Coste**: total unos +0,8–1,0 KiB en el *chunk* fiscal, que es perezoso; arranque 0.
- **Decisión**: es una cuarta gráfica frente al encargo §7.

### 3.5 Medidores del cubo

**Tres barras de medida** (tipo *bullet*):

1. Lo aportado frente al tope, con la marca del aviso al 80 %.
2. El resultado sobre lo aportado, con la regla de parada en −30 %.
3. El peso del cubo sobre el patrimonio, con su máximo. Es **la única cifra que junta los dos libros** y va con su filete de acento, como exige la constitución III.

Todo son porcentajes, así que la tarjeta pasa de máscaras a respuestas (`mockups/indicadores.html`, tarjeta C). Coste: total unos +0,3 KiB.

### 3.6 Resumen de costes de las gráficas

| Pieza | Tecnología | Arranque | Total |
|---|---|---|---|
| Tira de desviación (3.1) | SVG a mano, reutiliza `Gauge` | ~60 B | ~0,2 KiB |
| Evolución en paneles + aportado (3.2) | uPlot vendorizado + dominio | ~0 | ~0,8–1,2 KiB |
| Cubo en % + mancuernas (3.3) | uPlot + SVG | ~50 B | ~0,8 KiB |
| Calendario fiscal (3.4) | SVG a mano | 0 | ~0,8–1,0 KiB |
| Medidores del cubo (3.5) | SVG a mano | ~40 B | ~0,3 KiB |

**Ninguna necesita una dependencia nueva**: uPlot ya trae escalones, sincronización de cursores e instancias múltiples, y el resto es SVG a mano.

---

## 4. Mejoras concretas, ordenadas por valor

*Impacto*: cuánto mejora la pregunta de la pantalla para el usuario, en su móvil y con la privacidad activada. *Esfuerzo*: S (horas), M (un día o dos) o L (más). *Bundle*: estimación en gzip, arranque / total.

| # | Mejora | Impacto | Esfuerzo | Bundle | Decisión |
|---|---|---|---|---|---|
| **M1** | **Un porcentaje junto a cada importe oculto.** La aportación como % del mes; en el cubo, % del tope, resultado % sobre lo aportado, tesis frente al índice en pp y peso de cada posición; en las tablas, el % delante de la columna enmascarada | Muy alto: es el estado por defecto | M (vistas; `vs_index_pct` ya existe) | +0,1 / +0,6–0,9 | No: amplía la regla de `system.md` §5.2 («los porcentajes se ven») |
| **M2** | **Primer pantallazo del Resumen por importancia**: el riesgo de perder datos, primero y en una línea; *Declaración* plegada a una fila fuera de la campaña, y su aviso del 720 dentro de *Atención*; «pendiente» en una sola línea cuando falta un solo precio | Alto | S | +0,1 / +0,2 | Sí: `system.md` §7.2 pone *Declaración* primera «cuando haya algo del 720 que hacer» |
| **M3** | **Evolución en paneles alineados con la espina de lo aportado** (§3.2) y más alta en escritorio | Alto: es la gráfica de los 20 años | M–L (proyección de dominio + definición en `business-rules.md`) | 0 / +0,8–1,2 | Sí: encargo §7 y `system.md` §5.15 (una gráfica con tres series); opción B del hueco aparte |
| **M4** | **Paso de escritorio a partir de 1.800 px** (el monitor): cuerpo a 16 px, gráfica de `clamp(15rem, 28vh, 22rem)`, Resumen en 8+4 con la evolución por encima del pliegue y *Declaración* a la derecha, nunca sola en su fila | Alto en escritorio | S | +0,15 / = | Sí: nuevo punto de corte en `system.md` §4.1 |
| **M5** | **Tira de desviación por tipo de activo** (§3.1) en móvil y escritorio; la barra doble queda como miniatura | Alto | S | +0,06 / +0,2 | Menor: extiende D7 |
| **M6** | **Ganancia y pérdida fuera del rojo de peligro y validadas para daltonismo**: `--c-gain` `#0f6b5c` / `#5cc6b0` y `--c-loss` `#b04a12` / `#f2a066` | Medio-alto (accesibilidad y «el rojo solo para problemas») | S (variables + `contrast.test.ts`) | 0 / 0 | Sí: paleta aprobada |
| **M7** | **Cubo frente al índice en porcentaje**, con la regla del hueco (§3.3) | Alto en el Cubo | M | +0,05 / +0,4 | Sí: regla del hueco |
| **M8** | **Movimientos más densos en el móvil**: cabecera por mes y fecha en la fila; valoraciones del mismo día agrupadas en una fila que se despliega, también en *Últimos movimientos*. Unas 1,6 pantallas por cada 20 movimientos, frente a 2,6 | Medio-alto | M | +0,05 / +0,4 | Sí: `system.md` §7.3 («agrupada por día») |
| **M9** | **Tablas con privacidad**: las columnas que solo tendrían máscaras se funden en una «importes ocultos», y los porcentajes pasan delante (Costes, Posiciones abiertas, Tesis) | Medio | S–M | +0,1 / +0,3 | Menor |
| **M10** | **Medidores del cubo y mancuernas de tesis** (§3.3, §3.5) | Medio | S | +0,05 / +0,7 | Menor |
| **M11** | **Registrar compacto**: baldosas de 64 px en tres columnas (las siete en tres filas y «Otros registros» a la vista); en el móvil, campos cortos en pareja (las dos fechas, cantidad y precio) | Medio | S | +0,1 / = | Menor |
| **M12** | **Calendario fiscal** (§3.4) | Medio (estacional, pero evita errores caros) | M | 0 / +0,8–1,0 | Sí: cuarta gráfica frente al encargo §7 |
| **M13** | **Pulido que hoy se ve**: botón partido en dos líneas («Importar desde la carpeta de la consola» → «Importar de la carpeta», o alto automático); eje del cubo con unidad; fecha de Movimientos en tinta y la fila entera como objetivo, sin 20 subrayados; sin sangría en la lista de *Declaración*; columna *Estado* solo cuando alguna fila la usa | Medio | S | +0,05 / +0,05 | No |
| **M14** | **Estilos por pantalla, perezosos** (habilitador, ver abajo) | Libera arranque | M | −2 a −3 / +0,1–0,3 | Sí: estructura de ADR-0023 y `check-bundle.mjs`; probablemente ADR propio |

### M14, un requisito previo

Con el margen del arranque en decenas de bytes, **M2, M4, M5, M9, M11 y M13 no caben sin M14 o sin subir el techo**. Hoy la hoja entera va en el arranque. Las hojas propias de una pantalla (`portfolio`, `movements`, `registrar`, `bucket`, `settings`, `fiscal`, `charts` y `steps`) suman unos 11 KiB gzip sueltas, alrededor del 30 % de la hoja servida. Importadas desde sus rutas, Vite las emite junto al *chunk* de la ruta y las precarga antes de ejecutarlo, lo que libera **unos 2–3 KiB del arranque**. Hay dos riesgos:

- el orden de la cascada, porque `layout.css` va la última a propósito;
- un destello sin estilos si la hoja llega tarde.

Los dos se cubren con la matriz de capturas. **El total no baja** (sube un poco, porque gzip comprime peor por separado), así que **el techo del total tendría que subir de todas formas** (§6).

### Las cinco de más valor

1. **M1**: un porcentaje junto a cada importe oculto, porque el estado por defecto tiene que informar.
2. **M2**: el primer pantallazo del Resumen por importancia, con el riesgo de perder datos primero.
3. **M3**: la evolución en paneles con la espina de lo aportado, que no tiene huecos.
4. **M4**: un paso de escritorio para el monitor de 2045 px.
5. **M5**: la desviación como tira divergente frente al umbral, en cada tipo de activo.

---

## 5. Sistema visual mínimo: lo que cambia sobre `system.md`

`system.md` §3 ya es el sistema, y esta propuesta **no lo sustituye**. Solo añade o corrige lo siguiente.

### 5.1 Color

| Variable | Claro | Oscuro | Uso | Comprobación |
|---|---|---|---|---|
| `--c-gain` (sustituye a `--c-positive`) | `#0f6b5c` | `#5cc6b0` | Ganancia, siempre con «+» | 6,4:1 sobre blanco / 8,0:1 sobre `#1f1f1d` |
| `--c-loss` (sustituye a `--c-negative`) | `#b04a12` | `#f2a066` | Pérdida, siempre con «−» | 5,5:1 / 7,9:1 |
| `--c-series-contrib` (nueva) | `#8a8880` | `#8f8d86` | Espina de lo aportado, discontinua, neutra como el índice | ≥ 3:1 sobre la superficie |

- **ΔE en OKLab ×100** (validador de paleta de la skill de visualización):

  | Par | Hoy | Propuesta |
  |---|---|---|
  | Ganancia/pérdida, peor caso de daltonismo, claro | 6,3 (aviso) | 8,9 (pasa) |
  | Ganancia/pérdida, peor caso de daltonismo, oscuro | 4,2 (no pasa) | 9,9 (pasa) |
  | Pérdida/peligro, visión normal | 2,1 | 7,5 |

- **Coste conocido**: la nueva pérdida se acerca al aviso (`--c-caution`) con protanopía. Es aceptable porque el aviso nunca es una cifra: siempre lleva su triángulo y su frase.
- **Las clases de activo no cambian**, pero se añade una regla: renta variable y cripto no pueden distinguirse solo por el color en ninguna gráfica de líneas (T5). Llevan etiqueta directa o trazo distinto.
- La **desviación** sigue en tinta neutra (`system.md` §6); el color del resultado es solo para **ganancias y pérdidas realizadas o latentes**.

### 5.2 Tipografía

Se mantiene la del sistema, sin fuente alojada. Una fuente alojada abierta (Inter, por ejemplo) costaría unos 25–30 KiB por peso en `woff2`: más que todo el margen del bundle y sin ganancia real frente a Roboto y Segoe UI Variable, que ya tienen cifras tabulares.

**Paso nuevo a partir de 1.800 px**:

| Variable | Hasta 1.799 px | A partir de 1.800 px |
|---|---|---|
| `--text-md` | 15 | **16** |
| `--text-lg` | 17 | **19** |
| `--text-xl` | 26 | **28** |
| `--text-display` | 44 | **48** |
| `--chart-h` | 240 | **`clamp(15rem, 28vh, 22rem)`** |

### 5.3 Espaciado

Rejilla de 4 px sin cambios. A partir de 1.800 px, `--gutter` pasa a 40 y `--grid-gap` a 24. Un contenedor de lectura de 1.840 px aprovecha el monitor (hoy, 1.680 px con unos 215 px de margen por lado).

### 5.4 Tratamiento de las cifras

- **Cifras tabulares** (`font-variant-numeric: tabular-nums`) en toda fila, tabla, eje y tira; la cifra protagonista, proporcional (como hoy).
- **Signo siempre**, con el menos tipográfico «−» (U+2212), nunca el guion. **El cero va sin signo** («0,0 pp»).
- **Unidad pegada a la cifra** con espacio fino: «+1,1 pp», «35 %», «•••• €». Se dice **pp** para una diferencia de pesos y **%** para un peso o un rendimiento; nunca se mezclan en una misma columna.
- **Color solo en resultados** (ganancia y pérdida); nunca en pesos, desviaciones, precios ni saldos. El color **acompaña** al signo, nunca lo sustituye.
- **Daltonismo**: el signo lleva el significado; el color lo refuerza (§5.1); en las gráficas, el trazo (continuo, discontinuo o punteado) y la forma de las marcas (punto frente a anillo, triángulo, cuadrado y círculo en el calendario) lo repiten.
- **Máscara**: cuatro puntos de ancho fijo con la unidad visible, como hoy. **Un porcentaje cerca de cada máscara (M1) es lo que hace legible la pantalla.**

---

## 6. Lo que exige una dependencia nueva o superar el presupuesto

- **Dependencias nuevas: ninguna.** Todo lo propuesto se hace con uPlot vendorizado (escalones, cursores sincronizados, instancias múltiples) y SVG a mano. Queda **descartada** expresamente una fuente alojada (§5.2).
- **Presupuesto de arranque** (margen de decenas de bytes): **M2, M4, M5, M9, M11 y M13 lo superan** con sus reglas CSS, que suman unos +0,5–0,7 KiB, salvo que antes se haga **M14**, que libera unos 2–3 KiB. M6 no cuesta nada.
- **Presupuesto total** (margen de decenas de bytes): **cualquier mejora con código lo supera**. Hechas todas, se calculan unos **+5–6 KiB gzip** (M1 0,9 · M2 0,2 · M3 1,2 · M5 0,2 · M7 0,4 · M8 0,4 · M9 0,3 · M10 0,7 · M12 1,0 · M13 0,05 · M14 0,3). Esto exige que la dirección **suba el techo total**, que hoy es una parada para preguntar, o que elija un subconjunto.
- **Cambios de dominio** (no de dependencias): M3 necesita `contributedSeries` y su definición en `business-rules.md`; M7, `vs_index_pct` por fecha; M12, las fechas de fin de ventana expuestas a la vista. Los tres quedan a 100 % de cobertura dentro de `packages/domain`.

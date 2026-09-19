# Sistema de diseño de Atlas: «papel y tinta»

> **Estado.** Aprobado por la dirección el 2026-09-19, con las decisiones D1–D13 de §8 y la barra de proporción del patrimonio. La especificación de partida es [`brief.md`](brief.md), entero. La referencia visual exacta es el prototipo estático de [`prototype/`](prototype/): HTML y CSS con los datos de ejemplo de la sección 9 del encargo, generados con `node prototype/build.mjs`. Las capturas de referencia se guardan fuera del repositorio.
>
> **Cómo leerlo.** §1 es el diagnóstico de la base anterior y por qué se quitó Pico (ADR-0023). §2 a §5 son el sistema: dirección, variables, maquetación y componentes. §6 es el vocabulario. §7 describe la composición de cada pantalla. §8 recoge las decisiones tomadas. §9 dice dónde vive cada cosa en el código.

---

## 1. Diagnóstico de la base de estilos anterior

### 1.1 Qué había

| Capa | Tamaño | Qué hacía |
|---|---|---|
| `vendor/pico/pico.css` (Pico 2.1.1) | 2.835 líneas, 93 KB, **13,2 KB gzip** | Estilo de todos los elementos HTML: tipografía, botones, campos, `nav`, `details`, `article`, `table`, `dialog`, `[role=switch]`. Tema claro y oscuro con su azul |
| `src/styles/tokens.css` | 159 líneas | Escalas propias, pero los colores de superficie, texto y acento **se derivaban de las variables de Pico** |
| `base.css`, `layout.css`, `components.css` | ~1.800 líneas | Nuestro estilo, y buena parte dedicado a **neutralizar a Pico** |

La hoja servida pesaba 16,3 KB gzip, la mayor parte Pico. Nuestras hojas lo mencionaban 34 veces y tenían 27 declaraciones del tipo `margin-bottom: 0`, `width: auto` o `min-width: 0` solo para deshacer sus valores por defecto. Un test de arquitectura (`SHELL_RULES`) existía únicamente para impedir que volvieran sus defectos en la navegación.

### 1.2 Dónde peleaba Pico con lo nuestro

1. **La navegación convertida en fila flexible.** Pico hace de `<nav>` un `flex` en fila y da márgenes negativos a `nav ul:first-of-type` y a `nav li a`: huecos de 37 px, etiquetas cortadas («sum», «Movim»), destinos solapados y una barra de estado más ancha que el teléfono.
2. **El margen de los botones y de los campos.** `margin-bottom: var(--pico-spacing)` y `width: 100%` en botones, `input` y `select`: cada control en fila necesitaba su propio `margin-bottom: 0; width: auto; min-width: 0`.
3. **El marcador flotante de los desplegables.** `details summary::after` es un chevrón empujado al borde derecho; al sustituirlo por un «▸» de texto, el `<summary>` se quedó en 16 px de alto.
4. **La cabecera gris de las tarjetas.** `article > header` lleva fondo propio y márgenes negativos: la franja gris del primer arranque y de los diálogos.
5. **El interruptor en forma de media luna.** `[role=switch]` es un óvalo de 36×20 cuya bola mide el 100 % de su alto; forzado a 44 px salió la «luna».
6. **Dos azules y un acento que no llegaba al contraste.** En oscuro, `--pico-primary` es `#01aaff`, que con texto blanco da **2,56:1** (el botón «Registrar» de la barra inferior).
7. **La viñeta cuadrada** de cada `li`, que ganaba a lo que el `ul` hereda.
8. **`.secondary` era un botón gris pizarra macizo**, así que «Anular», que es destructivo, pesaba lo mismo que un botón principal.

Pico está pensado para que una página de contenido quede bien sin clases, y una aplicación densa de datos quiere lo contrario en casi todos los elementos: cada elemento nuevo abría otra pelea de especificidad que solo se veía en un navegador.

### 1.3 Decisión

**Se quitó Pico y se escribió una base propia pequeña** (ADR-0023, que sustituye la parte de Pico del ADR-0017). Lo que Pico aportaba de verdad (un *reset*, fuentes del sistema y el estilo de los campos) cabe en unas pocas centenas de líneas propias. La paleta pasa a ser nuestra y comprobada. La hoja pesa menos y desaparece la capa que contradecía a otra.

---

## 2. Dirección visual: «papel y tinta»

**Un cuaderno de cuentas bien llevado.** Fondo de papel cálido, hojas blancas encima, texto en tinta casi negra, líneas finas en lugar de cajas, y **un solo azul, el de Prusia**, reservado para lo que se puede pulsar. El dato manda: las cifras van en su tamaño y peso, y todo lo demás baja un escalón.

- **Calma a largo plazo.** Sin degradados, sin sombras marcadas, sin animaciones y sin verdes ni rojos saturados. El papel cálido cansa menos que el blanco puro en una aplicación que se abre cada día; el oscuro es gris carbón neutro, no negro.
- **Orden.** Una rejilla de 4 px, una escala tipográfica corta y separadores de 1 px. Las cajas son para lo que es una unidad (una tarjeta); dentro, las filas se separan con líneas.
- **Confianza.** El azul de Prusia es la tinta de los libros de contabilidad y de la cartografía, y encaja con *Atlas*. Es serio sin ser corporativo y **cumple AA con su texto en los dos modos** (8,5:1 en claro, 8,2:1 en oscuro).
- **Nada de estética de *trading*.** Ganancias y pérdidas llevan signo y etiqueta, con color apagado. El rojo solo aparece ante un problema de verdad (un aviso crítico, una acción destructiva). «Parcial» y «sin dato» son neutros, porque son lo normal.
- **La privacidad como estado principal.** Con las cifras ocultas la pantalla sigue teniendo estructura: la máscara es discreta (cuatro puntos pequeños y la unidad) y el ojo va a lo que sí se ve: porcentajes, desviaciones, fechas, avisos y la forma de las gráficas.

Tipografía: la del sistema (Segoe UI en Windows, Roboto en Android, SF en Apple), con cifras tabulares en columnas. Ninguna fuente alojada.

---

## 3. Variables de diseño

Todas viven en `apps/web/src/styles/tokens.css`. **Fuera de ese fichero no se escribe ningún color, tamaño, radio ni sombra a mano.** El oscuro sigue la preferencia del sistema y el selector manual (`data-theme`) gana en los dos sentidos.

### 3.1 Color: interfaz

Contraste medido con la fórmula WCAG sobre la superficie en la que se usa cada color.

| Variable | Claro | Oscuro | Uso | Contraste mínimo medido |
|---|---|---|---|---|
| `--c-canvas` | `#f3f2ee` | `#161615` | Fondo de página (papel) | — |
| `--c-surface` | `#ffffff` | `#1f1f1d` | Tarjetas, barras, diálogos | — |
| `--c-raised` | `#ffffff` | `#3a3a36` | Pestaña actual sobre su carril | — |
| `--c-fill` | `#f0efea` | `#2a2a27` | Pozos: bloque «pendiente», esqueleto, carril de pestañas | — |
| `--c-border` | `#e3e1db` | `#30302d` | Separadores de 1 px | — |
| `--c-border-control` | `#8a877f` | `#76746d` | Borde de campos y botón secundario | 3,2:1 sobre el papel, 3,6:1 sobre la tarjeta / 3,5:1 (≥ 3:1, WCAG 1.4.11) |
| `--c-text` | `#1c1b18` | `#edece8` | Texto principal (tinta) | 15,4:1 / 15,3:1 |
| `--c-text-2` | `#54524c` | `#bdbbb4` | Segunda línea, etiquetas | 6,8:1 / 8,6:1 |
| `--c-text-3` | `#66645d` | `#9e9c95` | Meta, leyendas, la máscara | 5,1:1 / 5,2:1 (sobre `--c-fill`) |
| `--c-accent` | `#1f4f7c` | `#8fb6e3` | **El único acento**: enlaces, botón principal, pestaña actual, foco | 7,4:1 / 6,8:1 como texto |
| `--c-on-accent` | `#ffffff` | `#0f1c2c` | Texto sobre el acento | **8,5:1 / 8,2:1** |
| `--c-accent-soft` / `-text` | `#e4ecf5` / `#1f4f7c` | `#223246` / `#a9c8ec` | Indicador de pestaña, privacidad activa, «Propuesta» | 7,1:1 / 7,5:1 |
| `--c-positive` | `#1b6a44` | `#6fc79a` | Ganancia, siempre con «+» | 5,9:1 / 8,1:1 |
| `--c-negative` | `#a2392b` | `#f0917e` | Pérdida, siempre con «−» | 5,9:1 / 7,1:1 |
| `--c-caution` / `-icon` / `-soft` | `#80530a` / `#a8700f` / `#faf0dc` | `#e8b659` / `#d9a441` / `#352a14` | Aviso: «hay que mirarlo» | 5,9:1 / 7,6:1 |
| `--c-danger` / `-soft` / `-border` | `#9e2f27` / `#fbe9e5` / `#e3aca3` | `#f29a8a` / `#3b1f1b` / `#7a3a30` | Problema real; acción destructiva | 6,2:1 / 7,0:1 |
| `--c-on-danger` | `#ffffff` | `#2a0f0b` | Texto del botón destructivo confirmado | 7,3:1 / 8,3:1 |
| `--c-done` | `#1b6a44` | `#6fc79a` | Paso completado | — |

**El color nunca va solo**: ganancia y pérdida llevan signo; los avisos, un icono con forma distinta por gravedad; «parcial», «anulado» y «fuera de umbral» son palabras; la pestaña actual lleva peso y un indicador.

Fuera de la hoja de estilos, la aplicación instalada pinta con la misma paleta: el manifiesto lleva `background_color` `#f3f2ee` (el papel) y `theme_color` `#ffffff` (la barra), y `index.html` declara un `theme-color` por tema (`#ffffff` en claro, `#1f1f1d` en oscuro), para que ni el arranque ni la barra del sistema salgan del azul marino anterior. Un tema forzado en Ajustes pone su color en las dos etiquetas (`shell/theme.ts`), y «Sistema» devuelve a cada una el suyo.

### 3.2 Color: datos

Validados como conjunto (banda de luminosidad, croma mínimo, separación ΔE ≥ 8 para daltonismo, ΔE ≥ 15 en visión normal, ≥ 3:1 sobre la superficie). Todos los controles pasan en los dos modos. El orden es el del dominio y es fijo.

| Variable | Claro | Oscuro | Uso |
|---|---|---|---|
| `--c-class-equity` | `#4166b4` | `#5b8fd6` | Renta variable |
| `--c-class-fixed-income` | `#178a70` | `#2a9f80` | Renta fija |
| `--c-class-gold` | `#b07f1f` | `#b98521` | Oro |
| `--c-class-crypto` | `#8a58a8` | `#a476c8` | Cripto |
| `--c-series-core` | `#4166b4` | `#5b8fd6` | Serie «cartera principal» (continua) |
| `--c-series-bucket` | `#b07f1f` | `#b98521` | Serie «cubo» (discontinua 6-4) |
| `--c-series-cash` | `#178a70` | `#2a9f80` | Serie «efectivo» (punteada 1-5) |
| `--c-series-index` | `#8a8880` | `#8f8d86` | Índice de referencia (gris, discontinua) |
| `--c-chart-grid` / `-axis` | `#ebe9e3` / `#c9c6be` | `#2a2a27` / `#45443f` | Rejilla y base |
| `--c-chart-gap` / `-gap-edge` | `#f3f1ec` / `#d6d3cb` | `#242422` / `#3a3a36` | Banda de hueco sin datos y su borde discontinuo |

El texto nunca lleva el color de una serie: la identidad la pone la marca (línea, muestra) y las etiquetas van en tinta.

### 3.3 Tipografía

Familia: `"Segoe UI Variable Text", "Segoe UI", Roboto, -apple-system, BlinkMacSystemFont, "Ubuntu Sans", "Noto Sans", "Helvetica Neue", Arial, system-ui, sans-serif`.

| Paso | Móvil | Escritorio (≥ 1024) | Uso |
|---|---|---|---|
| `--text-xs` | 13 | 13 | Leyendas, etiquetas de estado, cabeceras de columna, **etiquetas de la barra inferior**. Es el mínimo: nada que se lea va por debajo |
| `--text-sm` | 14 | 14 | Segunda línea de una fila, pistas, meta |
| `--text-md` | 16 | 15 | Cuerpo, primera línea de fila, controles (los campos, siempre a 16 px para que el móvil no haga zoom) |
| `--text-lg` | 18 | 17 | Títulos de tarjeta (`h2`) |
| `--text-xl` | 22 | 26 | Título de pantalla (`h1`) |
| `--text-2xl` | 26 | 28 | La cifra que responde a una tarjeta |
| `--text-display` | 36 | 44 | La única cifra protagonista de la pantalla |

Pesos 400, 500 y 600. Interlineado 1,15 en cifras grandes, 1,3 en filas y títulos, 1,5 en el cuerpo. Cifras tabulares en columnas y filas; la protagonista, proporcional. El euro de la cifra protagonista va a 0,55 em y en `--c-text-3`.

### 3.4 Espaciado

Rejilla de 4 px: `--space-0` 2 · `-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-7` 32 · `-8` 40 · `-9` 48. Margen lateral de página (`--gutter`) 16 / 24 / 32 en móvil, tableta y escritorio; separación entre tarjetas (`--grid-gap`) 12 / 16 / 20; relleno de tarjeta 16 en el móvil y 20×24 en escritorio.

### 3.5 Radios, bordes y elevación

- Radios: `--radius-sm` 6, `-md` 8 (botones, campos), `-lg` 12 (tarjetas, bloques), `-xl` 16 (diálogos), `-pill`.
- Bordes: `--border` 1 px; `--border-strong` 2 px (anillo de foco y paso actual).
- Elevación casi nula a propósito: `--shadow-1` (tarjetas), `--shadow-2` (pestaña actual), `--shadow-3` (diálogo), `--shadow-bar` (barra inferior). En oscuro las tarjetas se separan por el tono de la superficie.

### 3.6 Tamaños y movimiento

`--tap` 44: objetivo táctil mínimo, y alto de botones, campos, desplegables y filas de menú. Iconos de 16, 20 y 24 px. Gráfica de 184 px de alto en el móvil y 240 en escritorio. Ancho máximo de lectura (`--reading-max`) de 40 rem para formularios y prosa. Movimiento: solo el giro del chevrón de un desplegable (120 ms), anulado con «reducir movimiento».

---

## 4. Maquetación por anchos

### 4.1 Puntos de corte

| Ancho | Armazón | Contenido |
|---|---|---|
| < 640 (móvil; el suyo, 400) | Barra de estado arriba y **navegación abajo** | Una columna, margen de 16 |
| 640–1023 (tableta) | Igual | Una columna, margen de 24 |
| 1024–1199 | Igual: una tableta en horizontal sigue con el pulgar abajo | **Rejilla de 12 columnas** |
| 1200–1439 | **Barra superior única**, compacta (sin la palabra *Atlas*, etiqueta corta de privacidad) | Rejilla de 12, máximo de 1.680 px |
| ≥ 1440 (portátil y su monitor, 2045) | Barra superior completa | Rejilla de 12, máximo de 1.680 px centrado |

El armazón y la rejilla tienen puntos de corte distintos a propósito: responden a dónde está el pulgar y a cuánto ancho hay.

### 4.2 El armazón: una sola navegación

Un `<header>` y dentro **un** `<nav>`, **antes que `<main>` en el DOM**. El orden de tabulación sigue el visual: en escritorio, Resumen, Movimientos, Cartera, Cubo y Registrar; en la barra inferior, Registrar va en el centro también en el DOM de su lista. **Nunca hay dos destinos marcados como actuales**: Ajustes no es un destino de la barra y no se marca en ella. Una subpágina (el detalle de un movimiento, su corrección, un formulario de Registrar) marca su sección con `aria-current="page"`, y las páginas de Ajustes y la de cambiar de archivo (`/libro`, con datos abiertos) marcan su botón.

- **Móvil y tableta** (< 1200): el `<header>` es una barra de estado de 52 px pegada arriba, con el origen de los datos a la izquierda y la privacidad y Ajustes a la derecha. El `<nav>` se fija abajo (64 px más la zona segura) como barra de cinco huecos, con **Registrar en el centro**. Cada destino es un icono de 24 px con su etiqueta a 13 px; el actual lleva un indicador en píldora de acento suave y la etiqueta en seminegrita. Registrar es una placa llena del acento con el «+». Por debajo de 380 px se retira el icono decorativo del origen y se estrecha la placa: ninguna palabra desaparece.
- **Escritorio** (≥ 1200): una sola barra de 64 px con la marca, los cuatro destinos **agrupados en un carril** (la pestaña actual en relieve), **Registrar** como botón principal a continuación del grupo y, a la derecha, el origen de los datos, la privacidad y Ajustes.
- **Origen de los datos**, siempre visible: icono + «Navegador» o «Este ordenador» + antigüedad de la exportación, en color de aviso y con su icono si pasa de una semana. Lleva a Ajustes.
- **Privacidad**: un botón con `aria-pressed` y forma de píldora (ojo tachado y «Oculto» o «Importes ocultos» cuando está activa; ojo y «Visible» cuando no). El objetivo táctil es el botón entero.
- **Sin libro abierto** (primer arranque) no se muestra la navegación: nada funciona sin datos. **Con un libro vacío sí**, porque los primeros pasos llevan a Registrar y a Ajustes (D8).
- **Banda de datos con problemas**: franja de `--c-danger-soft` bajo la barra, permanente, con el texto y «Verificar».

### 4.3 La rejilla

Desde 1024 px, 12 columnas con espacio de 20 y clases `span-N`. Las tarjetas de una misma fila se estiran a la misma altura, y lo que cierra una tarjeta (sus desplegables o el enlace «Ver todos») se ancla abajo. La excepción es una tarjeta cuya vecina es mucho más alta (`.is-natural`, *Pesos* y *Aportación* en la Cartera): conserva su altura, porque estirada dejaba un campo en blanco en mitad de la corta.

**Lo que se maqueta por el sitio que tiene, no por el ancho de la pantalla.** A 1024 px una tarjeta de 7 columnas mide menos que un móvil apaisado, y una tabla decidida por la ventana se salía de ella. Por eso la tarjeta es un contenedor (`container: card / inline-size`) y la tabla o sus filas, los datos en dos columnas del detalle y la rejilla de *Costes* se deciden con consultas de contenedor. Cada tabla declara cuánto necesita (`DataTable size`: `sm` desde 30 rem, por defecto desde 44 rem, `lg` desde 49 rem), medido sobre su anchura mínima de contenido. En el móvil todo es una columna en el orden del DOM, que es el orden de lectura. **Los formularios nunca pasan de su ancho de lectura** (`--reading-max`), por ancho que sea la pantalla.

---

## 5. Componentes

La hoja visual es `prototype/componentes.html`.

### 5.1 Tarjeta (`.card`)

Superficie blanca, borde de 1 px, radio 12, sombra mínima. Cabecera (`.card-head`): `h2` a la izquierda y, a la derecha, un dato de contexto (`--text-sm`, `--c-text-3`) o una etiqueta. **Sin franja gris.** Pie (`.card-foot`): fila de 44 px de borde a borde con un enlace, pulsable entera.

### 5.2 Cifra protagonista, proporción y partes (`.hero-figure`, `.shares`, `.parts`)

Una por pantalla. En el móvil, la cifra; debajo, **la barra de proporción** de las tres partes (una barra apilada de 12 px con cortes del color de la superficie) y las tres partes en filas: clave de serie, nombre, **porcentaje del total** e importe. En escritorio es una **banda** a lo ancho: la cifra y la barra a la izquierda y las tres partes en columnas con separador vertical, cada una con su etiqueta, su cifra en `--text-2xl` y su porcentaje. Los porcentajes **se ven con la privacidad activa**: no delatan la magnitud. Con el total parcial no se enseñan ni la barra ni los porcentajes, porque serían proporciones de un total incompleto. Las claves de las partes son las mismas líneas (color y trazo) de la gráfica de evolución.

### 5.3 Fila de lista en dos líneas (`.row`)

Rejilla `[icono] [principal] [cifras]`. En la línea principal van el sujeto a 16 px y, debajo, el tipo y la cuenta a 14 px. Las cifras se alinean a la derecha: el importe (o la cantidad) arriba y, debajo, la fecha o la cantidad con su unidad. El icono es opcional: un círculo de 36 px con el glifo del tipo de movimiento. Las filas miden al menos 60 px, se separan con líneas de 1 px y recortan con puntos suspensivos, dejando el nombre completo en `title`. Una fila anulada va tachada y en `--c-text-3`, con la etiqueta «anulado»; el estado solo aparece si no es el normal.

### 5.4 Tabla (`.table`)

Cuando **la tarjeta** tiene sitio para ella (`.only-wide`, por consulta de contenedor), y si no, las mismas filas en `.row` (`.only-narrow`). Cabecera a 13 px en `--c-text-3`, celdas de 48 px, separadores de 1 px, sin cebra, cifras tabulares a la derecha con los mismos decimales en cada columna, total en `tfoot`.

### 5.5 Etiqueta de estado (`.tag`)

Píldora de 24 px, texto a 13 px y un icono de 14 px. Variantes: **neutra** («◐ parcial», «⊘ anulado», «corrige a otro»), **acento** («Propuesta»), **aviso** («⚠ fuera de umbral»), **peligro** («inválido») y **hecho**. «Parcial» es neutra a propósito. Junto a un título va en la misma línea (`.choice-head`), nunca sangrada debajo.

### 5.6 Aviso: un único componente (`.notice`)

Igual en el Resumen, el Cubo, la Cartera, la Verificación y en cualquier otro sitio. Icono de 20 px con **forma distinta por gravedad**: triángulo (aviso), octógono (crítico) o círculo con «i» (información). El texto va a tamaño de cuerpo, con la cifra clave de un grupo en seminegrita, y la acción en acento con flecha: debajo del texto en el móvil y a la derecha en escritorio. El aviso entero es el enlace. **Solo el crítico lleva fondo.** En lista se separan con líneas, no con cajas. Se enseñan **4 grupos** y el resto va en «Ver N avisos más». La agrupación y el orden (el riesgo de perder datos, primero) los decide `view-models/attention.ts`. Los precios caducados, los tipos de cambio caducados y las desviaciones van **en un solo aviso cada uno**, con los activos nombrados («3 precios con más de 15 días · A, B y C»). Un aviso que una tarjeta ya dice en su sitio no se repite en una lista: en el Cubo, cada aviso que queda va en la tarjeta de la que trata.

### 5.7 «No se puede calcular todavía» (`.pending`)

Nunca con tono de error. Es un pozo en `--c-fill` con un reloj, **una frase** y **una acción** discreta. Va en el sitio del dato, y la tarjeta sigue enseñando lo que sí se sabe. **Sustituye** a una cifra protagonista que sería «sin dato» (el porcentaje del Cubo) y a una barra que estaría vacía (la «Actual» de la Cartera con el total parcial): un hueco del tamaño de una cifra no explica nada.

### 5.8 Estado vacío (`.empty`)

Un glifo en un círculo de 44 px, un título a 18 px, **una frase** y **un botón** con el siguiente paso. El **error** usa la misma anatomía, con el glifo en `--c-danger-soft`, una salida principal, una discreta y el detalle técnico plegado.

### 5.9 Botones (`.btn`)

De 44 px de alto, radio 8, seminegrita e icono opcional de 16.

| Variante | Aspecto | Uso |
|---|---|---|
| principal (`.primary`) | Acento lleno | Una por vista: en el primer arranque con carpeta, «Elegir la carpeta», y el del navegador pasa a secundario |
| secundario (por defecto) | Superficie con contorno `--c-border-control` | Exportar, Corregir |
| discreto (`.quiet`) | Texto en acento, sin caja | «Ver todos», acciones dentro de bloques |
| destructivo (`.danger`) | Contorno y texto de `--c-danger` | «Anular movimiento»: **nunca** con aspecto de principal |
| destructivo confirmado (`.danger.solid`) | `--c-danger` lleno | Solo en el diálogo de confirmación |

### 5.10 Campo con error en línea (`.field`)

Etiqueta a 14 px en seminegrita encima; control de 44 px a 16 px con borde `--c-border-control` y radio 8. Con foco, borde de acento y anillo de 1 px. Con error, `aria-invalid`, borde y anillo de peligro, y **debajo** el mensaje con su icono. La pista va debajo en `--c-text-3`. La unidad va dentro del campo, a su derecha, con la cifra alineada contra ella (`.control.has-unit`): la divisa de un importe, lo que cuenta una cantidad («part.», «acc.»), «%» o «pp»; se lee con el campo (`aria-describedby`) y la etiqueta ya no la repite. Un tipo de cambio o una proporción no llevan unidad. El `select` lleva un chevrón SVG superpuesto y corta una opción larga con puntos suspensivos, nunca a media palabra.

El contorno de un campo tiene **3:1** sobre el papel y sobre la superficie en los dos temas (`--c-border-control`; lo comprueba `test/contrast.test.ts`).

**Privacidad en los campos**: lo que el usuario escribe no se oculta; **lo que la aplicación precarga sí**. Un campo de importe o de cantidad que llega relleno (Corregir, Configuración) se muestra enmascarado mientras no tiene el foco, y enseña su valor al recibirlo. Un valor por defecto de la aplicación (la comisión a 0) no es un dato del usuario y no se enmascara. Qué ha tecleado el usuario lo guarda **el borrador del formulario**, no el campo: en el móvil el efecto sustituye al formulario y, al volver, lo tecleado sigue a la vista.

### 5.11 Desplegable (`.disclosure`)

`<details>` nativo. El `<summary>` es una fila de **44 px**, etiqueta a 14 px en seminegrita y chevrón a la derecha que gira al abrirse. Dentro de una tarjeta es su última fila, de borde a borde. Es el mismo en toda la aplicación.

### 5.12 Selector de rango ligero (`.segmented`)

Botones de texto de 44 px de alto sin caja; el seleccionado lleva una píldora de acento suave (`aria-pressed`). Un rango sin datos queda atenuado, desactivado y con el motivo en `title`. Va en la cabecera de la tarjeta, salvo cuando una cifra protagonista se interpone: entonces va justo encima de la gráfica que cambia.

### 5.13 Fecha de consulta (`.asof`)

Control compacto a la derecha del título de la pantalla: calendario + «Hoy, 18/09/2026», sobre un `<input type="date">` nativo que abre el selector del sistema.

### 5.14 Tira de cifras (`.kpis`)

Tres o cuatro cifras que van juntas: etiqueta a 13 px sobre la cifra a 18 px en seminegrita, con separadores verticales.

### 5.15 Gráficas

- **Evolución** (uPlot): líneas de 2 px con `spanGaps: false`; cada serie se distingue por **color y trazo**. Con la privacidad activa, el eje vertical no lleva cifras. **El hueco se dibuja**: donde a una serie le falta el dato, su línea se corta; donde **no hay ninguna** serie, una banda en `--c-chart-gap` con bordes discontinuos, pintada por un *hook* de dibujo, con «sin precios» solo si cabe entre los bordes. Debajo, **una línea** que lo explica («En 3 de 24 fechas falta algún precio…»), la lista de activos a los que les falta plegada y la tabla equivalente plegada. Un punto aislado se dibuja como marca. En el eje de fechas por meses, el año va entero («feb 2027»): «feb 27» se lee como un día.
- **Reparto frente al objetivo**: dos barras apiladas de 12 px (actual y objetivo) sobre la misma escala, con cortes de 3 px y extremos redondeados; las filas de debajo llevan la muestra de cada tipo.
- **Desviación frente al umbral** (D7): un indicador de 72×12 con la banda ±umbral, la marca del objetivo y un punto que se vuelve color de aviso fuera del umbral. Solo en la tabla de escritorio **activo por activo**: la regla del umbral es por activo, y el punto se colorea con el aviso que emite el dominio, nunca comparando cifras en la interfaz (decisión (c)).

### 5.16 Esqueleto de carga (`.skel`)

Bloques en `--c-fill`, de radio 6, **sin brillo animado**, con la forma y el alto de lo que llega.

### 5.17 Diálogo

`<dialog>` nativo, radio 16, `--shadow-3`. Lleva título, una frase, la lista de lo que depende y un aviso si afecta a un ejercicio fiscal ya declarado. Las acciones son «Cancelar» (secundario) y la confirmación destructiva. En el móvil van a lo ancho y apiladas.

### 5.18 Primeros pasos (`.steps`)

Lista numerada con el estado de cada paso: **hecho** (círculo lleno con ✓), **actual** (anillo de acento y botón principal) y **pendiente** (anillo fino y chevrón). Arriba, «1 de 4» y una barra de cuatro segmentos. En escritorio, cuatro tarjetas en fila.

---

## 6. Contenido y vocabulario

- **«Núcleo» pasa a «Cartera»** en toda la interfaz, y la ruta `/nucleo` redirige a `/cartera` (D9).
- **«Libro» deja de significar tres cosas** en la web (la CLI no cambia):
  - la lista de movimientos → **«Movimientos»**;
  - el sitio donde se guardan los datos → **«tus datos»** o **«el archivo de datos»**;
  - la cartera a la que pertenece una cuenta → **«Cartera principal»** o **«Cubo»**.
- **Máscara de privacidad**: siempre los mismos cuatro puntos, que miden siempre lo mismo, sin caja más ancha que ellos (su holgura desplazaba la máscara de una cifra protagonista), más la unidad, que sigue visible: «•••• €», «•••• part.», «•••• USD». Dentro de una frase se enmascara igual, y con su unidad («sigue teniendo •••• títulos de X»).
- **Nada de números de regla** ni de vocabulario interno: las reglas vienen del plan personal del usuario y la aplicación no puede depender de que las recuerde. Se dicen en llano, con el umbral configurado: «Regla de parada: dejar de aportar al cubo si la pérdida acumulada pasa del 30 % de lo aportado».
- **Porcentajes enteros sin decimales** («objetivo 55 %», «suman 100 %»); los que no lo son, con los que digan algo.
- **La desviación va en tinta neutra**: decir que está fuera del objetivo es cosa del indicador y del aviso, no del color de la cifra.
- Euros con «€», otras divisas con su código; fechas 18/09/2026 en tablas y avisos, y 18 de septiembre de 2026 en encabezados; ningún identificador interno a la vista.
- La cifra protagonista del Resumen va **sin céntimos** (D10); las filas y tablas, con dos decimales.

---

## 7. Composición de cada pantalla

### 7.1 Primer arranque: «¿Dónde guardamos tus datos?»

Marca y título; una frase («Atlas funciona en este dispositivo: sin servidor, sin cuenta, sin subir nada a ningún sitio.»). Con carpeta disponible (Chrome o Edge en el ordenador), dos tarjetas de opción lado a lado (6+6), centradas con un máximo de 960 px, porque es una elección y no una pantalla de datos: «Una carpeta de tu ordenador» con «Recomendado» junto al título y **el único botón principal**, y «El almacenamiento del navegador», con su botón secundario, el aviso de exportar e «Importar un archivo». Sin carpeta (el móvil, Firefox, Safari), una sola tarjeta, la del navegador con su botón principal, y **una línea** debajo que dice dónde se puede usar la carpeta: media pantalla de teléfono para una opción que el teléfono no puede usar era ruido. Reconectar es una sola tarjeta con «Reconectar» y «Elegir otra carpeta». Sin navegación (D8).

### 7.2 Resumen

- **Móvil**: título y fecha larga. Después, *Patrimonio total* (cifra, barra de proporción, tres partes con porcentaje e importe, y el desglose plegado); *Atención* (4 grupos y «Ver N avisos más»); *Últimos movimientos* (5 filas **cortadas por la fecha consultada**, con el pie «Ver todos los movimientos»); y *Evolución del patrimonio* (rango, gráfica, leyenda, línea del hueco y datos plegados).
- **Escritorio**: la banda de patrimonio a lo ancho (12); debajo, *Atención* (7) y *Últimos movimientos* (5); y *Evolución* a lo ancho (12).
- **Parcial**: «◐ parcial» junto a la cifra, sin barra ni porcentajes, y un bloque *pendiente* con la acción de registrar valoraciones.
- **Vacío**: los primeros pasos con su estado (cuenta, activo, pesos objetivo y primera compra), visibles hasta la primera compra (D4). En escritorio, cuatro tarjetas en fila.

### 7.3 Movimientos y detalle

- **Lista, móvil**: búsqueda a lo ancho y «Filtros · N» plegado, con las etiquetas de los filtros activos. La lista va agrupada por día, en filas `.row`, con la cantidad y su unidad; al final, «Cargar más».
- **Lista, escritorio**: desde 1280 px, los filtros siempre visibles en una columna lateral (3) y la tabla (9) (D12); entre 1024 y 1279 la columna no cabe junto a la tabla, y los filtros se pliegan como en el móvil, ocupando la fila entera y con los campos en columnas de un ancho legible. La valoración lleva su cifra marcada como **precio** («precio 104,20 €»), porque junto a importes que cambiaron de manos se leería como dinero movido. El ingreso y la retirada tienen glifos propios, distintos del de una comisión.
- **Detalle**: empieza por **una frase** («Compraste 31,2343 participaciones de Money Market Fund por 3.100,00 € el 03/09/2026 · Fondos indexados»). Después vienen los datos en dos columnas, los movimientos enlazados como filas y el registro técnico plegado. Una venta dice **lo que produjo**: importe obtenido, coste de lo vendido y ganancia o pérdida (de `state.gains`, sin calcular nada en la interfaz). Un evento que vende en varias cuentas (los picos de un contrasplit) enseña **una línea por venta y el resultado total** (`view-models/sale.ts`): la primera venta sola era una cifra fiscal incompleta presentada como completa. Entre operaciones se suman **resultados**, nunca importes ni costes: redondeados uno a uno no restan el total (717,35 − 724,87 = −7,52 frente al −7,51 declarado), y la nota dice que se redondea una vez por operación. El registro técnico guarda los identificadores (`acc_mi`, `ast_world`, el ULID de una orden), el origen del dato y, en una operación toda en euros, la divisa y el tipo 1 con su fecha: nada de eso hace falta para entender el movimiento. Fuera de él, cada cosa se nombra: una orden, por lo que pidió y cuándo. «Corregir» es secundario y «Anular», destructivo.

### 7.4 Registrar y vista previa

- **Elegir tipo**: «Del día a día» en un mosaico de baldosas a un toque, dos columnas en el móvil y cuatro en escritorio; debajo, los grupos restantes plegados. **Ninguna lista de una operación ofrece un activo que una fusión o un cambio de clase convirtió en otro y ya no tiene nada** (la misma regla que los pesos objetivo, `view-models/weighted.ts`), tampoco el simulador de traspaso: no queda nada que comprar, vender, valorar ni traspasar. **La compra y la orden no ofrecen además los dados de baja**, aunque se tengan; la venta y la valoración sí, porque siguen en cartera y necesitan precio.
- **Formulario**: arriba solo lo necesario; lo secundario (referencia del bróker, origen del dato y notas) en «Más datos». Tiene un ancho máximo legible. En escritorio, el efecto aparece **al lado** del formulario al pulsar «Ver el efecto», y el formulario sigue a la vista; tocarlo retira el efecto, que ya no sería el de lo escrito. En el móvil el efecto sustituye al formulario, con «Volver a los datos».
- **Después de escribir**: registrar, corregir o anular lleva **al detalle del movimiento escrito**, con la confirmación y, si toca un ejercicio anterior, el aviso; los dos viajan en la dirección (`?hecho=…&ejercicio=anterior`), así que la recarga que sigue a toda escritura no se los lleva. La página de corregir de un movimiento ya anulado no ofrece el formulario: dice que está anulado y lleva a su corrección.
- **Corregir**: la frase dice «Vas a rectificarlo: en su lugar, …»; el efecto es el de lo que se escribirá, **el original anulado y el corregido en su lugar** (`previewCorrection`, en el dominio, con la misma comprobación que `correctEvent`). Sumar el corregido al original contaba el movimiento dos veces y rechazaba la compra que había cerrado su propia orden.
- **Vista previa**: el resultado de una venta se titula «Resultado que genera» y cada línea dice «Pérdida» o «Ganancia» según su signo. La encabeza **una frase** con lo que se va a registrar («Vas a registrar la compra de 2,5 participaciones de World Index Fund por 300,00 € el 19/09/2026 · Fondos indexados»), sin enmascarar lo que el usuario acaba de teclear y enmascarando lo que vino de sus datos. Después, solo lo que cambia: las posiciones, el **efectivo** de cada cuenta y divisa que se mueve, antes y después (`EventPreview.cash`, del dominio), con «en negativo» si el saldo acaba por debajo de cero, y los lotes que se mueven, el nuevo primero; y una línea con lo que no cambia.

### 7.5 Cartera

- **Móvil**: título con la fecha de consulta a su derecha. Primero, *Pesos frente al objetivo*: las barras, una fila por tipo en dos líneas y el total. Al pie de *Pesos* van «Ver activo por activo» y «Simular un traspaso entre fondos» (D6). Después, *Aportación del mes*, con la etiqueta «Propuesta», la tira de cifras, el reparto por activo y la nota de propuesta. Por último, *Costes*, con las comisiones sueltas aparte.
- **Escritorio**: *Pesos* (7) y *Aportación* (5), cada una a su altura; *Costes* a lo ancho, con la tabla (8) y las comisiones sueltas al lado (4) cuando la tarjeta mide al menos 64 rem, y una debajo de la otra si no.
- **Parcial**: la barra del objetivo sola (sin la «Actual» vacía), el bloque *pendiente* en lugar de los pesos y los objetivos por tipo. Nada rojo.
- **Precios caducados**: se marcan en su fila, con el reloj del aviso y la antigüedad al pasar por encima; el aviso agrupado vive en *Atención* y la Cartera no lo repite debajo. El TER medio va en una línea propia, con su nombre. Un activo con objetivo y sin nada en cartera dice «sin posición», nunca «0,00 €»; los costes no listan un fondo fusionado que no pagó comisiones.

### 7.6 Cubo

*Frente al índice* abre con la cifra protagonista: el resultado del cubo frente al mismo dinero en el índice **en porcentaje sobre lo aportado** (`BucketStats.vs_index_pct`), que se ve con la privacidad activa; el importe va debajo, enmascarado. Si alguna tesis no se puede comparar, el total es parcial y no hay porcentaje: en su sitio va un bloque *pendiente* que dice a cuántas tesis les falta el precio del índice, con la acción de registrar valoraciones. Debajo, la tira de estadísticas (comisiones sobre capital, tasa de acierto, tesis cerradas), el selector de rango **pegado a la gráfica**, la gráfica del cubo frente al índice y el resto de las estadísticas plegado. Después, *Posiciones abiertas* en filas, con la ganancia con signo. Luego, *Presupuesto y control*: el consumo del tope, la regla de parada y la de recogida dichas en llano con su umbral, y el peso del cubo sobre el patrimonio, marcado como la única cifra que suma cubo y cartera. Cierran las tesis y los costes. Si hay tesis abiertas, las cerradas van plegadas («7 tesis cerradas»): son historia y su suma frente al índice encabeza la pantalla. **No hay lista de avisos del cubo**: lo que una tarjeta ya dice no se repite, y lo que queda (un tope superado, una tesis cerrada con posición, el índice sin configurar) va en la tarjeta de la que trata. **Vacío: un único estado vacío.**

### 7.7 Ajustes y Configuración

*Tus datos* (dónde están, exportar, importar, cambiar de archivo y reconectar), *Privacidad y apariencia* y *Verificación*, que agrupa sus hallazgos igual que Atención. La **Configuración** va en grupos plegables, con los pesos objetivo y su total en vivo. Se piden pesos **solo de activos vivos** (`view-models/weighted.ts`): no de uno dado de baja ni de uno que una fusión o un cambio de clase convirtió en otro y ya no tiene nada, aunque el catálogo lo siga dando por activo; uno que aún lleve peso sí sale, para que guardar nunca quite un peso sin verlo. La *Verificación* nombra `atlas backup` solo cuando los datos están en una carpeta del ordenador; en el móvil dice que la copia es exportar y guardar el archivo fuera del dispositivo. Con la privacidad activa **se enmascaran todos sus importes**, incluidos los tramos de la base del ahorro y los umbrales de los modelos 720 y 721: una sola regla. El índice de referencia del cubo no ofrece activos dados de baja. En escritorio, dos columnas de tarjetas, y los formularios nunca pasan de su ancho de lectura.

---

## 8. Decisiones tomadas

Aprobadas por la dirección el 2026-09-19.

| # | Decisión | Matiz de la dirección |
|---|---|---|
| D1 | Quitar Pico y escribir una base propia | ADR-0023, Aceptada |
| D2 | La máscara enseña la unidad | Siempre del mismo ancho |
| D3 | Avisos agrupados, 4 a la vista, perder datos primero | Construye sobre el orden y la agrupación que ya tenía `view-models/attention.ts` |
| D4 | Primeros pasos con su estado | — |
| D5 | La gráfica de evolución, en el Resumen | — |
| D6 | El simulador de traspaso, dentro de *Pesos* | — |
| D7 | Indicador de la desviación frente al umbral | Si queda simple |
| D8 | Sin navegación en el primer arranque | Solo sin libro abierto; con un libro vacío, sí |
| D9 | `/nucleo` pasa a `/cartera` | Con redirección para no romper marcadores |
| D10 | Cifra protagonista sin céntimos | — |
| D11 | Vocabulario de «libro» | En toda la web, de forma coherente; la CLI no cambia |
| D12 | Filtros de Movimientos en una columna lateral en escritorio | — |
| D13 | Barra inferior hasta 1199 px | — |
| — | Barra de proporción del patrimonio | Son porcentajes: se ven con la privacidad activa |

---

## 9. Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| Variables | `apps/web/src/styles/tokens.css` |
| Base y elementos (sustituye a Pico) | `styles/base.css` |
| Controles: botones, campos, desplegable, rango, etiquetas, diálogo | `styles/controls.css` |
| Tarjetas, pie de tarjeta, líneas de panel y de total | `styles/cards.css` |
| Filas en dos líneas y tablas | `styles/lists.css` |
| Avisos, pendiente, vacío, esqueleto | `styles/feedback.css` |
| Gráficas, leyenda, hueco, reparto | `styles/charts.css` |
| Resumen: cifra protagonista, proporción y partes | `styles/summary.css` |
| Primeros pasos | `styles/steps.css` |
| Cartera: tipos de activo, indicador de desviación, tira de cifras, costes | `styles/portfolio.css` |
| Movimientos: filtros, días, detalle | `styles/movements.css` |
| Registrar: baldosas, formulario, barra de acciones, efecto | `styles/registrar.css` |
| Cubo: tesis de una posición, la vista que junta los dos libros | `styles/bucket.css` |
| Ajustes, grupos plegables y primer arranque | `styles/settings.css` |
| Armazón: cabecera, navegación, página y rejilla | `styles/layout.css` |

Cada hoja tiene menos de 250 líneas o explica en su cabecera por qué no. Se conservan `Amount` como única puerta de la privacidad, la doble presentación de `DataTable`, uPlot, el `<dialog>` nativo y la ausencia de estilos en línea (CSP).

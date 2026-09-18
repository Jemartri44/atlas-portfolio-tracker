# Encargo de diseño de la interfaz de Atlas

> **Para quien diseña.** Este documento es todo lo que necesitas: qué es la aplicación, quién la usa, qué pantallas tiene y qué contiene cada una, qué estados hay que diseñar, qué restricciones técnicas tiene que respetar el diseño y qué entregables necesito. Léelo entero antes de empezar.
>
> **Cómo empezar.** No diseñes todo de golpe. Propón primero **dos o tres direcciones visuales distintas** sobre una sola pantalla —el **Resumen**, en móvil y en escritorio, con el modo privacidad activado, que es como se abre la aplicación— para que el usuario elija. Cuando elija una, desarrolla el resto de pantallas en esa dirección.

---

## 1. Qué es Atlas

Una aplicación **personal** para gestionar una cartera de inversión a **20 años**. Tiene **un único usuario**, residente fiscal en España, que invierte cada mes en fondos indexados y en algunos productos cotizados, y que lleva aparte una pequeña cuenta para especular.

La aplicación:

- **anota cada operación** que el usuario hace a mano en su banco o su bróker (compras, ventas, traspasos entre fondos, dividendos, precios);
- le dice **cómo va la cartera** y **cómo repartir la aportación del mes** para acercarse a sus pesos objetivo;
- lleva el **seguimiento de la cuenta de especulación**, con sus apuestas ("tesis") comparadas con lo que habría hecho el índice;
- y más adelante preparará los datos de su **declaración de la Renta**.

**Nunca ejecuta órdenes ni se conecta al banco.** Todo lo que sabe es lo que el usuario le cuenta.

**Funciona sin servidor ni cuenta.** Los datos viven en el dispositivo: en el ordenador, en un fichero del disco del usuario; en el móvil, dentro del navegador. No hay inicio de sesión.

### El tono

Es una herramienta para **pensar con calma a largo plazo**, no una aplicación de *trading*. Nada de tickers parpadeando, rojos y verdes chillones, confeti ni gamificación. Debe transmitir **orden, confianza y tranquilidad**. El usuario la abrirá a diario, a menudo **con una mano, desde el móvil**, para mirar un momento cómo va todo o anotar una operación que acaba de hacer.

El usuario quiere una interfaz **muy pulida**, un estilo **coherente en todas las pantallas** y **nada añadido por añadir**: ni adornos, ni funciones que nadie ha pedido.

---

## 2. Dispositivos y tamaños

| Dispositivo | Tamaño en píxeles CSS | Prioridad |
|---|---|---|
| **Su móvil** (Xiaomi Mi 15) | **400 × 890**, densidad ×3 | **La principal** |
| Móvil pequeño | 360 × 800 | Tiene que funcionar sin desplazamiento lateral |
| Tableta | 768 × 1024 | Tiene que funcionar |
| **Su monitor** | **2045 × 1141** | Alta: la usa también en el ordenador |
| Portátil | 1440 × 900 | Tiene que funcionar |

**En pantalla ancha, el diseño tiene que aprovechar el espacio.** Nada de una columna estrecha flotando en mitad del vacío: en un monitor de 2000 píxeles, el Resumen o la cartera deberían poder mostrar varios bloques lado a lado.

**Modo claro y modo oscuro**, los dos igual de cuidados. Por defecto sigue la preferencia del sistema, y hay un selector manual.

---

## 3. Navegación

- **Una sola navegación, nunca dos a la vez.** Cinco destinos: **Resumen**, **Movimientos**, **Registrar** (la acción principal, destacada), **Cartera** y **Cubo**. Ajustes queda aparte, siempre accesible pero sin protagonismo.
- **En el móvil**: barra inferior al alcance del pulgar, con **Registrar** destacado en el centro. Es la recomendación firme.
- **En escritorio**: propón tú la forma (barra lateral, superior…), con la condición de que sea **una sola** y no duplique nada.
- **Siempre visibles, en algún sitio discreto**:
  - **dónde están los datos** ("Este ordenador · ledger.jsonl" o "Navegador"), y si viven en el navegador, **cuándo se exportaron por última vez**, con un aviso si hace más de una semana;
  - el **interruptor del modo privacidad**, a un toque.

**Qué NO queremos** (esto es de otra aplicación que el usuario enseñó como contraejemplo): una barra superior **y** una lateral que se repiten; un título centrado que se come una franja entera de pantalla; una tabla con una sola fila flotando en un océano de blanco.

---

## 4. El modo privacidad: el estado por defecto

Esto condiciona todo el diseño, así que va antes que las pantallas.

- La aplicación **se abre con el modo privacidad activado**. Oculta **todos los importes y todas las cantidades** (euros, participaciones, acciones, precios unitarios). Deja visibles **porcentajes, pesos, desviaciones, fechas, nombres y textos**, porque son la información útil y no delatan cuánto dinero hay.
- **Como es el estado por defecto, es el que más bonito tiene que quedar.** Diseña las pantallas **con las cifras ocultas** como caso principal, no como variante.
- La máscara **no puede delatar la magnitud**: tiene **siempre el mismo ancho**, sea la cifra de 12 € o de 120.000 €. Hoy es `••••`; puedes proponer otra forma, siempre de ancho fijo y sin desenfoques que se puedan leer.
- Lo que el usuario **está escribiendo** en un formulario no se oculta: lo teclea él.
- Los importes que aparecen **dentro de una frase** de aviso también se ocultan.

---

## 5. Las pantallas

Cada pantalla responde a **una pregunta**. Lo esencial de esa respuesta tiene que verse **sin hacer scroll**.

### 5.1 Primer arranque: dónde guardar los datos

**Pregunta: ¿dónde vive mi libro?** Es lo primero que ve el usuario, y hoy es de lo más feo de la aplicación.

- Explica en una o dos frases que la aplicación funciona en el dispositivo: sin servidor, sin cuenta, sin subir nada a ningún sitio.
- Dos opciones:
  - **Una carpeta de tu ordenador** (recomendada en Chrome y Edge de escritorio): la aplicación lee y escribe un fichero del disco, el mismo que usa la herramienta de línea de comandos.
  - **El almacenamiento del navegador** (la única posible en el móvil, en Firefox y en Safari): los datos viven dentro del navegador, **hay que exportarlos de vez en cuando** porque borrar los datos del sitio los borra, y se pueden **importar** desde un fichero.
- Estado adicional: **"Reconectar"** cuando el navegador ha perdido el permiso sobre la carpeta.

### 5.2 Resumen

**Pregunta: ¿cómo va todo, y hay algo que tenga que hacer?**

1. **Patrimonio total, siempre desglosado** en tres partes: **cartera principal**, **cubo** (la cuenta de especulación) y **efectivo** en las cuentas de inversión. Nunca un número único sin desglosar. Si falta el precio de algún activo, el total lleva una marca de **"parcial"** y dice qué falta.
2. **Atención**: los avisos activos, ordenados por importancia. Cada uno dice **qué pasa** y lleva **a donde se arregla**. Pueden ser bastantes y largos. Si no hay ninguno, se dice con calma: *"Nada que hacer"*.
3. **Últimos movimientos**: los cinco o seis más recientes, con acceso al libro completo.
4. Aquí o en la Cartera, a tu criterio: la **gráfica de evolución del patrimonio** (ver §7).

**Libro vacío** (recién creado): no puede ser un recuadro perdido en la pantalla. Es la bienvenida: explica los tres pasos para empezar (dar de alta la cuenta donde inviertes, dar de alta el primer activo, registrar la primera compra) y lleva a cada uno.

### 5.3 Movimientos

**Pregunta: ¿qué he hecho y cuándo?**

- **Lista** del libro, de lo más reciente a lo más antiguo, con **filtros** (tipo, cuenta, activo, rango de fechas) y **búsqueda**. Veinte años de libro: carga progresiva.
- Cada fila: fecha, tipo, activo y cuenta, importe o cantidad, y estado.
- **Estado de un movimiento**: *vigente*, *anulado* o *corrige a otro*. Nada se borra nunca: "editar" es anular el movimiento y registrar el bueno, y "eliminar" es anularlo, así que un movimiento anulado sigue en la lista, marcado como tal.
- **Detalle**: todos sus datos con nombres legibles, su estado y sus enlaces (la orden que cerró, el traspaso que completó, la tesis a la que pertenece). Acciones: **corregir** y **anular**. Si otros movimientos dependen de él, se enseña la lista antes de dejar hacerlo, y se avisa si afecta a un año fiscal anterior.

### 5.4 Registrar

**Pregunta: acabo de hacer una operación; ¿cómo la anoto rápido y sin equivocarme?**

1. **Elegir el tipo**, agrupado:
   - **Del día a día**: Compra · Venta · Ingreso de efectivo · Retirada de efectivo · Dividendo · Valoración (anotar un precio) · Orden dada
   - **Traspasos entre fondos**: Solicitar un traspaso · Etapa de un traspaso · Traspaso completado
   - **Operaciones corporativas**: Split · Contrasplit · Fusión · Escisión · Fusión de fondos · Cambio de clase · Liquidación de un fondo · Exclusión de cotización
   - **Cubo**: Abrir una tesis · Cerrar una tesis
   - **Catálogo**: Alta de cuenta · Alta de activo

   Lo del día a día tiene que estar a un toque; lo demás puede estar un nivel más abajo.
2. **El formulario**. En el móvil, teclado numérico donde toca, selector de fecha nativo, y **elegir en lugar de escribir** (cuenta, activo). Algunos campos aparecen o desaparecen según otros (por ejemplo, el tipo de cambio solo si la divisa no es el euro).
3. **Vista previa antes de guardar**: el movimiento tal como quedará y **su efecto** (lotes y efectivo antes y después). Es una parte importante: es lo que evita equivocarse.
4. **Aviso de posible duplicado**, que pide confirmación explícita.

### 5.5 Cartera (la cartera principal)

**Pregunta: ¿dónde va el dinero de este mes?**

Cuatro tipos de activo con un peso objetivo: **renta variable**, **renta fija**, **oro** y **cripto**.

- **Selector de fecha**, con "hoy" por defecto: todo se puede consultar tal como estaba cualquier día pasado.
- **Pesos y desviaciones**: peso actual frente a objetivo de cada tipo, la desviación en puntos, y una marca clara cuando pasa el umbral. Se puede desplegar el detalle por activo.
- **Aportación del mes**: el reparto propuesto de la aportación mensual (por ejemplo 600 €) entre los tipos de activo, más la parte que va al cubo como presupuesto. Tiene que quedar claro que **es una propuesta**: las órdenes las da el usuario a mano en su banco.
- **Simulador de traspaso**: cómo quedaría la cartera si traspasara X de un fondo a otro, antes y después.
- **Costes**: comisiones de compra y venta, gastos corrientes anuales de cada fondo (TER) y, **aparte**, las comisiones sueltas como la de custodia.

### 5.6 Cubo (la cuenta de especulación)

**Pregunta: ¿qué tal van mis apuestas?** El cubo **nunca se mezcla con la cartera principal**. Es un presupuesto aparte.

- Selector de fecha, como en la cartera.
- **Posiciones abiertas**: valor, coste, ganancia sin realizar (en euros y en %), peso dentro del cubo, y la tesis a la que pertenece.
- **Tesis frente al índice**: cada apuesta comparada con lo que habría hecho el índice de referencia en el mismo periodo. Más una **gráfica del cubo entero frente al índice** en el tiempo.
- **Estadísticas**: tasa de acierto, duración media, tesis abiertas y cerradas.
- **Presupuesto y control**: cuánto se ha aportado en total frente al tope, qué peso tiene el cubo sobre el patrimonio total (es la **única** vista donde cubo y cartera principal aparecen juntos, y va señalada como tal), y la regla de parada por pérdidas.
- Costes del cubo y avisos del cubo.

### 5.7 Ajustes

- **El libro**: dónde está, exportar, importar, cambiar de libro, reconectar.
- **Privacidad y apariencia**: modo privacidad y tema (claro, oscuro, sistema).
- **Configuración**, en grupos:
  - **Pesos objetivo** por activo, con un total en vivo que tiene que sumar 100.
  - **Umbrales y avisos**: umbral de desviación (puntos), mínimo de un satélite (%), aportación mensual (€), días para que un precio caduque, días máximos de un traspaso, umbrales de los Modelos 720 y 721 (€), correo de avisos.
  - **Cubo**: porcentaje de la aportación que va al cubo, tope de aporte (€), regla de parada (%), peso máximo del cubo (%).
  - **Identidad fiscal**: residencia fiscal.
  - **Fecha fiscal y ventana de recompra por tipo de activo**: una pequeña tabla de siete tipos de activo por dos parámetros.
- **Verificación**: comprobación de integridad del libro y sus hallazgos explicados en lenguaje llano.

---

## 6. Estados que hay que diseñar

No son casos raros: son lo normal en esta aplicación.

- **Datos parciales.** Los precios los anota el usuario a mano, así que **faltará el precio de algún activo muy a menudo**. Lo correcto es mostrar **"sin dato"** (nunca un cero) y marcar los totales como **"parcial"**. Esto **tiene que verse tranquilo y normal, no roto ni alarmante**. El rojo se reserva para problemas de verdad.
- **Libro vacío** y **primer arranque** (ver §5.1 y §5.2).
- **Cargando**: nunca una pantalla en blanco. Un esqueleto del tamaño correcto, y que nada salte de sitio al llegar los datos.
- **Error**: qué ha pasado y qué hacer, en español llano, con una salida sin recargar.
- **Libro con problemas**: si el fichero tiene movimientos inválidos, una banda permanente que lo dice, con enlace a la verificación. Las consultas siguen funcionando; registrar, no.
- **Muchos avisos**: en la sección de atención pueden juntarse seis u ocho.
- **Modo privacidad activado y desactivado.**
- **Claro y oscuro.**

---

## 7. Gráficas

Tres, y ninguna más:

1. **Evolución del patrimonio**, con tres series (cartera principal, cubo, efectivo), nunca una única línea agregada.
2. **Reparto de la cartera frente al objetivo**. Hoy son dos barras apiladas horizontales, actual y objetivo, porque se comparan mejor que un gráfico circular. Puedes proponer otra cosa si se lee mejor en el móvil.
3. **El cubo frente al índice** en el tiempo.

Reglas:

- **Rango con botones** (1M · 1A · 5A · Todo). Nada de pellizcar para hacer zoom.
- **Donde no hay datos, hay un hueco**: la línea se corta. Nunca se unen dos puntos lejanos con una recta como si hubiera información entre ellos. **Diseña cómo se ve y se explica un hueco**, porque con precios anotados a mano habrá muchos.
- Con el modo privacidad activado, **el eje no muestra importes**.
- No depender solo del color para distinguir series, y ofrecer una tabla equivalente para quien no pueda leer la gráfica.

---

## 8. Contenido: cómo se escribe y cómo se muestra

- **Todo en español**, natural, sin jerga técnica y **sin identificadores internos**: se dice "World Index Fund · Fondos indexados", nunca un código.
- **Números con formato español**: `1.234,56 €`. Cifras **tabulares y alineadas a la derecha** en las tablas, con los mismos decimales dentro de una columna. Euros con `€`; otras divisas con su código (`USD`).
- **Fechas**: `18/09/2026` en tablas; `18 de septiembre de 2026` en encabezados.
- **Ganancias y pérdidas**: se distinguen por el **signo** y la etiqueta, además del color.
- **Nombres largos**: hay activos como "Global Bond Index Fund I" en cuentas como "Fondos indexados". En el móvil tienen que caber, partirse con elegancia o recortarse con el nombre entero disponible.
- **Ejemplos de avisos** (así de largos son en la aplicación):
  - *"El libro vive en el navegador y hace 9 días que no lo exportas: si borras los datos del sitio, se pierde."* → **Exportar**
  - *"World Index Fund: el precio es de hace 17 días. Registra una valoración más reciente."* → **Registrar valoración**
  - *"Renta fija está 2,4 puntos por debajo de su objetivo (umbral: 2 puntos)."* → **Ver cartera**
  - *"El traspaso de World Index Fund a Small Cap Index Fund lleva 19 días abierto (máximo: 15)."* → **Ver traspaso**
  - *"Venta con pérdida de World Index Fund con una compra dentro de la ventana de un año: esa pérdida no será computable este ejercicio."* → **Ver movimiento**

---

## 9. Datos de ejemplo (inventados)

Úsalos en las maquetas en vez de texto de relleno: la densidad real es parte del diseño.

**Cuentas**: *Fondos indexados* (MyInvestor), *ETC y ETP* (Interactive Brokers), *Cubo especulativo* (Interactive Brokers).

**Patrimonio total 48.250 €** = cartera principal **42.100 €** + cubo **3.150 €** + efectivo **3.000 €**.

| Tipo de activo | Activos | Valor | Peso actual | Objetivo | Desviación |
|---|---|---|---|---|---|
| Renta variable | World Index Fund, Small Cap Index Fund | 23.600 € | 56,1 % | 55 % | +1,1 pp |
| Renta fija | Global Bond Index Fund, Money Market Fund | 12.400 € | 29,5 % | 30 % | −0,5 pp |
| Oro | Physical Gold ETC | 4.300 € | 10,2 % | 10 % | +0,2 pp |
| Cripto | Bitcoin ETP | 1.800 € | 4,3 % | 5 % | −0,7 pp |

**Aportación del mes, 600 €**: 60 € al cubo (10 %) y 540 € a la cartera: renta fija 190 €, renta variable 170 €, cripto 120 €, oro 60 €.

**Cubo**: Alpha Robotics 1.050 € (+12,4 %), Beta Biotech 820 € (−8,1 %), Gamma Semiconductors 1.280 € (+21,0 %). Tres tesis abiertas, cinco cerradas, acierto del 60 %. Frente al índice: +3,2 puntos. Aportado 2.400 € de un tope de 6.000 €.

**Últimos movimientos**:

| Fecha | Tipo | Activo · cuenta | Importe o cantidad |
|---|---|---|---|
| 12/09/2026 | Compra | World Index Fund · Fondos indexados | 8,4521 part. · 600,00 € |
| 05/09/2026 | Dividendo | Alpha Robotics · Cubo especulativo | 12,40 € |
| 01/09/2026 | Ingreso de efectivo | Fondos indexados | 600,00 € |
| 28/08/2026 | Valoración | Bitcoin ETP · ETC y ETP | 1.800,00 € |
| 15/08/2026 | Venta | Beta Biotech · Cubo especulativo | 20 acc. · 410,00 € |
| 10/08/2026 | Traspaso | World Index Fund → Small Cap Index Fund | 1.200,00 € |

---

## 10. Restricciones técnicas

El diseño se va a implementar a mano con componentes propios. Para que sea implementable tal cual:

- **HTML y CSS planos**, con los valores de diseño como **variables CSS** (colores, tipografía, espaciado, radios). Sin Tailwind ni ningún otro *framework*.
- **Ningún recurso externo**: ni fuentes de Google ni de ningún otro servidor, ni imágenes enlazadas, ni iconos de una librería remota. La aplicación prohíbe cargar nada de fuera por privacidad. **Preferible la tipografía del sistema.** Si propones una fuente concreta, tiene que ser de licencia abierta para poder alojarla nosotros, y justificar lo que aporta.
- **Iconos en SVG en línea**, un juego sencillo y coherente.
- **Gráficas implementables con una librería sencilla de líneas y con barras en SVG.** Nada de 3D ni de tipos exóticos.
- **Objetivos táctiles de al menos 44 píxeles.**
- **Contraste AA** (WCAG) en claro y en oscuro. **El color nunca es el único portador de significado.**
- **Texto de cuerpo de 15-16 px en el móvil**, y nada que haya que leer por debajo de 13 px.
- **Sin animaciones decorativas.** Si hay transiciones, que respeten "reducir movimiento".
- **Sin desplazamiento horizontal en ningún ancho**, desde 360 px hasta 2045 px.

---

## 11. Qué necesito que entregues

1. **Un pequeño sistema de diseño**: las variables (colores en claro y oscuro con su uso semántico —positivo, negativo, aviso, neutro, acento—, escala tipográfica, escala de espaciado, radios, bordes y sombras) y los componentes: botón principal, secundario y discreto; tarjeta; fila de lista; tabla; etiqueta de estado ("parcial", "anulado"…); aviso según gravedad; campo de formulario; interruptor; selector de fecha; botones de rango; estado vacío; esqueleto de carga; navegación en móvil y en escritorio; indicador de dónde están los datos.
2. **Las pantallas, en HTML y CSS**, cada una en móvil (400 px) y en escritorio (1440 px, comprobada también a 2045 px):
   - primer arranque (dónde guardar los datos);
   - Resumen **vacío**;
   - Resumen con datos y **privacidad activada** (la principal) y, solo en móvil, con privacidad desactivada;
   - Resumen con **datos parciales** (faltan precios);
   - Cartera;
   - Cubo;
   - Movimientos: lista y detalle;
   - Registrar: elegir tipo, formulario de compra y su vista previa (en móvil basta);
   - Ajustes (en móvil basta);
   - al menos el Resumen en **claro y en oscuro**.
3. **Notas breves** de cómo se reorganiza cada pantalla entre móvil, tableta y escritorio, y de las interacciones que no se vean en una maqueta estática.

---

## 12. Qué pasará con tu diseño

Se usará como **referencia visual exacta**, no como código que se copia: la aplicación tiene sus propios componentes, su propia forma de ocultar importes y sus propias reglas de cálculo. Se trasladarán tus variables y tus componentes, se reconstruirán las pantallas y se compararán lado a lado con tus maquetas en todos los tamaños de §2. Si algo de tu diseño choca con una restricción de §10, se te dirá y se buscará lo más parecido.

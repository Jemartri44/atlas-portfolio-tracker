# ADR-0017 — Stack de la aplicación web

**Estado:** Aceptada (2026-09-18). Cierra la parte de *stack* de la Ronda 7; el diseño de las pantallas y el flujo de autenticación se deciden aparte. Sustituye las recomendaciones sin verificar que el relevo de dirección arrastraba desde agosto.

## Contexto

La Fase 1 dejó el dominio puro y la CLI; la web (`apps/web`) es una SPA estática servida desde S3 + CloudFront que **reutiliza `@atlas/domain`** para proyectar y simular sin conexión. Las restricciones no son preferencias: sin CDNs ni fuentes remotas ni analítica de terceros (CSP restrictiva); presupuesto de dependencias cerrado con justificación por escrito; supervivencia a 20 años por encima de modernidad; móvil primero; modo privacidad; PWA con el libro cacheado.

Las recomendaciones heredadas (Solid, Pico CSS vendorizada, uPlot vendorizada) nunca se habían verificado. Se comprobaron el 2026-09-18 contra el registro de npm, la API de GitHub y **mediciones propias** de tamaño y compilación.

## Opciones consideradas

**Framework — Solid 1.9.15 frente a Svelte 5.57**

- *Svelte*: comunidad mayor. Inconvenientes medidos: **`svelte-check` 4.7.6 no funciona con TypeScript 7 solo** (exige tener TS 6 y TS 7 instalados y un flag experimental), y el proyecto está en TS 7.0.2; 19 paquetes de runtime frente a 4; 13,17 KB gzip frente a 5,33 KB; dos rupturas mayores en tres años, una de ellas una reescritura del modelo mental (runes); el pegamento reactivo tiene que vivir en ficheros que compila Svelte, no `tsc`. El argumento heredado de que Biome no formatea `.svelte` **ya no vale** (lo hace desde la 2.3/2.4, aún experimental y sin formatear las expresiones del marcado), pero no cambia la conclusión.
- *Solid*: 1.x lleva cinco años sin ruptura; las señales son funciones de TS normales, así que envolver una función pura del dominio es directo; `tsc` 7 compila sus `.tsx` sin herramienta adicional. Inconveniente real: **Solid 2.0 está en RC** y rompe (desaparecen las directivas `use:`, `Index` se integra en `For`, `createEffect` se parte, `onMount` → `onSettled`).

**Estilo y componentes** — Kobalte (primitivos accesibles, +24 paquetes, aún en 0.x tras 3,5 años), Pico CSS (un fichero, cero dependencias, 18 meses sin commits), Tailwind v4 (binario Rust con doce paquetes por plataforma en `optionalDependencies`, fallo documentado de `npm ci` con lockfile de otro sistema operativo y un caso de suplantación maliciosa del scope), colecciones ya estiladas (`solid-ui` **abandonada**: un solo commit en doce meses y de un bot; `shadcn-svelte` viva pero atada a Svelte y Tailwind).

**Gráficas** — uPlot (23 KB, cero dependencias, **no hace anillos ni gestos táctiles**), Chart.js (66 KB, cubre los cuatro tipos, y su plugin de zoom arrastra `hammerjs`, publicado por última vez en 2016), Observable Plot (93 KB, 31 subpaquetes de d3 y **tampoco hace anillos**), ECharts (197 KB, la única con táctil y ARIA de serie).

**Tablas** — TanStack Table (dos dependencias, pero una mayor cada cuatro años con rupturas documentadas) frente a `<table>` nativa con la ordenación y la agrupación en el dominio.

## Decisión

**Solid 1.9.x con la versión fijada**, `@solidjs/router`, **Pico CSS 2.1.1 vendorizada** como base de estilo con tokens propios encima, **uPlot 1.6.32 vendorizada** para las series y las barras, **anillo de reparto escrito a mano en SVG**, **tablas HTML nativas** con la ordenación y la agrupación en `@atlas/domain`, y `vite-plugin-pwa` como dependencia **de desarrollo**. Cinco paquetes de runtime en total (`solid-js` y sus tres transitivas, más el router) y unos 42 KB gzip de runtime servido antes de nuestro código.

**Se empieza sin librería de componentes.** HTML moderno cubre casi todo lo que la app necesita: `<dialog>` (trampa de foco y `Esc` de serie), `<select>` nativo (en móvil da la rueda del sistema, que es mejor que cualquier combobox propio), `<input type="checkbox" role="switch">` para el modo privacidad, `<details>`/`<summary>` para agrupar por clase de activo, `<input list>` con `<datalist>` para buscar un activo. **Kobalte se añadirá solo si una pantalla concreta lo pide**, con su justificación escrita en `docs/dependencies.md` y la versión exacta fijada (en 0.x el *caret* no protege de nada): es mucho más fácil añadir una dependencia justificada que quitar veinticuatro.

Quedan **excluidos por escrito**, para que ningún implementador futuro los proponga: Tailwind v4 (binarios nativos por plataforma, opacos y con fallo documentado en `npm ci`), Observable Plot (pesa cuatro veces más que uPlot, arrastra 31 subpaquetes y tampoco resuelve el anillo), `solid-ui` (abandonada) y TanStack Table (el volumen de esta cartera no justifica su mantenimiento, y ordenar y agrupar es lógica de dominio, que aquí tiene cobertura del 100 %).

## Consecuencias

- `docs/dependencies.md` recoge las cinco dependencias de runtime, las dos vendorizaciones y la lista de exclusiones con su motivo.
- **Prohibido usar directivas `use:`** en todo `apps/web`: es lo único que Solid 2.0 elimina por completo, y evitarlo hoy no cuesta nada. `createEffect` y `onMount` se concentran en unos pocos ficheros de arranque en vez de esparcirse. La migración a Solid 2 será un ADR propio cuando haya versión estable; el dominio no se entera, que es la ventaja de la arquitectura hexagonal.
- Vendorizar Pico y uPlot (ambas MIT, un fichero cada una) hace irrelevante que sus repositorios estén parados o dependan de una sola persona: el código que funciona hoy seguirá funcionando en 2036 porque es nuestro. Se documentan con origen, versión, hash y licencia, como `big.js` (ADR-0005).
- El rango temporal de las gráficas se resuelve con **botones** (1M/1A/5A/Todo), no con gestos: uPlot no trae *pinch-zoom* y, en una aplicación de consulta personal en el móvil, los botones son mejor interfaz que el zoom táctil.
- Trampas conocidas del entorno: Vite 8 migró a Rolldown/Oxc, así que `build.minify: "esbuild"` falla y hay que usar el minificador por defecto (el `esbuild` que `docs/dependencies.md` lista para empaquetar la Lambda es un uso distinto y sigue siendo válido); el *service worker* de la PWA necesita su entrada en `script-src 'self'`; el *dev server* de Vite usa scripts en línea, así que la CSP de desarrollo no puede ser la de producción.

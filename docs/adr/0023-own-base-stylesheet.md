# ADR-0023 — Base de estilos propia en lugar de Pico CSS

**Estado:** Aceptada (2026-09-19), por decisión de la dirección. Sustituye la parte de **Pico CSS** del [ADR-0017](0017-web-stack.md); el resto de aquel ADR (Solid, uPlot, tablas nativas, sin librería de componentes, sin directivas `use:`) sigue en vigor.

## Contexto

El ADR-0017 eligió Pico CSS 2.1.1 vendorizada como base de estilo, con tokens propios encima: un fichero MIT sin dependencias que da buen aspecto al HTML semántico sin clases. Un día después, el usuario vio la aplicación en su monitor y la calificó de la interfaz más fea que había visto; una revisión con más de mil capturas (`docs/design/brief.md`, §13) y el diagnóstico de `docs/design/system.md` (§1) encontraron que buena parte de los defectos visuales nacían de **los valores por defecto de Pico peleando con los nuestros**:

- `nav` convertido en fila flexible, con márgenes negativos en `nav ul` y `nav li a`: huecos de 37 px, etiquetas cortadas y destinos solapados.
- `margin-bottom` y `width: 100%` en botones y campos, que obligaban a deshacerlos en cada control puesto en fila.
- El marcador de `summary::after`, cuyo reemplazo dejó los desplegables en 16 px de alto.
- La cabecera gris de `article > header`.
- `[role=switch]` deformado en «media luna» al darle 44 px.
- Un acento en oscuro (`#01aaff`) que con texto blanco da 2,56:1, y dos azules distintos entre texto y botones.
- La viñeta cuadrada de `li` y un `.secondary` gris macizo que hacía parecer principal una acción destructiva.

Nuestras hojas mencionaban a Pico 34 veces y tenían 27 declaraciones escritas solo para deshacerlo. Un test de arquitectura (`SHELL_RULES`) existía únicamente para que esos defectos no volvieran. Pico pesaba 13,2 KB gzip de los 16,3 KB de la hoja servida.

## Opciones consideradas

1. **Conservar Pico** y seguir neutralizándolo. Sin trabajo inicial, pero hay que redefinir sus variables de color en lugar de derivar de ellas, mantener `SHELL_RULES` y añadir resets para `nav`, `li`, `summary::after`, `article > header`, `[role=switch]` y los márgenes de los controles. Cada elemento nuevo abre otra pelea de especificidad que solo se ve en un navegador.
2. **Otra base de terceros** (otro *framework* CSS sin clases o con utilidades). Cambiaría un conjunto de valores por defecto ajenos por otro, y Tailwind está excluido por el ADR-0017.
3. **Una base propia pequeña.** Un *reset*, los elementos con `:where()` (especificidad cero) y los controles que la aplicación usa: botones, campos, `select`, casilla, fecha, fichero, `details` y `dialog`. Hay que estilar a mano lo que Pico daba gratis, con riesgo de regresiones en los formularios, que se cubre migrando pantalla a pantalla con una matriz de capturas. A cambio, la paleta pasa a ser nuestra y comprobada, y la hoja pesa menos: el prototipo aprobado pesa 7,2 KB gzip minificado.

## Decisión

**Opción 3.** Se retira `apps/web/vendor/pico/`. La base de estilos es propia y vive en `apps/web/src/styles/`: `tokens`, `base`, `controls`, `layout`, `cards`, `feedback`, `charts` y `screens`. Sigue el sistema de diseño de `docs/design/system.md` y su prototipo de referencia (`docs/design/prototype/`). Ningún valor se escribe fuera de `tokens.css`. No se añade ninguna dependencia.

## Consecuencias

- `docs/dependencies.md` deja de listar Pico y lo anota como retirado. La librería de componentes sigue sin existir: HTML nativo sobre la base propia.
- Desaparecen `SHELL_RULES` y el test que exigía el paso tipográfico de 10 px de la barra inferior. Los tests de la navegación comprueban **el estilo aplicado**, no que una declaración exista en la hoja, y el paso tipográfico mínimo es de 13 px.
- El techo del paquete de `scripts/check-bundle.mjs` baja a lo medido sin Pico, más un margen pequeño.
- Cada control nuevo se estila en `controls.css` con las variables del sistema. Si alguna vez hiciera falta un primitivo accesible que el HTML no da, la puerta de Kobalte que dejó el ADR-0017 sigue abierta en los mismos términos.

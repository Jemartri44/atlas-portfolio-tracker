# Investigación previa — feature `006-web-shell`

Todo lo que sigue se ha **comprobado el 2026-09-18** sobre este repositorio y sobre fuentes públicas, no recordado. El *stack* está cerrado por ADR-0017 y no se reabre: lo que aquí se investiga es **cómo** usarlo sin sorpresas, **qué** permite de verdad el navegador y **qué patrón de navegación** se adopta.

## 1. Versiones y compatibilidad del *stack* (registro npm, 2026-09-18)

| Paquete | Última | Lo que importa |
|---|---|---|
| `solid-js` | 1.9.15 | 3 transitivas (`csstype`, `seroval`, `seroval-plugins`): las "4 paquetes" de ADR-0017. Se fija a `1.9.15` exacta (el ADR pide versión fijada) |
| `@solidjs/router` | **1.0.0** | `peerDependencies: solid-js ^1.8.6`; sin dependencias propias, como decía el ADR. La 1.0.0 es posterior al ADR: se fija exacta |
| `vite` | 8.3.0 | **Ya instalada en el repositorio como transitiva de Vitest: 8.2.2.** `vitest@4.1.11` declara `vite: ^6 \|\| ^7 \|\| ^8`, así que declararla en `devDependencies` no rompe `npm ci` |
| `vite-plugin-solid` | 2.11.14 | `peer vite: … ^8.0.0 \|\| ^9.0.0` ✅. Arrastra `@babel/core`, `babel-preset-solid`, `solid-refresh`, `merge-anything`, `vitefu`, `@types/babel__core`. **No está en `docs/dependencies.md`** → Q7 |
| `vite-plugin-pwa` | 1.3.0 | `peer vite: … ^8.0.0` ✅; `workbox-build` y `workbox-window` son dependencias suyas. Ya autorizada por ADR-0017 como dependencia de desarrollo |
| `@picocss/pico` | 2.1.1 | Sin dependencias. `dist.integrity` = `sha512-kIDugA7Ps4U+2BHxiNHmvgPIQDWPDU4IeU6TNRdvXQM1uZX+FibqDQT2xUOnnO2yq/LUHcwnGlu1hvf4KfXnMg==`. Se vendoriza con el procedimiento de `packages/domain/vendor/VENDOR.md` |

**Trampa de Vite 8 confirmada por ADR-0017** y respetada en la configuración: Vite 8 usa Rolldown/Oxc, así que `build.minify: "esbuild"` falla; se usa el minificador por defecto. El `esbuild` de `docs/dependencies.md` es para empaquetar la Lambda (Fase 4) y no entra aquí.

## 2. TypeScript 7 con DOM y JSX: comprobado, no supuesto

El repositorio usa `typescript@7.0.2` (el compilador nativo: `node_modules/typescript/lib/` ya no trae los `lib.*.d.ts`, van dentro del binario). Antes de planificar se comprobó con dos sondas reales:

1. `lib: ["ES2022","DOM","DOM.Iterable"]`, `module: "preserve"`, `moduleResolution: "bundler"`, `jsx: "preserve"`, `strict`: **compila**. `document.querySelector` y `IDBFactory` tipan. Los dos únicos errores en un `.tsx` fueron `TS7026: no interface 'JSX.IntrinsicElements' exists`, que es exactamente lo que aporta `solid-js` (`jsxImportSource: "solid-js"`).
2. `composite: true` **+** `noEmit: true`: `tsc -b` termina en 0 y escribe solo `tsconfig.tsbuildinfo`. Es lo que permite que `apps/web` entre en la solución raíz (`tsc -b`) sin emitir JavaScript que nadie usa, porque el que se publica lo genera Vite.

Consecuencia para el plan: `apps/web/tsconfig.json` es un proyecto compuesto con `noEmit`, referenciado desde el `tsconfig.json` raíz, de modo que `npm run typecheck` y `npm run build` cubren la web sin tocar la configuración de los demás paquetes (que siguen en `module: NodeNext` y `types: ["node"]`).

## 3. Coste real de proyectar (medido sobre el *golden*)

Medido con `packages/domain/dist` compilado, Node 22, portátil del usuario, `tests/fixtures/ledger/synthetic-v1.jsonl` (200 eventos):

| Operación | Tiempo |
|---|---|
| Decodificar y validar las 200 líneas (`decodeLine`) | **4,0 ms** (una vez) |
| `projectLedger(..., { collectErrors: true })`, en frío | **4,6 ms** |
| `projectLedger(..., { collectErrors: true })`, en caliente | **1,24 ms** |
| `projectLedger(..., { asOf })` | **2,3 ms** en frío |
| `netWorth(state, date, settings)` | **1,6 ms** |
| `coreWeights(state, date, settings)` | **0,74 ms** |

Escalado medido por prefijos (50/100/150/200 eventos): 11,3 → 11,7 → 8,2 → **6,2 µs por evento**, es decir **lineal o mejor** (el coste por evento baja al amortizarse el arranque del JIT). Extrapolando: un libro de veinte años con ~5.000 eventos cuesta del orden de **30-60 ms** de decodificación más proyección en este portátil, y el umbral de 100 ms del prompt no se alcanza hasta el orden de **10.000 eventos**. En un teléfono conviene contar con un factor 3-5×, lo que sitúa un libro de diez años en **100-300 ms una sola vez por carga**. Conclusión: no hace falta ninguna optimización, pero sí las dos reglas de diseño que ya pedía el prompt — **una sola proyección base** compartida por todas las pantallas y **memoización por fecha** de las proyecciones con `asOf` —, y volver a medir en el móvil al terminar (tarea de cierre).

## 4. Qué permite de verdad el navegador para el fichero del disco

Fuentes: [MDN `showDirectoryPicker`](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker), [MDN `FileSystemHandle.requestPermission`](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemHandle/requestPermission), [caniuse: File System Access API](https://caniuse.com/native-filesystem-api), [Chrome for Developers: File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access), [MDN `StorageManager.persist`](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist).

| Navegador | `showDirectoryPicker` / `showOpenFilePicker` |
|---|---|
| Chrome / Edge escritorio | **Sí**, desde la 105 (parcial 86-104) |
| Firefox (cualquiera) | **No**, y su postura pública es "harmful": no está previsto |
| Safari escritorio e iOS | **No** (solo el sistema de ficheros privado del origen, OPFS, desde 15.2) |
| **Chrome Android y Samsung Internet** | **No** |

Tres consecuencias que el diseño tiene que asumir, y que confirman ADR-0019 en lugar de contradecirlo:

1. **En el teléfono no hay vía de fichero.** Ninguna. El móvil —el uso diario— va siempre por IndexedDB con importación y exportación. La vía del fichero es del escritorio, y ahí es la preferente.
2. **El permiso no sobrevive al cierre de todas las pestañas del origen.** Textualmente: *"The web app can continue to save changes to the file without prompting until all tabs for its origin are closed. Once a tab is closed, the site loses all access"* y *"you should verify whether the user has granted permission … using `queryPermission()`"*. Los *handles* **sí** son serializables y se guardan en IndexedDB, así que la aplicación recuerda **cuál** era la carpeta; lo que hay que volver a pedir es el permiso, y `requestPermission()` **exige un gesto del usuario** (`SecurityError` sin él). De ahí el botón **"Reconectar"** de la Historia 1, escenario 3: no es una comodidad, es la única forma correcta.
3. **Contexto seguro obligatorio** (`https` o `localhost`) tanto para la File System Access API como para el *service worker*. Hasta la Fase 4 no hay origen `https` propio, así que la vía del fichero y la PWA se prueban en `localhost`, que es contexto seguro.

Para la vía de IndexedDB: `navigator.storage.persist()` es Baseline desde diciembre de 2021 y pide que el navegador **no** desaloje los datos bajo presión de almacenamiento. Se solicita al adoptar IndexedDB y se informa del resultado. No protege de que el usuario borre los datos del sitio, que es exactamente el riesgo que ADR-0019 mitiga con **exportación visible y recordada**: las dos cosas, no una.

## 5. Navegación móvil: qué se adopta y qué se rechaza

Fuentes consultadas: [Material Design — bottom navigation](https://m2.material.io/components/bottom-navigation), [Android — layout and navigation patterns](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns), [Smashing Magazine — golden rules of mobile navigation](https://www.smashingmagazine.com/2016/11/the-golden-rules-of-mobile-navigation-design/), [WCAG 2.5.8 Target Size (Minimum)](https://w3.org/WAI/WCAG21/Understanding/target-size) y la comparativa de tamaños mínimos por plataforma.

Lo que dicen, resumido: una barra inferior sirve para **tres a cinco destinos de importancia equivalente**, con icono **y etiqueta** (no solo icono), el destino activo diferenciado, y es el patrón que cae en la zona del pulgar. WCAG 2.2 exige 24 × 24 px como mínimo (AA); Apple recomienda 44 pt y Material 48 dp, y la práctica recomendada en las tres es **44 px**. El prompt pide 44 px: coincide con la recomendación, no con el mínimo.

**Lo que adoptamos**

- Cuatro destinos de importancia equivalente (Resumen, Movimientos, Núcleo, Cubo) con icono y etiqueta, y la acción **Registrar** destacada en el centro. Es lo que pide el prompt §3.5 y encaja con el patrón: cuatro destinos más **una acción**, que no es un quinto destino.
- 44 px de objetivo táctil en todo control, foco visible, `aria-current` en el destino activo.
- Etiquetas siempre visibles: en una aplicación que se usa una vez al día, un icono sin texto es un acertijo.

**Lo que rechazamos, y por qué**

- **Un cajón lateral ("hamburguesa") en móvil**: esconde la navegación detrás de un toque y queda en la esquina más lejana del pulgar. Con cuatro destinos no hay motivo.
- **Pestañas superiores** además de la barra inferior: es el error del contraejemplo, dos navegaciones que se pisan.
- **Una barra de título fija con el nombre de la pantalla centrado**: gasta una banda entera de una pantalla de 360 px para decir algo que el usuario ya sabe (acaba de pulsar ese destino). El título de cada pantalla es su primer encabezado, alineado a la izquierda, y se va con el *scroll*.
- **Gestos como única vía** (deslizar para cambiar de sección, *pinch-zoom* en las gráficas): no se descubren y no tienen equivalente con teclado. ADR-0017 ya lo decidió para el rango temporal de las gráficas (botones, no gestos).

**El contraejemplo, leído en detalle.** La captura de Ghostfolio que el usuario aporta *a propósito* como ejemplo de lo que no quiere tiene tres defectos y los tres tienen su antídoto escrito en el diseño:

| Defecto observado | Antídoto en esta feature |
|---|---|
| Dos navegaciones simultáneas (superior e inferior) que compiten | **Una sola** `<nav>` con una única lista de destinos, conmutada por CSS entre barra inferior y rail; FR-027 y un test de que solo hay una lista de destinos |
| Un título centrado ocupando una banda completa | Sin banda de título: el `<h1>` es contenido (FR-028) |
| Una pantalla grande con un solo dato útil | Densidad exigida: el primer *scroll* del Resumen lleva total, tres subtotales y el recuento de avisos (SC-001, SC-008) |

**Lo que sí se mira de las aplicaciones de finanzas personales que respetamos** (Actual Budget, Firefly III y su cliente móvil Abacus, y las aplicaciones bancarias): el orden de lectura es *saldo → lo que requiere acción → últimos movimientos*, la acción de registrar está siempre a un toque, las tablas se convierten en tarjetas de dos alturas en móvil, y el detalle de un movimiento es una pantalla propia con URL, no un panel que rompe el botón atrás. Las cuatro cosas están en el diseño. Lo que no se copia: los paneles de métricas decorativas, los carruseles y los saludos personalizados.

## 6. Alternativas de diseño consideradas (y descartadas)

| Decisión | Alternativas | Por qué la elegida |
|---|---|---|
| **Estado**: un *store* propio con señales de Solid y un contexto | Una biblioteca de estado; `createResource` por pantalla | El libro es un único objeto inmutable cargado una vez; señales más memos bastan y no añaden dependencias. Un `createResource` por pantalla llevaría a proyectar varias veces, que es justo lo que FR-016 prohíbe |
| **Adaptador del navegador**: `BlobLedgerStore` (lógica de etag, `append` y `replace` sobre bytes) + dos *handles* finos (fichero, IndexedDB) | Dos adaptadores completos e independientes | Toda la lógica del contrato de puerto se escribe **una vez** y se prueba con los tests de contrato existentes usando un *handle* en memoria; los *handles* reales quedan en 20-30 líneas cada uno, que es lo único que no se puede probar en Node |
| **Tests**: funciones puras + test de fuentes para la regla de `Amount` | `jsdom`/`happy-dom` + `@solidjs/testing-library`; renderizado SSR a cadena | Las dos alternativas son dependencias nuevas (o un segundo modo de compilación) que `docs/dependencies.md` no autoriza. La lógica que puede fallar —formato, enmascarado, orden, agrupación, especificación de formularios— es pura y se prueba mejor sin DOM. Queda en Q8 por si la dirección prefiere autorizar el entorno |
| **Formato de números**: formateador propio sobre la cadena decimal | `Intl.NumberFormat` con `Number(valor)` | `Number()` es coma flotante: convertir para pintar es la puerta por la que entra el error que ADR-0005 cierra. Agrupar dígitos sobre la cadena es diez líneas y es exacto |
| **Mensajes en español**: catálogo propio de la web por `code` | Reutilizar el de la CLI tal cual; moverlo a un paquete compartido | El de la CLI remite a comandos (`atlas settings set …`) que en la web no existen: copiarlo sería mentir al usuario. El catálogo propio con un test anti-deriva es lo más honesto sin crear un paquete nuevo. Queda en Q3 |
| **uPlot**: no se vendoriza todavía | Vendorizarla ya, como sugiere el árbol del prompt §3.1 | No hay gráficas en el alcance (§4). Vendorizar una biblioteca que nadie importa es "añadir por añadir", justo lo que el usuario pide evitar. Queda en Q9 |

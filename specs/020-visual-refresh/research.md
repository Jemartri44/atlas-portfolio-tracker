# Investigación: `020-visual-refresh`

Fechas en Europe/Madrid. Cada verificación con su fuente, su dirección y la fecha de la consulta.

## R1. La simulación del daltonismo (bloque 0 de E1, punto 1)

- **Decisión**: Machado, Oliveira y Fernandes (2009), **severidad 1,0**, aplicada en **RGB lineal** (sRGB → lineal con la curva de IEC 61966-2-1, la matriz, recorte a [0, 1], OKLab).
- **Fuente**: G. M. Machado, M. M. Oliveira y L. A. F. Fernandes, «A Physiologically-based Model for Simulation of Color Vision Deficiency», *IEEE Transactions on Visualization and Computer Graphics* 15(6), 1291-1298, 2009. Matrices publicadas por los autores en <https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html> (consultada el 2026-09-27):
  - protanopía: `[0.152286, 1.052583, -0.204868; 0.114503, 0.786281, 0.099216; -0.003882, -0.048116, 1.051998]`
  - deuteranopía: `[0.367322, 0.860646, -0.227968; 0.280085, 0.672501, 0.047413; -0.011820, 0.042940, 0.968881]`
  - tritanopía: `[1.255528, -0.076749, -0.178779; -0.078411, 0.930809, 0.147602; 0.004733, 0.691367, 0.303900]`
- **RGB lineal**: la página de las matrices no lo dice. Lo dice la implementación de referencia de R `colorspace` («first maps colors to linearized RGB coordinates, applies the color vision deficiency transformation, and then maps back»: <http://colorspace.r-forge.r-project.org/reference/simulate_cvd.html>, y el artículo <https://arxiv.org/pdf/1903.06490>), y lo explica DaltonLens (<https://daltonlens.org/understanding-cvd-simulation/>), las dos consultadas el 2026-09-27. Es también lo que usó la propuesta: su validador está calibrado con Machado 2009 en RGB lineal.
- **Por qué esta y no Viénot, Brettel y Mollon (1999)**: la propuesta midió con Machado, así que mis cifras son comparables con las suyas; tiene matriz publicada para las tres deficiencias (Viénot solo modela bien protanopía y deuteranopía), y es una matriz 3×3 por deficiencia, que el test escribe sin dependencias.
- **La prueba contra la fuente** (encargo, E1, bloque 1): el test pasa por la simulación los tres primarios lineales `(1,0,0)`, `(0,1,0)` y `(0,0,1)` y exige que salgan **las columnas publicadas** de cada matriz, con sus seis decimales; y el blanco lineal `(1,1,1)`, que las tres matrices de severidad 1 conservan (cada fila suma 1 ± 0,000001, dato de la propia tabla). Una matriz identidad, una matriz traspuesta o la de otra deficiencia fallan las dos comprobaciones.

## R2. OKLab (bloque 0 de E1, punto 2)

- **Decisión**: OKLab de Björn Ottosson, «A perceptual color space for image processing», publicado el **23/12/2020** en <https://bottosson.github.io/posts/oklab/> (consultado el 2026-09-27).
- **Fórmulas** (sRGB lineal → LMS → raíz cúbica → Lab):
  - `M1 = [0.4122214708, 0.5363325363, 0.0514459929; 0.2119034982, 0.6806995451, 0.1073969566; 0.0883024619, 0.2817188376, 0.6299787005]`
  - `M2 = [0.2104542553, 0.7936177850, -0.0040720468; 1.9779984951, -2.4285922050, 0.4505937099; 0.0259040371, 0.7827717662, -0.8086757660]`
- **ΔE ×100**: la distancia euclídea en OKLab multiplicada por 100, la unidad de la propuesta y de `system.md` §3.2 («ΔE ≥ 8»).
- **La prueba contra la fuente**: el blanco sRGB da `L = 1, a = 0, b = 0` (± 1e-4) y el negro, `L = 0`; el post publica esas dos referencias.

## R3. Mi recálculo de los ΔE de la propuesta (bloque 0 de E1, punto 3)

Implementación propia, sin dependencias (`020-cvd.mjs` en el *scratchpad*), con R1 y R2. **Coinciden con la propuesta en todas las cifras que ella da.** «Peor caso» es el mínimo de las tres deficiencias; la propuesta miraba protanopía y deuteranopía y daba la tritanopía aparte, y aquí la tritanopía nunca es el peor caso de ganancia/pérdida.

| Par | Tema | Normal | Protan. | Deuteran. | Tritan. | Peor caso | Propuesta |
|---|---|---:|---:|---:|---:|---:|---:|
| Ganancia/pérdida hoy (`#1b6a44`/`#a2392b`) | claro | 21,68 | 7,07 | **6,30** | 26,31 | 6,30 | 6,3 |
| Ganancia/pérdida hoy (`#6fc79a`/`#f0917e`) | oscuro | 20,46 | 9,32 | **4,22** | 25,24 | 4,22 | 4,2 |
| Pérdida/peligro hoy (`#a2392b`/`#9e2f27`) | claro | **2,11** | 2,47 | 1,89 | 2,06 | 1,89 | 2,1 (normal) |
| Pérdida/peligro hoy (`#f0917e`/`#f29a8a`) | oscuro | 2,26 | 2,58 | 2,07 | 2,32 | 2,07 | — |
| **Ganancia/pérdida propuesta** (`#0f6b5c`/`#b04a12`) | claro | 22,22 | **8,87** | 13,69 | 26,99 | **8,87** | 8,9 |
| **Ganancia/pérdida propuesta** (`#5cc6b0`/`#f2a066`) | oscuro | 19,97 | **9,90** | 11,45 | 26,06 | **9,90** | 9,9 |
| **Pérdida/peligro propuesta** (`#b04a12`/`#9e2f27`) | claro | **7,50** | 8,31 | 7,01 | 6,40 | 6,40 | 7,5 (normal) |
| **Pérdida/peligro propuesta** (`#f2a066`/`#f29a8a`) | **oscuro** | **5,05** | 5,19 | 4,33 | 0,82 | 0,82 | **no la da** |
| Pérdida/aviso propuesta (`#b04a12`/`#80530a`) | claro | 9,31 | **1,72** | 6,14 | 10,40 | 1,72 | «se acerca» |
| Pérdida/aviso propuesta (`#f2a066`/`#e8b659`) | oscuro | 6,20 | 5,53 | 3,30 | 5,16 | 3,30 | — |
| Renta variable/cripto (`#4166b4`/`#8a58a8`) | claro | 10,96 | **1,99** | 5,64 | 13,46 | 1,99 | 2,0 |
| Renta variable/cripto (`#5b8fd6`/`#a476c8`) | oscuro | 11,03 | 4,20 | **2,88** | 14,44 | 2,88 | 2,9 |

- **Ganancia/pérdida pasa** el umbral de 8 en los dos temas y con las tres deficiencias.
- **Pérdida/peligro con visión normal NO llega en oscuro: 5,05**, por debajo del suelo de 7 que fija el encargo («el test falla por debajo de 7»). La propuesta solo midió el claro (7,50). **Por la regla del encargo, PARO en este punto**: no elijo otro color. Es la pregunta **Q1** de `questions.md`, con las opciones medidas.
- Con recorte a [0, 1] tras la simulación o sin él, las cifras de los pares propuestos no cambian (13,69 y 11,45 en deuteranopía con y sin recorte).

## R4. Contraste WCAG de los colores nuevos (bloque 0 de E1, punto 4)

Fórmula WCAG 2.x (la de `test/contrast.test.ts`), sobre `--c-surface`, `--c-canvas` y, para el bloque *pendiente*, `--c-fill`:

| Color | Tema | Sobre la superficie | Sobre el papel | Sobre `--c-fill` | Exigido |
|---|---|---:|---:|---:|---|
| `--c-gain` `#0f6b5c` | claro | 6,41 | 5,72 | 5,56 | ≥ 4,5 (texto) |
| `--c-loss` `#b04a12` | claro | 5,48 | 4,89 | 4,76 | ≥ 4,5 |
| `--c-gain` `#5cc6b0` | oscuro | 7,99 | 8,76 | 6,96 | ≥ 4,5 |
| `--c-loss` `#f2a066` | oscuro | 7,86 | 8,62 | 6,85 | ≥ 4,5 |
| `--c-series-contrib` `#8a8880` | claro | 3,55 | 3,17 | — | ≥ 3 (gráfico) |
| `--c-series-contrib` `#8f8d86` | oscuro | 4,97 | 5,45 | — | ≥ 3 |

Todos pasan. Coinciden con la propuesta (6,4 / 8,0 y 5,5 / 7,9).

## R5. El plazo de los modelos 720 y 721 (M12; §8 P4 del encargo)

- **Modelo 720**: Orden HAP/72/2013, de 30 de enero, **artículo 7**: «La presentación del modelo 720 […] se realizará entre el 1 de enero y el 31 de marzo del año siguiente a aquel al que se refiera la información a suministrar». Texto consolidado en <https://www.boe.es/buscar/act.php?id=BOE-A-2013-954> (última actualización del consolidado: 31/10/2023, en vigor desde el 01/11/2023; la única modificación, la Orden HFP/1180/2023, toca el artículo 2 y el anexo, **no el 7**). Consultado el 2026-09-27.
- **Modelo 721**: Orden HFP/886/2023, de 26 de julio, **artículo 4**: «La presentación del modelo 721 […] se realizará entre el 1 de enero y el 31 de marzo del año siguiente a aquel al que se refiera la información a suministrar»; su disposición final segunda la aplica por primera vez al ejercicio 2023 (presentado del 01/01/2024 al 31/03/2024). <https://www.boe.es/buscar/doc.php?id=BOE-A-2023-17429>, consultado el 2026-09-27.
- **Fuente encontrada: no hay parada.** Cómo se guarda por ejercicio (una fila por ejercicio verificado, o un tramo abierto desde el primero) es **Q4**.

## R6. Chromium para las capturas

- `ls -d ~/.cache/ms-playwright/chromium-*` da **una** versión, `chromium-1243`; el guion toma la más alta con `sort -V`, no la fija. `Browser.getVersion` responde **`Chrome/153.0.8010.12`**.
- Conducido desde el *scratchpad* (`020-capture.mjs`) por el protocolo DevTools con el `fetch` y el `WebSocket` de Node 22. Nada entra en ningún `package.json`.

## R7. Lo que el encargo afirma del código, comprobado sobre `ae66814`

Todo lo de §1, punto 8, y §0, punto 5, **se cumple**, con estas precisiones:

- `check-bundle.mjs`: `BOOT_BUDGET_GZIP_BYTES` está ahora en la línea 332 (74.134), `TOTAL_BUDGET_GZIP_BYTES` en la 773 (`294 * 1024 + 440` = 301.496) y `LAZY_ONLY` en la 909.
- **La lista de pares iguales de `tokens.css` que da el encargo está incompleta**: en claro, **`--c-raised`** también vale `#ffffff`, junto a `--c-surface`, `--c-on-accent` y `--c-on-danger`. El resto de la lista es exacta (en claro, `--c-accent` = `--c-accent-soft-text` y `--c-positive` = `--c-done`; en los dos oscuros, `--c-accent-hover` = `--c-accent-soft-text`, `--c-fill` = `--c-chart-grid`, `--c-raised` = `--c-chart-gap-edge` y `--c-positive` = `--c-done`; y cada serie con su tipo de activo en los tres bloques). No es una parada: la lista cerrada del test la recoge con su motivo.
- **`tax_residence` no tiene valor por defecto en el código** (`settings.ts:143`, opcional, sin `DEFAULT_*`), solo lo escribe el generador sintético (`"ES"`), y la web lo ofrece con la pista «Dos letras (ISO 3166-1)». `business-rules.md` dice «España» como valor inicial. Con la regla del encargo (sin `tax_residence` no se supone `ES`), **un libro que nunca lo configuró reservará la fila siempre** fuera de la campaña: es **Q3**.
- `fiscalAttention` compara con el literal `"ES"` (`informative/attention.ts:105`) y `informative/holdings.ts:34` tiene `SPAIN = "ES"`. No los alineo (plan §4.2).
- `unfiledPastYears` es **una nota, no un aviso** (`filings/touched.ts:141-148`, Q8 de la 010). El encargo dice dónde van, fuera de la campaña, el 720/721 y los inválidos, pero **no** los ejercicios sin declarar: es **Q2**.
- `Criteria.tsx:80` pinta con color de resultado lo que un criterio arriesga (`stake.amount_eur`), que no es una ganancia ni una pérdida: con la regla nueva (el color solo en resultados) es **Q6**.
- **El ancla**: medido en el *build* de `ae66814`, al entrar por `/ajustes#sincronizacion` a 400 px **la página ni siquiera baja** (queda en `scrollY = 0`, el título a 1.019 px): el destino se pinta después de la navegación, cuando el navegador ya buscó el fragmento. A 2045 baja porque la página es corta. Cuando baja al destino (`scrollIntoView`), el título queda **bajo la barra**, que es el defecto de la 015. El arreglo (plan §3, E1) tiene las dos partes. Las cifras, en `medidas.json` de las capturas «antes».

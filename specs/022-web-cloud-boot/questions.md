# Preguntas — 022

## 1. El total del bundle no cabe en su techo

`npm run build -w @atlas/web` falla en la última comprobación de `scripts/check-bundle.mjs`:

| | medido (gzip, bytes) | techo | autorizado |
|---|---|---|---|
| Arranque | 75.949 | 76.055 | 76.069 |
| Total | 320.215 | 315.745 | 500.000 |

El arranque **cabe** (de hecho baja 86 bytes sobre lo medido antes de la entrega: el camino local y el de la nube se cargan con `import()`). El total crece **+4.726 bytes** sobre los 315.489 anteriores. Es todo perezoso: `cloud.ts` (1,8 KB, con `ApiLedgerStore` y el cliente HTTP), `CloudGate` (0,9 KB), el módulo de acciones separado del arranque y la partición de trozos que eso provoca. Nada de esto sale mientras exista el camino local (E2b/E5 lo retiran y devolverán la mayor parte).

**Pregunta (dirección):** ¿subir el techo del total a 320.500 (medido + ~285, dentro de lo autorizado, 500.000)? No lo he tocado. Mientras no se decida, el *build* queda en rojo solo por esa línea.
**Alternativa:** no subirlo y que E2b/E5 recuperen el sitio; esta entrega no se fusionaría hasta entonces.

## 2. Tras iniciar sesión, la API redirige a `/ajustes#sincronizacion`

(`docs/api.md` §3.) En modo nube esa tarjeta es la que ADR-0035 retira; lo natural es `/`. Es de la API (E4); lo anoto, no lo toco.

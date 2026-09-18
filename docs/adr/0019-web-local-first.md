# ADR-0019 — La aplicación web funciona sola: local-first, sin servidor

**Estado:** Aceptada (2026-09-18). Completa ADR-0017 (*stack*) con el modo de funcionamiento. Adelanta la web por delante de la Fase 4.

## Contexto

La especificación dibujaba la web como una SPA servida desde S3 + CloudFront, autenticada con Cognito y leyendo el libro a través de una Lambda con Function URL. Todo eso es Fase 4 y **está bloqueado**: exige pasar la cuenta de AWS al Paid Plan, y el usuario ha puesto un límite claro — no se gasta dinero. Bloquear la web hasta entonces dejaría la aplicación en una CLI durante meses, cuando la parte que el usuario va a usar a diario, desde el teléfono, es justamente la web.

Hay tres cosas que hacen que la web no necesite servidor para nada:

1. El **dominio es isomorfo** (ADR-0007): `@atlas/domain` es TypeScript puro sin E/S, así que proyectar el libro entero, calcular pesos, repartir la aportación o medir el cubo funciona igual en el navegador que en Node.
2. El libro **cabe en memoria**: unos pocos MB tras veinte años (ADR-0002).
3. `LedgerStore` ya es un **puerto** con tres implementaciones (memoria, fichero, y la de S3 pendiente). Una implementación de navegador es un adaptador más, no un cambio de arquitectura.

## Opciones consideradas

1. **Esperar a la Fase 4.** Ventaja: una sola forma de funcionar. Inconveniente: la web, que es el uso diario, llega la última y depende de un gasto que hoy no se puede hacer.
2. **Un servidor propio gratuito** (un plan gratis de terceros). Inconveniente: la constitución prohíbe servicios de pago en el camino crítico y desconfía de los de terceros; un plan gratuito que caduca es peor que no tener servidor.
3. **Local-first: el libro vive en el dispositivo y la web funciona sin red** (elegida).

## Decisión

La web funciona **entera en el navegador**, sin servidor y sin cuenta en ningún sitio:

- **En escritorio**, cuando el navegador ofrece la File System Access API, la web trabaja **directamente sobre el mismo `ledger.jsonl` del disco** que usa la CLI. Una sola fuente de verdad, sin copias ni sincronización: se abre el fichero una vez y se conserva el permiso.
- **En cualquier otro caso** (móvil, Firefox, Safari), el libro vive en **IndexedDB** y se importa y exporta como fichero con un botón. El adaptador es el mismo puerto `LedgerStore`, con el mismo contrato: rechazo de versiones más nuevas, `append` que nunca re-serializa lo anterior, escritura condicional por etag.
- **No hay autenticación** porque no hay servidor ni datos en ningún sitio remoto: la protección es la del propio dispositivo. Cuando llegue la Fase 4, Cognito protegerá la API, no la aplicación local.
- La PWA cachea la aplicación para abrirla sin conexión; el libro ya está en el dispositivo, así que **sin conexión no se pierde ninguna funcionalidad**, ni siquiera registrar operaciones.

**Limitación conocida y aceptada: no hay sincronización entre dispositivos.** Cada dispositivo tiene su copia y el usuario mueve el fichero a mano si quiere trabajar en dos. La sincronización llega con la Fase 4, y entonces el adaptador de S3 se suma a los otros sin tocar ni una línea del dominio ni de las vistas. Hasta entonces, la regla práctica es la misma que ya aplica la CLI: **el fichero es la fuente de verdad y se respalda** (`atlas backup`).

## Consecuencias

- Orden de fases alterado: la web se construye **antes** de la Fase 4 en vez de después, y no depende de ella. `docs/decision-roadmap.md` lo recoge.
- Adaptador nuevo de `LedgerStore` para el navegador (fichero y IndexedDB), con el **contrato de puerto ya probado**: los mismos tests de contrato que cumplen el de memoria y el de fichero.
- Importar el adaptador de navegador **no puede arrastrar `node:fs`** al *bundle*: hay que verificarlo, no suponerlo.
- El riesgo real pasa a ser la pérdida de datos del navegador (borrar los datos del sitio borra el libro si vive en IndexedDB). Se mitiga con exportación a fichero visible y recordada, y con la copia de la CLI. La web **nunca** presenta IndexedDB como un almacén definitivo.
- Lo que se gana: la aplicación entera es utilizable —y regalable a cualquiera— sin cuenta, sin coste y sin conexión. Lo que se pospone a propósito: ver el mismo libro en dos dispositivos sin mover un fichero.

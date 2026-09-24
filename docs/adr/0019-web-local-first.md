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

- ~~**En escritorio**, cuando el navegador ofrece la File System Access API, la web trabaja **directamente sobre el mismo `ledger.jsonl` del disco** que usa la CLI. Una sola fuente de verdad, sin copias ni sincronización: se abre el fichero una vez y se conserva el permiso.~~ **Enmendado el 2026-09-24 (ver al final):** la web de escritorio guarda el libro en IndexedDB, como el móvil, y **nunca escribe en la carpeta compartida**; solo lee de ella.
- ~~**En cualquier otro caso** (móvil, Firefox, Safari), el libro vive~~ **En todos los casos** (escritorio, móvil, Firefox, Safari), el libro vive en **IndexedDB** y se importa y exporta como fichero con un botón. El adaptador es el mismo puerto `LedgerStore`, con el mismo contrato: rechazo de versiones más nuevas, `append` que nunca re-serializa lo anterior, escritura condicional por etag.
- **No hay autenticación** porque no hay servidor ni datos en ningún sitio remoto: la protección es la del propio dispositivo. Cuando llegue la Fase 4, Cognito protegerá la API, no la aplicación local.
- La PWA cachea la aplicación para abrirla sin conexión; el libro ya está en el dispositivo, así que **sin conexión no se pierde ninguna funcionalidad**, ni siquiera registrar operaciones.

**Limitación conocida y aceptada: no hay sincronización entre dispositivos.** Cada dispositivo tiene su copia y el usuario mueve el fichero a mano si quiere trabajar en dos. La sincronización llega con la Fase 4, y entonces el adaptador de S3 se suma a los otros sin tocar ni una línea del dominio ni de las vistas. Hasta entonces, la regla práctica es la misma que ya aplica la CLI: **el fichero es la fuente de verdad y se respalda** (`atlas backup`).

## Consecuencias

- Orden de fases alterado: la web se construye **antes** de la Fase 4 en vez de después, y no depende de ella. `docs/decision-roadmap.md` lo recoge.
- Adaptador nuevo de `LedgerStore` para el navegador (fichero y IndexedDB), con el **contrato de puerto ya probado**: los mismos tests de contrato que cumplen el de memoria y el de fichero.
- Importar el adaptador de navegador **no puede arrastrar `node:fs`** al *bundle*: hay que verificarlo, no suponerlo.
- El riesgo real pasa a ser la pérdida de datos del navegador (borrar los datos del sitio borra el libro si vive en IndexedDB). Se mitiga con exportación a fichero visible y recordada, y con la copia de la CLI. La web **nunca** presenta IndexedDB como un almacén definitivo.
- Lo que se gana: la aplicación entera es utilizable —y regalable a cualquiera— sin cuenta, sin coste y sin conexión. Lo que se pospone a propósito: ver el mismo libro en dos dispositivos sin mover un fichero.

---

## Nota del 2026-09-24 (Ronda 8): lo que se pospuso, cerrado, y sin Cognito

Lo que este ADR pospuso a propósito —«ver el mismo libro en dos dispositivos sin mover un fichero»— lo resuelve **ADR-0026**: cola local por dispositivo, reaplicación línea a línea sobre el remoto, con lo que no cabe retenido para que decida el usuario. La frase «Cuando llegue la Fase 4, Cognito protegerá la API, no la aplicación local» **deja de ser cierta en la parte de Cognito**: **ADR-0027** sustituye Cognito por acceso solo con Google, verificado en la propia Lambda. Lo que sigue vigente sin cambios: la aplicación local no tiene ni necesita autenticación, y sin nube sigue funcionando entera, sin cuenta y sin conexión.

## Enmienda del 2026-09-24 (feature 012): la web de escritorio no escribe en la carpeta compartida

Decidida por la dirección al levantar la parada del paso 0 de la feature 012 (decisión D1 de `specs/012-ecb-reference-rates/questions.md` §8; opción B de §2, con lectura).

**Qué cambia.** La web de escritorio guarda el libro en **IndexedDB**, como el móvil, y **nunca escribe en la carpeta compartida** con la consola. Puede **leer** de ella: el histórico del BCE (`reference/ecb/`, con `atlas.config.json` para su umbral) y la importación de un libro, con su confirmación explícita. El único escritor de la carpeta es la consola, con el cerrojo consultivo `"wx"` entre consolas (ADR-0026, Parte B, enmendada el mismo día). La frase de arriba sobre el escritorio queda tachada.

**Motivo.** La File System Access API **no permite crear un fichero en exclusiva** en una carpeta elegida por el usuario, y sin eso el cerrojo de ADR-0026 no puede excluir a la web. Lo dicen la especificación WHATWG (`FileSystemGetFileOptions` solo tiene `create`; con `create: true`, «ya existía» y «lo he creado yo» son el mismo resultado) y el código de Chromium (`GetFileWithWritePermission` llama a `CreateFile` con `exclusive=false`, y el dato de si lo creó se descarta antes de llegar a la página). En el ensayo, **dos pestañas que pedían a la vez el mismo fichero de cerrojo lo consiguieron las dos las 50 veces de 50**. Fuentes, versiones y salidas literales en `questions.md` §1. Motivo de la dirección, además: queda **un solo escritor por almacén**; el único medio con varios escritores pasa a ser S3 con la sincronización, donde la escritura condicional es atómica en el servidor.

**Consecuencia asumida.** Hasta que exista la sincronización (ADR-0026, feature 014), **la web y la consola de escritorio no comparten un libro vivo**: cada una tiene el suyo, y se pasa de una a otra **exportando e importando**. «Una sola fuente de verdad, sin copias», que era lo que esta ADR buscaba en el escritorio, deja de ser cierto hasta entonces. Hoy no cuesta nada real: el usuario no usaba todavía el modo de fichero directo. Lo que sigue vigente: la web funciona entera sin servidor, sin cuenta y sin conexión, y nunca presenta IndexedDB como un almacén definitivo.

**En el código** (feature 012, PR #75): la web pide la carpeta solo para leer; un test de arquitectura impide que vuelva a pedir permiso de escritura o cree un fichero en ella. Toda lectura seguida de escritura del libro en IndexedDB es **una sola transacción** de lectura y escritura (`LedgerBlob.update`), y la fecha de la última exportación vive aparte del texto (`current:meta`).

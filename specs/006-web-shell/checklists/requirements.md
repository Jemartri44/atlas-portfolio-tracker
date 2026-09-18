# Checklist de calidad de la especificación: 006-web-shell

**Propósito**: validar que la especificación está completa y es de calidad antes de implementar
**Creada**: 2026-09-18
**Feature**: [spec.md](../spec.md)

## Calidad del contenido

- [x] Sin detalles de implementación en los requisitos — se nombran rutas, componentes (`Amount`), proyecciones y códigos de aviso porque el prompt §3 y ADR-0017/0019 los fijan como contrato; el *cómo* está en `plan.md`
- [x] Centrada en el valor para el usuario: cada pantalla responde una pregunta que el usuario se hace de verdad, y está escrita en la tabla de arquitectura de información de `plan.md`
- [x] Escrita para quien va a **usar** la aplicación a diario desde el teléfono, no solo para quien la programa
- [x] Todas las secciones obligatorias completas

## Completitud de los requisitos

- [x] No quedan marcadores `[NEEDS CLARIFICATION]`: las once dudas están en `questions.md` con su supuesto provisional, como manda el prompt §1
- [x] Los 60 requisitos funcionales son verificables y sin ambigüedad
- [x] Los criterios de éxito son medibles (360 px, 44 px, milisegundos medidos, KB del *bundle*, toques hasta la vista previa, cero peticiones ajenas)
- [x] Los criterios de éxito no dependen de la implementación
- [x] Los diez escenarios de usuario tienen sus escenarios de aceptación
- [x] Casos límite identificados: sin libro, libro vacío, permiso revocado, fichero cambiado por fuera, dos pestañas, esquema más nuevo, línea corrupta, eventos inválidos, dependientes, huella repetida, cubo sin tesis, falta de precio o de tipo de cambio, IndexedDB no disponible o llena
- [x] El alcance está acotado (§4 del prompt): sin vistas analíticas, sin gráficas, sin asistentes de eventos corporativos, traspasos ni tesis, sin AWS, sin sincronización, sin precios automáticos, sin importadores, sin cambios de esquema
- [x] Dependencias y supuestos identificados (A1-A13, ligados a Q1-Q11)

## Preparación de la feature

- [x] Cada requisito funcional tiene su escenario de aceptación o su criterio medible
- [x] Las historias cubren los flujos principales: abrir el libro, navegar, privacidad, resumen, consultar, registrar, rectificar, catálogo, configurar y verificar, instalar
- [x] Las historias son entregables en orden: con las tres primeras (libro, esqueleto, privacidad) más la cuarta (Resumen) ya hay aplicación útil
- [x] La feature cumple los resultados medibles de los criterios de éxito
- [x] No se filtran detalles de implementación en los criterios de éxito

## Cumplimiento del prompt (decisiones (a)-(g))

- [x] **(a)** *Stack* de ADR-0017 sin discusión; las dos desviaciones (`vite-plugin-solid`, entorno de tests) se plantearon como **preguntas** (Q7, Q8) y están resueltas por la dirección; las exclusiones escritas (Tailwind, Observable Plot, ECharts, `solid-ui`, TanStack Table) se respetan, y la última de forma activa: ordenar y agrupar va al dominio (Q2)
- [x] **(b)** Sin servidor: fichero del disco donde se puede, IndexedDB en el resto, nunca presentado como definitivo
- [x] **(c)** Ni una regla de negocio fuera del dominio: las tres que faltaban entran en el dominio con la CLI migrada (decisión (h)), no en un componente
- [x] **(d)** Un único componente para importes **y cantidades**, enmascarado por defecto, con test que lo vigila por el grafo de imports
- [x] **(e)** Una sola navegación, conmutada por CSS entre barra inferior y rail; nunca las dos
- [x] **(f)** El color nunca es el único portador de significado; cero desplazamiento horizontal a 360 px
- [x] **(g)** Esqueleto más Resumen y Movimientos: pequeño y terminado. Los dos destinos reservados existen y dicen la verdad sobre lo que aún no hay

## Verificaciones hechas antes de escribir el plan (no supuestas)

- [x] TypeScript 7 con `lib: DOM` y `.tsx`: sonda real, compila
- [x] `composite` + `noEmit`: sonda real, `tsc -b` en verde
- [x] Vite 8 ya instalada (8.2.2, transitiva de Vitest) y aceptada por Vitest 4: `npm ci` no entra en conflicto
- [x] Versiones y rangos de pares de `solid-js`, `@solidjs/router`, `vite-plugin-solid`, `vite-plugin-pwa` y `@picocss/pico`
- [x] Coste real de proyectar el *golden* y su escalado (lineal, ~6 µs/evento)
- [x] Compatibilidad real de la File System Access API (**no existe en móvil**) y semántica del permiso entre sesiones
- [x] `navigator.storage.persist()` disponible y qué protege

## Notas

- **Q1-Q11 respondidas el 2026-09-18** (PR #35). Q1, Q2 y Q4 al dominio con la CLI migrada (decisión (h)); Q3 catálogo por interfaz con test anti-deriva **bidireccional** (decisión (i)); Q5 selector de carpeta (decisión (j)); Q7 `vite-plugin-solid` autorizada y registrada; Q8 sin entorno de DOM, con `happy-dom` pre-autorizada (decisión (k)); Q9, Q10 y Q11 confirmados.
- **Q6 era una contradicción real entre documentos y la ganó la especificación**: el modo privacidad enmascara **importes y cantidades**; el prompt §3.4 estaba mal y se ha corregido dejando el error escrito. Matiz añadido: no se enmascara un campo que el usuario está rellenando.
- **Los dos hallazgos del móvil son alcance permanente** (decisión (l)): el libro vive siempre en el navegador en el teléfono, y el "Reconectar" del permiso del fichero entra en el alcance.
- Las rutas están en español porque son interfaz; los identificadores, en inglés, como el resto del proyecto.
- El *golden* sintético (200 eventos, una anulación, nueve tesis, siete eventos corporativos) cubre todos los estados de pantalla que hay que verificar a mano; no hace falta inventar datos.

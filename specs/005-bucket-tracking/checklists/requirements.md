# Checklist de calidad de la especificación: 005-bucket-tracking

**Propósito**: validar que la especificación está completa y es de calidad antes de planificar
**Creada**: 2026-09-18
**Feature**: [spec.md](../spec.md)

## Calidad del contenido

- [x] Sin detalles de implementación (lenguajes, frameworks, APIs) — se nombran comandos, proyecciones y códigos de aviso porque el prompt §3 y `docs/data-schema.md` §7 los fijan como contrato, no como diseño interno
- [x] Centrada en el valor para el usuario y en la necesidad de negocio (reglas 13-20 del plan)
- [x] Escrita para quien lee las reglas de negocio, no solo para quien programa
- [x] Todas las secciones obligatorias completas

## Completitud de los requisitos

- [x] No quedan marcadores [NEEDS CLARIFICATION]: las siete dudas abiertas están en `questions.md` con su supuesto provisional, como manda el prompt §1
- [x] Los requisitos son verificables y sin ambigüedad
- [x] Los criterios de éxito son medibles
- [x] Los criterios de éxito no dependen de la implementación
- [x] Todos los escenarios de aceptación están definidos
- [x] Los casos límite están identificados (los obligatorios del prompt §3.9 más los del dominio)
- [x] El alcance está acotado (§4 del prompt: sin gráficas, sin precios automáticos, sin motor fiscal)
- [x] Dependencias y supuestos identificados (A1-A13)

## Preparación de la feature

- [x] Cada requisito funcional tiene criterios de aceptación claros
- [x] Las historias cubren los flujos principales (ver el cubo, medirlo contra el índice, el patrimonio, las reglas de control, el aviso de recompra)
- [x] La feature cumple los resultados medibles de los criterios de éxito
- [x] No se filtran detalles de implementación en los criterios de éxito

## Notas

- **Q1-Q7 resueltas el 2026-09-18.** Q1 corrigió el prompt (manda la plusvalía latente) y **Q3 cambió el supuesto**: la ventana avisa en las dos direcciones. Las cinco restantes confirmaron el supuesto.
- Contexto original de las preguntas: Q1 (qué es el "valor latente" de la fórmula de la regla 16) es la única que cambia números de forma estructural: el supuesto A1 se aparta de la letra del prompt §3.3 porque su lectura literal rompe dos de las propiedades que el propio prompt exige en §3.9. Las demás (P(d) en euros, dirección del aviso de recompra, `--at` frente a `--date`, umbral de significancia, alcance de la exclusión por contaminación y bruto/neto en la regla de parada) no alteran ninguna cifra fiscal.
- **Actualizada el 2026-09-18** con el prompt revisado tras el tercer *challenge*: historias 10 (bloque 0, ADR-0018), 11 (puerta única de precios) y 12 (aviso de ejercicio movido), más los cambios en las historias 4, 5 y 6. El bloque 0 va **primero** en el orden de implementación aunque esté al final en el orden de lectura.
- Los nombres de proyección (`netWorth`, `bucketPositions`, `bucketStats`), de comando (`atlas bucket`, `atlas networth`, `atlas thesis show`) y de aviso (`bucket_*`, `wash_sale_window_repurchase`) vienen fijados por el prompt y por `docs/data-schema.md` §7: son contrato, no diseño.

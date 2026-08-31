# Checklist de calidad de la especificación: 004-monthly-contribution

**Propósito**: validar que la especificación está completa y es de calidad antes de planificar
**Creada**: 2026-08-31
**Feature**: [spec.md](../spec.md)

## Calidad del contenido

- [x] Sin detalles de implementación (lenguajes, frameworks, APIs)  — se nombran comandos y nombres de proyección porque el prompt los fija como contrato de usuario, no como diseño interno
- [x] Centrada en el valor para el usuario y en la necesidad de negocio
- [x] Escrita para quien lee las reglas de negocio, no solo para quien programa
- [x] Todas las secciones obligatorias completas

## Completitud de los requisitos

- [x] No quedan marcadores [NEEDS CLARIFICATION] — las tres dudas abiertas están en `questions.md` con supuesto provisional, como manda el prompt §1
- [x] Los requisitos son verificables y sin ambigüedad
- [x] Los criterios de éxito son medibles
- [x] Los criterios de éxito no dependen de la implementación
- [x] Todos los escenarios de aceptación están definidos
- [x] Los casos límite están identificados (los 15 obligatorios del prompt §3.8 más los del dominio)
- [x] El alcance está acotado (§4 del prompt, recogido en el resumen)
- [x] Dependencias y supuestos identificados (A1-A12)

## Preparación de la feature

- [x] Cada requisito funcional tiene criterios de aceptación claros
- [x] Las historias cubren los flujos principales
- [x] La feature cumple los resultados medibles de los criterios de éxito
- [x] No se filtran detalles de implementación

## Notas

- Q1 (filas de `weights` sin posición), Q2 (comisiones de `forced_sale` en `costs`) y Q3 (flag antiguo de la ventana) quedaron resueltas por el usuario el 2026-08-31 y están cerradas en `questions.md`; la spec recoge las respuestas (A2, A8, A10, FR-011, FR-015, FR-019).
- Los identificadores de comandos, proyecciones y códigos de aviso vienen fijados por `docs/prompts/004-monthly-contribution.md` §3 y por `docs/data-schema.md` §7: son contrato, no diseño.

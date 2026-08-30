# Checklist de calidad de la especificación: Datos sintéticos, compactación y verificación profunda

**Propósito**: validar que la especificación está completa y es de calidad antes de planificar
**Creada**: 2026-08-30
**Feature**: [spec.md](../spec.md)

## Calidad del contenido

- [x] Sin detalles de implementación (lenguajes, frameworks, APIs) — se citan funciones, puertos y campos porque son el vocabulario fijado en `docs/data-schema.md`, ADR-0006/0007 y el prompt §6, no elecciones de implementación
- [x] Centrada en el valor para el usuario y las necesidades del negocio (reproducibilidad, supervivencia del libro, verificación)
- [x] Legible para alguien no técnico (con el glosario de `docs/`)
- [x] Todas las secciones obligatorias completas

## Completitud de requisitos

- [x] Sin marcadores [NEEDS CLARIFICATION] — la única contradicción de fondo (avisos vacíos frente a activo en dos cuentas) va a `questions.md` Q1 con el supuesto provisional A1, como manda el prompt
- [x] Requisitos verificables y sin ambigüedad
- [x] Criterios de éxito medibles
- [x] Criterios de éxito independientes de la tecnología
- [x] Escenarios de aceptación definidos para cada historia
- [x] Casos límite identificados (prompt §3.8 íntegro más los detectados al leer el código)
- [x] Alcance acotado (prompt §3 dentro, §4 fuera)
- [x] Dependencias y supuestos identificados (A1-A15)

## Preparación

- [x] Cada requisito funcional tiene criterio de aceptación en alguna historia o caso límite
- [x] Las historias cubren los flujos principales (generador y golden file, compact, check --deep, esquema de prueba, backup, tooling)
- [x] La feature cumple los resultados medibles de los criterios de éxito
- [x] No se filtran detalles de implementación

## Notas

- Spec y plan aprobados por el usuario el 2026-08-30; Q1 resuelta (a) con invariante bilateral; recomendaciones (1)-(4) adoptadas antes de codificar.
- Implementación completa el 2026-08-30 (T001-T023); notas en `questions.md`.

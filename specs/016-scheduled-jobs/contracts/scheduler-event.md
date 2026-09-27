# Contrato: el evento de EventBridge Scheduler (**aceptado** el 2026-09-27)

Lo que cada programación pone en `Target.Input` y la función recibe como evento, invocada de forma asíncrona (`questions.md` §1.4).

```json
{ "event_format": 1, "tasks": ["dispatch_findings", "monthly_reminder", "weekly_review", "tax_return_ready", "informative_thresholds"] }
```

- **Exactamente** dos claves, `event_format` (el número `1`) y `tasks`.
- `tasks`: lista no vacía, sin repetidas, de nombres del catálogo (`plan.md` §5.2), **todos en `ATLAS_JOBS` de esa función**. El orden de la lista es el orden en que se ejecutan (el correo pone `dispatch_findings` primero).
- Cualquier otra cosa —algo que no es un objeto, una clave de más o de menos, `event_format` distinto de `1`, una tarea desconocida o de otra función, una lista vacía o con repetidas— es `job_event_invalid`, con `details.reason` (`not_an_object`, `unknown_key`, `missing_key`, `format`, `not_a_list`, `empty`, `unknown_task`, `task_not_in_function`, `repeated_task`), y **no hace nada**: ni lee el libro ni escribe ningún registro.
- **Límite, dicho** (revisión de la PR #104, B2): el *runtime* de Lambda parsea la carga **antes** de entregarla al manejador, así que una clave repetida o un suplente suelto del texto del `Input` no se pueden ver: con `"tasks"` repetido gana la última, como en `JSON.parse`. Lo que el manejador sí garantiza es que cada tarea está en el catálogo y en `ATLAS_JOBS` de su función, así que ninguna de las dos cosas puede hacer correr una tarea que no le toca. El `Input` lo escribe Terraform (017), no un tercero.
- Una invocación manual en `dev` (ADR-0034, fila 2) usa el mismo evento.

Por cada función (Terraform, en la 017):

| Función | `tasks` |
|---|---|
| `atlas-<entorno>-job-ecb` | `["ecb_update"]` |
| `atlas-<entorno>-job-prices` | `["prices_update"]` |
| `atlas-<entorno>-job-mail` | `["dispatch_findings", "monthly_reminder", "weekly_review", "tax_return_ready", "informative_thresholds"]` |
| `atlas-<entorno>-job-backup` | `["monthly_backup"]` |
| `atlas-<entorno>-job-integrity` | `["quarterly_integrity"]` |

**Alternativa (Q6)**: añadir `"scheduled_at": "<aws.scheduler.scheduled-time>"` y sacar de ahí el periodo. No se propone.

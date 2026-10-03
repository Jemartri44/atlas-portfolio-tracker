# Preguntas abiertas de la 017 (para la dirección)

Fecha: 2026-10-03. Fase: spec y plan, antes de escribir código. Nada de esto es fiscal; es estructural o de seguridad, y por eso se pregunta en lugar de decidir.

## Preguntas

**P-1. Terraform ya está instalado; ¿cuenta como la aprobación de §12 P1?** `command -v terraform` da `/home/ubuntu/.local/bin/terraform` (v1.16.5). El prompt dice que, con la herramienta instalada, se puede seguir, pero que el usuario es quien aprueba. Pido confirmar que se aprueban también: (a) el proveedor `hashicorp/aws` con versión exacta (se fija en E1 b0.1 con `init -backend=false`, que baja del registro de HashiCorp), (b) `.terraform.lock.hcl` versionado y (c) `hashicorp/setup-terraform` fijada por SHA en E4. *Recomendación: sí; lo escribe la dirección en `docs/dependencies.md`.*

**P-2. Un proyecto nuevo en `vitest.config.ts`.** La suite de `infra/test/` necesita un proyecto propio (y quizá una entrada en `tsconfig.json`). No es `docs/`, `.githooks/`, `.claude/`, `.specify/` ni `CLAUDE.md`, así que entiendo que entra en el alcance; lo confirmo porque modifica configuración compartida de la tubería. *Recomendación: sí, con el arnés de E1.*

**P-3. Una lectura que el guion de los secretos necesita y el contrato no concede.** El prompt (E2 b2, E4 b1) da al rol de administración `ssm:PutParameter` y `ssm:AddTagsToResource` sobre `/auth/*` y `/prices/*`, pero `atlas admin secrets` tiene que saber si un parámetro existe para «sobrescribir pide teclear el entorno» y para ser idempotente, y eso exige leer (`ssm:GetParameter`, sin descifrar, o `ssm:DescribeParameters`, que no admite recurso y obligaría a `Resource: "*"`). Una acción sin fila de contrato es una pregunta. *Recomendación: `ssm:GetParameter` sobre `/atlas/<entorno>/auth/*` y `/atlas/<entorno>/prices/*` para el administrador (con MFA; la fila 21 solo prohíbe esto al `plan` y al despliegue), y `kms:Decrypt` solo si C2 la exige; la orden pide `WithDecryption=false` y nunca imprime el valor.*

**P-4. `ATLAS_ORIGIN` lleva el dominio en una variable de entorno de las Lambdas.** `docs/api.md` §9 y `ssm-and-config.md` §2 exigen `ATLAS_ORIGIN` (`https://…`), derivado de `domain` (`sensitive = true`). Terraform lo escribe en la configuración de la función, visible para quien lea Lambda en la cuenta y guardada en claro en el estado (como el resto de lo personal, riesgo de P5 ya aceptado). No es un secreto. Lo anoto para que conste y para que el test de «sensibles» no lo confunda con un `output`. *No requiere decisión salvo que prefieras otra cosa.*

**P-5. Lista cerrada de comodines de `Resource: "*"`.** Para que el rol de `plan` refresque CloudFront, ACM, WAF y Budgets harán falta `List*`/`Describe*` que no admiten recurso. Propongo que cada una entre solo con su fuente de la *Service Authorization Reference* (E1 b0.2/b0.9) y que lo que no tenga fuente no entre. Si el `plan` no puede refrescar sin una acción sin fuente, **lo pregunto** en lugar de ensanchar.

**P-6. Región de la activación de etiqueta y de Budgets.** Cost Explorer y Budgets son globales con *endpoint* en `us-east-1`; el proveedor de la parte de la cuenta necesitará el alias de `us-east-1` y el límite de permisos no interviene (los aplica el principal de administración, sin límite). Lo confirmo en E1 b0.8; si el principal de administración llevase un límite propio, sería otra pregunta.

**P-7. Arquitectura `arm64` (prompt §11.2 d).** Propuesta `arm64` si los ZIP no llevan binarios nativos (se comprueba en E2). Confirmo que prefieres `arm64` sin más.

**P-8. Memoria y `timeout` de la API (§11.2 e).** Propuesta 256 MB y 30 s, sin medir (la 018 ajusta). Sin objeción asumida.

## Cosas del prompt que he notado y no bloquean

- §10 dice «las diecisiete familias» y §9 numera de la 1 a la 20 con huecos: son 7 heredadas de la 016 (1, 2, 4, 6, 7, 9, 10) y 10 nuevas (11 a 20). El spec usa «diecisiete».
- El prompt nombra la rama `017-infrastructure-as-code` para el worktree; el worktree real es `.claude/worktrees/017-iac`, la rama `feature/017-infrastructure-as-code`.
- `docs/runbooks/` ya existe en `develop` (mail-recipient-and-amounts, cloud-symbols-and-budgets); sus nombres de variable (`mail_recipient`, `mail_amounts`) se mantienen y los de los presupuestos de la nube se fijan en `contracts/variables.md`.
- La política del bucket de datos y los roles se referencian por nombre, no por recurso, para evitar ciclos y para que el bucket del estado y el de artefactos se creen antes que los roles (N3 y B6 del prompt).

## Lo que la dirección tendrá que actualizar (se irá completando)

ADR-0028 (PR del proveedor, KMS, CSP/`sandbox`, plan Free), ADR-0034 (lo que cierre el bloque 0 y las excepciones del límite que falten), ADR-0033, ADR-0027, `docs/decision-roadmap.md`, `docs/specification.md` §9.3, §11.4, §11.6, `docs/dependencies.md`, `docs/runbooks/`, runbooks de la 016, `CLAUDE.md` (si cambia *Where things live*), `docs/prompts/README.md`.

## Estado

- Spec: `spec.md` (3ede8f5). Plan y artefactos de diseño: esta entrega. **Sin código, sin `.tf`, sin ninguna llamada a AWS, sin `terraform plan/apply/import`.** El bloque 0 de E1 queda sin ejecutar hasta el visto bueno.

# Crear y rotar los secretos de un entorno (`atlas admin secrets`)

Feature 017, E4 (ADR-0034, fila 21). **Los valores de los secretos nunca pasan por Terraform**: los crea y los rota esta orden de la consola, con el rol `atlas-<entorno>-admin`. Nada de esto se ejecuta contra AWS en la 017: se ensayó con dobles (`apps/cli/test/admin/secrets.test.ts`); la primera ejecución real es de la 018.

## Antes

- Una sesión ya abierta del rol de administración del entorno, con MFA (`docs/runbooks/revoke-all-tokens.md`, «Antes de empezar»), y `~/.config/atlas/admin.json` con el entorno.
- Una terminal interactiva. **Sin terminal la orden sale sin tocar nada** (código 4).

## Pasos

1. `atlas admin secrets --env dev` (o `prod`). **No acepta ningún valor en la línea de órdenes, ni por variable de entorno, ni `--yes`**: lo pide, uno a uno, sin eco.
2. Para cada parámetro dice si **ya existe** (lo pregunta a SSM sin descifrar, P-3) y pide el valor. **Enter lo deja como está.** Los que crea: `auth/allow-list` (se escribe **entera**: retirar el acceso es no incluir la entrada del `sub`, no cambiarle el correo), `auth/google-client-id` (`String`), `auth/google-client-secret`, `auth/session-key` (32 bytes aleatorios en base64url, generada aquí y nunca mostrada), `prices/eodhd-key` y `prices/alpha-vantage-key` (**`dev` no las lleva**, ADR-0034, fila 2).
3. **Sobrescribir pide teclear el nombre del entorno.** Rotar la clave de sesión cierra todas las sesiones abiertas.
4. Los parámetros nuevos llevan las etiquetas `project=atlas`, `env=<entorno>` y `managed_by=atlas-admin-secrets`; al rotar, se vuelven a poner.
5. El resumen dice por parámetro `creado`, `sobrescrito` o `no se toca`. **Nunca un valor**, tampoco si AWS falla (el mensaje de error de AWS no se copia).

## Lo que no hace

Nunca crea `mail/recipient` ni `mail/amounts` (son de Terraform), ni los registros de `device-tokens/` (son de la API). El token Flex de IBKR no tiene todavía nombre de parámetro en ningún contrato: no está en la orden.

## Si no hay terminal o la orden no está

Los procedimientos `stolen-google-account.md` y `revoke-all-tokens.md` conservan su alternativa con la CLI de AWS; el valor va por un fichero `600` que se borra, nunca en la línea de órdenes.

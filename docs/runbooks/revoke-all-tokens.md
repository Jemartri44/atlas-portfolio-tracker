# Revocar todos los tokens de consola sin Google

**Cuándo**: sospechas que alguien tiene un token de consola tuyo y no puedes, o no quieres, entrar con Google para revocarlos uno a uno desde la web. Es el paso 3 de [Recuperar una cuenta de Google robada](stolen-google-account.md).

**Qué hace**: revoca **todos** los registros vivos de `/atlas/<entorno>/device-tokens/` en SSM.
- Usa el **mismo código** que la API al revocar (`revokedRecord`, ADR-0033, punto 8; `docs/prompts/015-api-access.md` §7 P4).
- Un registro ya revocado **se deja como está**, con su fecha, así que se puede repetir sin daño.
- **Nunca borra** un registro: un registro borrado dejaría de poder negarse (ADR-0033, punto 9).

**Lo que necesitas**: las credenciales de vida corta del rol `atlas-<entorno>-admin`, con MFA (ADR-0034, fila 16). La consola las toma de la **cadena estándar del SDK de AWS** y no guarda nada. Tienen que venir **de una sesión ya abierta**, según quién asuma el rol (la comprobación **C5 de ADR-0034, SIN VERIFICAR, de la 018**):

- **Con IAM Identity Center**: abre la sesión con `aws sso login --profile atlas-prod-admin`, que pide el MFA. Después usa `AWS_PROFILE=atlas-prod-admin` en cada orden.
- **Con un usuario IAM con MFA**: el perfil de `~/.aws/config` lleva `role_arn`, `source_profile` y `mfa_serial`.
  - La CLI de AWS pide el código MFA al usar ese perfil y guarda la sesión en `~/.aws/cli/cache` (*AWS CLI User Guide*, «Using an IAM role in the AWS CLI»).
  - Exporta esa sesión **en una subshell**, entre paréntesis, y ejecuta la orden dentro. Así las credenciales mueren con la subshell y no las hereda nada más de tu terminal:
    ```sh
    ( eval "$(aws configure export-credentials --profile atlas-prod-admin --format env)"
      atlas admin revoke-all-tokens --env prod )
    ```
  - **No basta con `AWS_PROFILE=atlas-prod-admin` para `atlas`**. El SDK de JavaScript no tiene cómo pedir el código: se niega con `admin_aws_refused (CredentialsProviderError)` antes de llamar a AWS (probado con el SDK, sin AWS: `apps/cli/test/admin/environment.test.ts`).

En los ejemplos de abajo, `AWS_PROFILE=atlas-prod-admin` vale tal cual con IAM Identity Center. Con un usuario IAM, quítalo y ejecuta cada orden dentro de la subshell de arriba.

Y `~/.config/atlas/admin.json`, que escribes tú y la aplicación nunca escribe (`specs/015-api-access/data-model.md` §9; `docs/data-schema.md` §1):

```json
{ "admin_format": 1, "environments": { "prod": { "region": "eu-west-1", "data_bucket": "atlas-prod-data-<sufijo>", "ssm_prefix": "/atlas/prod/" } } }
```

---

## 1. Con la consola (lo normal)

```sh
AWS_PROFILE=atlas-prod-admin atlas admin revoke-all-tokens --env prod
```

Dice cuántos ha revocado y cuántos ya lo estaban.

**Si hay registros que la consola no entiende, los nombra, no los toca y sale con un código distinto de 0.** Una consola más antigua que la API puede no entender un registro vivo, así que no se puede dar por revocado. Revísalos con el apartado 2, cuyo paso 4 mira el JSON en crudo.

**Compruébalo repitiendo la orden.** Tiene que decir «Revocados 0 tokens», **sin ningún registro sin entender**, y salir con 0 (`echo $?`).

**Después**, cada consola tuya vuelve a entrar con **dos** `atlas remote login`: el primero choca con el token revocado y lo quita, y el segundo da un token nuevo al mismo dispositivo de la carpeta, con confirmación en la página.

*Probado*: contra los dobles de SSM (`apps/cli/test/admin/admin.test.ts`). La API rechaza después cada token con `device_token_revoked`, repetir la orden no escribe nada, y un registro ilegible hace salir con 1. *Sin probar*: contra AWS real (018).

## 2. Con la CLI de AWS (si la consola de Atlas no está disponible)

Cada registro es **un** `SecureString` cuyo valor es un objeto JSON en una línea (`specs/015-api-access/data-model.md` §2). Revocarlo es **añadirle `"revoked_at"`** al final, con el instante en UTC, **sin milisegundos**, y sin tocar nada más:

```json
{"token_record_format":1,"token_id":"…","secret_sha256":"…","sub":"…","email":"…","device_id":"…","device_name":"…","issued_at":"2026-10-01T10:00:00Z","expires_at":"2026-12-30T10:00:00Z","revoked_at":"2026-10-05T09:30:00Z"}
```

Las órdenes de abajo son de `sh` **POSIX**: valen en `bash`, en `zsh` y en `dash`, que es el `sh` de Ubuntu. Ningún valor pasa por `echo`, que en `dash` y en `zsh` interpreta `\` y `\n` y rompería un registro con un `device_name` que los lleve. Un solo programa de `jq` lee y reescribe cada registro.

1. Asume el rol como arriba (`export AWS_PROFILE=atlas-prod-admin`, o dentro de la subshell).
2. Revoca los vivos, solo los que no tienen ya `revoked_at`, con un único instante:
   <!-- ensayo: revocar -->
   ```sh
   AHORA=$(date -u +%Y-%m-%dT%H:%M:%SZ)
   aws ssm get-parameters-by-path --path /atlas/prod/device-tokens/ --with-decryption --output json |
     jq -r --arg t "$AHORA" '.Parameters[]
       | (.Value | try fromjson catch null) as $r
       | select(($r | type) == "object" and ($r | has("revoked_at") | not))
       | .Name, ($r + {revoked_at: $t} | tojson)' |
     while read -r nombre && read -r nuevo; do
       aws ssm put-parameter --name "$nombre" --type SecureString --overwrite --value="$nuevo"
     done
   ```
   - `tojson` escribe el objeto compacto, deja las claves en su orden y pone `revoked_at` al final. Es la misma forma que escribe la API.
   - Cada registro sale en dos líneas, el nombre y el valor. Un salto de línea dentro del registro sale escapado, como `\n`, así que el par no se descuadra.
   - `--value=` va pegado: un valor que empezara por `-` se tomaría por una opción.
   - Un registro que no es JSON se salta aquí, y el paso 3 lo cuenta.
   - **Nunca uses `delete-parameter` ni etiquetas de versión** (ADR-0033, punto 9).
3. Comprueba que no queda ninguno sin `revoked_at`, y ninguno que no se pueda leer:
   <!-- ensayo: comprobar -->
   ```sh
   aws ssm get-parameters-by-path --path /atlas/prod/device-tokens/ --with-decryption --output json |
     jq '[.Parameters[].Value | try fromjson catch null
          | select(type != "object" or (has("revoked_at") | not))] | length'
   ```
   Tiene que dar `0`. Si no, uno está vivo o no se puede leer: míralo a mano con `aws ssm get-parameter --with-decryption --name <nombre>`.

*Probado sin AWS*, con `dash` y una `aws` simulada (`tests/runbook-revoke-all.test.ts`, que ejecuta los dos bloques de arriba tal como están aquí):
- el paso 2 escribe **los mismos bytes** que `revokedRecord` y `serializeTokenRecord` de la API, con un `device_name` que lleva acentos, comillas, una barra invertida y un salto de línea;
- deja como están los ya revocados y los que no se pueden leer;
- el paso 3 cuenta el que no se puede leer.

*Sin probar*: las llamadas a `aws ssm`, contra AWS real (018).

## 3. El *root*, solo para desbloquear

La cuenta *root* de AWS **no puede asumir el rol de administración**. En la *IAM User Guide*, *Compare AWS STS credentials*, «Who can call» de `AssumeRole` es «IAM user or IAM role with existing temporary security credentials»; para `GetSessionToken`, en cambio, «IAM user or AWS account root user».

Así que el *root* **solo sirve para desbloquear** (ADR-0034, fila 16):
- reescribir la política de un bucket que deja fuera a todos los principales de Atlas;
- o revocar directamente en SSM, con la consola web de AWS, editando cada parámetro como en el apartado 2.

**No lo uses para el día a día.**

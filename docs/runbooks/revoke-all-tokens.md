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
  - Exporta esa sesión a la terminal y ejecuta la orden:
    ```sh
    eval "$(aws configure export-credentials --profile atlas-prod-admin --format env)"
    atlas admin revoke-all-tokens --env prod
    ```
  - **No basta con `AWS_PROFILE=atlas-prod-admin` para `atlas`**. El SDK de JavaScript no tiene cómo pedir el código: se niega con `admin_aws_refused (CredentialsProviderError)` antes de llamar a AWS (probado con el SDK, sin AWS: `apps/cli/test/admin/environment.test.ts`).

En los ejemplos de abajo, `AWS_PROFILE=atlas-prod-admin` vale tal cual con IAM Identity Center. Con un usuario IAM, quítalo y exporta antes la sesión como arriba.

Y `~/.config/atlas/admin.json`, que escribes tú y la aplicación nunca escribe (`specs/015-api-access/data-model.md` §9; `docs/data-schema.md` §1):

```json
{ "admin_format": 1, "environments": { "prod": { "region": "eu-west-1", "data_bucket": "atlas-prod-data-<sufijo>", "ssm_prefix": "/atlas/prod/" } } }
```

---

## 1. Con la consola (lo normal)

```sh
AWS_PROFILE=atlas-prod-admin atlas admin revoke-all-tokens --env prod
```

Dice cuántos ha revocado y cuántos ya lo estaban. Si hay registros ilegibles, los nombra y no los toca: la API ya los rechaza.

Compruébalo repitiendo la orden. Tiene que decir «Revocados 0 tokens».

*Probado*: contra los dobles de SSM (`apps/cli/test/admin/admin.test.ts`). La API rechaza después cada token con `device_token_revoked`, y repetir la orden no escribe nada. *Sin probar*: contra AWS real (018).

## 2. Con la CLI de AWS (si la consola de Atlas no está disponible)

Cada registro es **un** `SecureString` cuyo valor es un objeto JSON en una línea (`specs/015-api-access/data-model.md` §2). Revocarlo es **añadirle `"revoked_at"`** al final, con el instante en UTC, **sin milisegundos**, y sin tocar nada más:

```json
{"token_record_format":1,"token_id":"…","secret_sha256":"…","sub":"…","email":"…","device_id":"…","device_name":"…","issued_at":"2026-10-01T10:00:00Z","expires_at":"2026-12-30T10:00:00Z","revoked_at":"2026-10-05T09:30:00Z"}
```

1. Asume el rol como arriba (`export AWS_PROFILE=atlas-prod-admin`).
2. Fija el instante una vez:
   ```sh
   AHORA=$(date -u +%Y-%m-%dT%H:%M:%SZ)
   ```
3. Revoca los vivos. Solo los que no tienen ya `revoked_at`:
   ```sh
   aws ssm get-parameters-by-path --path /atlas/prod/device-tokens/ --with-decryption \
     --query 'Parameters[].[Name,Value]' --output json |
   jq -c '.[]' | while read -r par; do
     nombre=$(echo "$par" | jq -r '.[0]')
     valor=$(echo "$par" | jq -r '.[1]')
     if echo "$valor" | jq -e 'has("revoked_at")' >/dev/null; then continue; fi
     nuevo=$(echo "$valor" | jq -c --arg t "$AHORA" '. + {revoked_at: $t}')
     aws ssm put-parameter --name "$nombre" --type SecureString --overwrite --value "$nuevo"
   done
   ```
   `jq -c` escribe el objeto compacto y deja las claves en su orden, con `revoked_at` al final. Es la misma forma que escribe la API. **Nunca uses `delete-parameter` ni etiquetas de versión** (ADR-0033, punto 9).
4. Comprueba que ninguno queda sin `revoked_at`:
   ```sh
   aws ssm get-parameters-by-path --path /atlas/prod/device-tokens/ --with-decryption \
     --query 'Parameters[].Value' --output json | jq '[.[] | fromjson | select(has("revoked_at") | not)] | length'
   ```
   Tiene que dar `0`.

*Probado sin AWS*: el paso de `jq` sobre un registro escrito por `serializeTokenRecord` da **los mismos bytes** que `revokedRecord`, con un `device_name` con acentos y comillas; y `has("revoked_at")` reconoce uno ya revocado. *Sin probar*: las llamadas a `aws ssm`, contra AWS real (018).

## 3. El *root*, solo para desbloquear

La cuenta *root* de AWS **no puede asumir el rol de administración**. En la *IAM User Guide*, *Compare AWS STS credentials*, «Who can call» de `AssumeRole` es «IAM user or IAM role with existing temporary security credentials»; para `GetSessionToken`, en cambio, «IAM user or AWS account root user».

Así que el *root* **solo sirve para desbloquear** (ADR-0034, fila 16):
- reescribir la política de un bucket que deja fuera a todos los principales de Atlas;
- o revocar directamente en SSM, con la consola web de AWS, editando cada parámetro como en el apartado 2.

**No lo uses para el día a día.**

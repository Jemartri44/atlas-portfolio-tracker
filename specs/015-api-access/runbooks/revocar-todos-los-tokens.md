# Revocar todos los tokens de consola sin Google

**Cuándo**: sospechas que alguien tiene un token de consola tuyo y no puedes, o no quieres, entrar con Google para revocarlos uno a uno desde la web. Es el paso 3 de «Recuperar una cuenta de Google robada».

**Qué hace**: revoca **todos** los registros vivos de `/atlas/<entorno>/device-tokens/` en SSM.
- Usa el **mismo código** que la API al revocar (`revokedRecord`, ADR-0033, punto 8; §7 P4).
- Un registro ya revocado **se deja como está**, con su fecha, así que se puede repetir sin daño.
- **Nunca borra** un registro: un registro borrado dejaría de poder negarse (ADR-0033, punto 9).

**Lo que necesitas**: las credenciales de vida corta del rol `atlas-<entorno>-admin`, con MFA (ADR-0034, fila 16). Salen de la **cadena estándar del SDK de AWS**, y la consola no guarda nada:
- un perfil de `~/.aws/config` con `role_arn`, `source_profile` y `mfa_serial`. El SDK de JavaScript v3 lo admite y te pide el código MFA; está en la tabla «Support by AWS SDKs and tools» de la *AWS SDKs and Tools Reference Guide*, *Assume role credential provider*;
- o las variables de entorno de una sesión ya asumida, por ejemplo `AWS_PROFILE=atlas-prod-admin`.

Quién asume el rol (IAM Identity Center o un usuario IAM con MFA) es la comprobación **C5 de ADR-0034, SIN VERIFICAR, de la 018**. Este procedimiento vale para las dos variantes.

Y `~/.config/atlas/admin.json`, que escribes tú y la aplicación nunca escribe (`data-model.md` §9):

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

Cada registro es **un** `SecureString` cuyo valor es un objeto JSON en una línea (`data-model.md` §2). Revocarlo es **añadirle `"revoked_at"`** al final, con el instante en UTC, **sin milisegundos**, y sin tocar nada más:

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

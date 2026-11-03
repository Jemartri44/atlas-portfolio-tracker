# Recuperar una cuenta de Google robada

**Cuándo**: alguien ha entrado en la cuenta de Google con la que entras en Atlas, o lo sospechas. **Cerrar la sesión en Google no cierra Atlas**: Atlas tiene su propia sesión web, de hasta 24 horas.

## 0. Primero, si aún puedes entrar: cerrar todas las sesiones

En la web, **Ajustes › Sesión › «Cerrar sesión en todos los dispositivos»** (`POST /api/auth/logout-all`, `docs/api.md` §3; ADR-0037). Echa al intruso **en el acto**, y a ti también. **No le impide volver a entrar** mientras tenga la cuenta de Google: para eso son los pasos de abajo.

## Después, estos cinco pasos, en este orden

Lo que necesitas es el rol de administración y `admin.json`, como en [Restaurar el libro](restore-the-ledger.md), apartado «Lo que necesitas». Si repones la cuenta (paso 5) antes de terminar el 4, el intruso puede volver a entrar.

### 1. Quitar tu cuenta de la lista permitida

- La lista vive en SSM, en `/atlas/<entorno>/auth/allow-list` (`{"allow_list_format":1,"entries":[{"sub":"…","email":"…"}]}`), y la escribe el guion de secretos ([atlas-admin-secrets.md](atlas-admin-secrets.md)).
- Quita la entrada de la cuenta. La API consulta la lista **en cada petición**, con una caché de como mucho 120 s (`docs/api.md` §2). Desde ahí, ninguna sesión de esa cuenta pasa (`not_allowed`).
- Sin el guion, con la CLI de AWS y el rol de administración. **El par no se escribe nunca en la línea de órdenes**, que lo dejaría en el historial: va por un fichero `600` en `~/.config/atlas/`, que se borra en el paso 5.
  ```sh
  ( umask 077
    aws ssm get-parameter --name /atlas/prod/auth/allow-list --with-decryption \
      --query Parameter.Value --output text > ~/.config/atlas/allow-list.antes.json
    cp ~/.config/atlas/allow-list.antes.json ~/.config/atlas/allow-list.json )
  "${EDITOR:-nano}" ~/.config/atlas/allow-list.json   # quita la entrada de la cuenta
  aws ssm put-parameter --name /atlas/prod/auth/allow-list --type SecureString --overwrite \
    --value "file://$HOME/.config/atlas/allow-list.json"
  ```

### 2. Recuperar la cuenta de Google

Sigue la ayuda de Google (`g.co/recover`), cambia la contraseña y revisa la verificación en dos pasos y los dispositivos con sesión abierta ([Verificación en dos pasos de Google](google-2-step-verification.md)).

### 3. Rotar la clave de sesión y esperar 5 minutos

- Rota `/atlas/<entorno>/auth/session-key` con el guion de secretos. Sin él (32 bytes aleatorios en base64url; `--value=` va pegado para que una clave que empiece por `-` no se tome por una opción):
  ```sh
  aws ssm put-parameter --name /atlas/prod/auth/session-key --type SecureString --overwrite \
    --value="$(head -c 32 /dev/urandom | basenc --base64url -w 0 | tr -d '=')"
  ```
- **Espera 5 minutos** (la caché de los secretos, `docs/api.md` §9). Desde ahí, toda cookie firmada con la clave anterior da `session_invalid`.

### 4. Revisar la nube y, si hace falta, restaurar

- **Bájala** a tu carpeta privada, nunca al repositorio, y revísala:
  ```sh
  AWS_PROFILE=atlas-prod-admin atlas admin pull --env prod --to ~/personal/atlas/privado/revision
  atlas --ledger ~/personal/atlas/privado/revision/ledger.jsonl check --deep
  ```
- **Compárala con tu última copia** sin tocar nada: `atlas admin restore` enseña en su paso 3 lo que solo tiene la nube; contesta cualquier cosa que no sea `prod` en el paso 4.
  ```sh
  AWS_PROFILE=atlas-prod-admin atlas admin restore --env prod --from <tu copia>/ledger-AAAA-MM-DD.jsonl
  ```
- **Para restaurar**, la misma orden escribiendo `prod` ([Restaurar el libro](restore-the-ledger.md)). Lo que había queda en `archive/pre-restore-…`; lo que no quieras perder, lo vuelves a registrar en la web.

### 5. Reponer tu cuenta en la lista y entrar de nuevo

```sh
aws ssm put-parameter --name /atlas/prod/auth/allow-list --type SecureString --overwrite \
  --value "file://$HOME/.config/atlas/allow-list.antes.json"
rm ~/.config/atlas/allow-list.antes.json ~/.config/atlas/allow-list.json
```

Espera los 2 minutos de la caché de la lista y entra en la web con Google.

**Si la marca de `logout-all` no se lee** (`access/sessions-valid-from.json` dañado), la API deja fuera a todos (`session_invalid`, `reason: "closed"`) hasta que la administración borra ese objeto del bucket de datos (`docs/api.md` §3).

*Ensayado con los dobles* (`apps/cli/test/admin/stolen-account.test.ts`): los pasos en este orden, con tu sesión y la del intruso sobre la misma nube; y el cierre inmediato desde la web, antes de todo lo demás. *Sin probar*: contra AWS real (018) y el editor.

---

## El caso distinto: **perder** la cuenta de Google

Si no la recuperas, porque Google la cierra o no puedes demostrar que es tuya:
1. **cambia la entrada de la lista permitida por otra cuenta tuya**, con la verificación en dos pasos activada;
2. haz los pasos 3 y 4 de arriba igualmente;
3. entra en la web con la cuenta nueva.

El libro no depende de la cuenta de Google: vive en el bucket y en las copias de tu disco (`atlas backup`, «Descargar copia»).

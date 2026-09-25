# Contrato de la consola: órdenes nuevas (PROPUESTA de nombres, §6.2 (e) y (f))

El modelo es `ARITY` (`apps/cli/src/main.ts`), con subórdenes como `lock`, `fx` y `draft`. **Toda orden es explícita**: ninguna sincroniza, inicializa, se une ni revoca como efecto de otra (ADR-0026, Parte B). Toda escritura en la carpeta del libro va bajo el cerrojo, y **nada de la red se hace con el cerrojo tomado**.

## `atlas remote …` (E2)

| Orden | Qué hace |
|---|---|
| `atlas remote login [--origin <https://…>] [--name <nombre>] [--manual]` | Inicia sesión con Google y guarda el token en `credentials.json`. El origen sale de `--origin` o, si falta, del `sync/remote.json` de la carpeta. Sin ninguno de los dos, se niega. `--name` vale por defecto el nombre de la máquina, ajustado a la regla de `device_name`; si no la cumple, se niega y pide `--name`. **Imprime siempre la URL.** Con `--manual`, lee el código sin mostrarlo en pantalla. Si la carpeta tiene `sync/remote.json` y `credentials.json` guarda la entrada de ese `device_id`, **renueva** con ese token y con ningún otro. Si la tiene y no hay entrada, **reemite** para ese `device_id` (N5). **No escribe nada en la carpeta del libro** |
| `atlas remote logout [--device <id>] [--local-only]` | Revoca en el servidor el token de la entrada de esta carpeta (la que nombra `sync/remote.json`, o la que se indique con `--device`), y **solo con el `200`** borra la entrada local. Sin el `200`, avisa de que el token sigue vivo. `--local-only` borra la entrada sin tocar el servidor, y lo dice (ADR-0033, punto 8) |
| `atlas remote status` | Las entradas de `credentials.json` de esta carpeta y de su origen: dispositivo, nombre y caducidad, **nunca el token**. Avisa si faltan 14 días o menos (`token_expiry_warning_days`, en `atlas.config.json`, por defecto 14) |

## `atlas sync …` (E3)

| Orden | Qué hace (función de la 014 que llama) |
|---|---|
| `atlas sync` | Sincroniza (`syncDevice`) con la entrada que nombra `sync/remote.json` |
| `atlas sync status` | Pendientes, retenidas, última sincronización y remoto, y el aviso de caducidad del token |
| `atlas sync held` | Lo retenido, por unidad, con su motivo (`heldUnits`) |
| `atlas sync confirm <unidad>` / `atlas sync discard <unidad> [--reversal-only]` | `confirmHeldUnit` / `discardHeldUnit` |
| `atlas sync redo <unidad>` | Enseña el plan (lo que se volverá a registrar, sobre el estado actual y con sus identificadores sellados), pide confirmación, lo registra y termina (`startRedo`, la función de N1 o `correctEvent` según el plan, y `finishRedo`). Para registrar otra cosa: descartar y registrar de nuevo |
| `atlas sync init` | Inicializa un remoto vacío con los bytes enteros (`initialiseRemote`). Solo con una entrada de `credentials.json` cuya pista sea esta carpeta |
| `atlas sync join --from-remote` / `atlas sync join --with-own-lines` | Se une (`replaceFromRemote` con `join` / `joinWithOwnLines`). Con la misma regla de la entrada. **También asocia una carpeta sincronizada que no tiene `sync/remote.json`**, nombrando el origen con `--origin` (plan §7) |
| `atlas sync redownload` | Vuelve a descargar tras una reescritura del remoto (`replaceFromRemote`). Solo cuando el usuario la pide |
| `atlas sync deactivate` | `deactivateSync`. Se niega con pendientes y conserva lo retenido |

## `atlas admin …` (E5; credenciales del rol `atlas-<entorno>-admin` por la cadena estándar, **nunca** el token y **nunca** por la API)

| Orden | Qué hace |
|---|---|
| `atlas admin compact --env <e> [--accept-unverified <filing_id>]…` | `compact` del remoto, con la negativa de `rewritePermission`, el archivo previo en `archive/` sin sobrescribir y la condición del remoto leído |
| `atlas admin restore --env <e> --from <fichero \| s3-version:<id> \| backups/<AAAA-MM>>` | Los seis pasos de ADR-0032, cada uno con su salida. El paso 4 pide la confirmación con la lista delante |
| `atlas admin forget-device --env <e> <device_id> [--force]` | Revoca sus tokens **y después** lo marca `forgotten`. Con pendientes o retenidas se niega, salvo con `--force`, que antes dice lo que se deja de ver |
| `atlas admin revoke-all-tokens --env <e>` | Revoca todos los registros vivos. Se puede repetir sin daño |
| `atlas admin devices --env <e>` | Lista los objetos de `sync/devices/`, con su tipo y su estado (para elegir cuál olvidar) |

## `atlas backup` (E5, P5)

`atlas backup --to <dir> [--from-bucket --env <e>]`:

- **Siempre**: el libro, lo retenido (014) y, además, la carpeta local `documents/`, **verificada** como el libro y sin sobrescribir nunca.
- **Con `--from-bucket`**: además copia `documents/` e `imports/` del bucket con el rol de administración, **solo leyendo**, verificando cada fichero y sin sobrescribir nunca en el destino.

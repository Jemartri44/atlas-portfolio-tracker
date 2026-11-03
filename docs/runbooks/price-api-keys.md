# Clave de la fuente de precios (EODHD)

La consola descarga los cierres diarios de tus activos desde una API gratuita con clave: **EODHD**. Esta guía explica cómo sacar la clave, dónde dejarla y cómo comprobar que la consola la lee. Tardas unos 15 minutos. Las decisiones de fondo están en ADR-0031; el formato del fichero, en `docs/data-schema.md` §1.

Sin clave, Atlas funciona igual con las valoraciones manuales (`atlas add valuation`). La clave solo añade precios automáticos, que son **informativos**: ninguna cifra de la Renta ni del Modelo 720 los lee.

**Tres reglas, antes de nada:**

1. **La clave no se le pasa a nadie.** Ni se pega en el chat, ni se le da a un asistente, ni a la dirección, ni se escribe en un documento o en un mensaje. **El asistente nunca la ve ni le hace falta**: tú la dejas en tu fichero, y la consola la lee de ahí. Ninguna orden de esta guía lleva una clave escrita.
2. **Nunca en el repositorio.** Una clave que llega a un *commit* hay que darla por perdida y cambiarla.
3. **Nunca dentro de la carpeta del libro.** Esa carpeta se copia, se exporta y un día se sincronizará; la clave no debe viajar con ella. La consola se niega a trabajar si la carpeta de la clave y la del libro están una dentro de la otra.

---

## 1. EODHD, plan Free

**Qué da:** 20 llamadas al día, con el día contado de medianoche a medianoche GMT (en Madrid, de 01:00 a 01:00 en invierno y de 02:00 a 02:00 en verano), y un año de histórico de cierres. Uso personal. **No pide tarjeta.** Comprobado el 2026-09-25 en `eodhd.com/pricing`, `eodhd.com/financial-apis/api-limits` y `eodhd.com/financial-apis/quick-start-with-our-financial-data-apis`.

1. Abre `https://eodhd.com/register`.
2. Regístrate con un correo y una contraseña, o con el botón de Google o de GitHub. Cualquiera sirve; si usas Google, que sea con la verificación en dos pasos activada ([guía](google-2-step-verification.md)).
3. Si te pide confirmar el correo, abre el mensaje que te llega y pulsa el enlace.
4. Entra en tu panel (*dashboard*). Tu clave es el **API token** que aparece allí. EODHD también la manda en el correo de bienvenida.
5. **No la copies todavía a ningún sitio.** La pegarás directamente en la terminal en el paso 2 de esta guía.

> La clave `demo` que sale en los ejemplos de la documentación de EODHD **no es la tuya**: solo sirve para seis símbolos de prueba. La tuya es la del panel.

## 2. Guardar la clave en `~/.config/atlas/secrets.json`

### El formato

Un objeto JSON con **solo esta entrada**, con texto:

```json
{"eodhd":"…"}
```

- El nombre es exactamente `eodhd`, en minúsculas. **Cualquier otro nombre hace que la consola rechace el fichero entero** (y no enseña el nombre, por si fuera la clave misma).
- Un valor vacío (`""`) no vale.
- Los permisos tienen que ser `600` (solo tú lees y escribes). **Si otros usuarios de la máquina pueden leerlo, la consola no usa la clave** y te dice el `chmod` que lo arregla.
- **La aplicación nunca escribe este fichero**: lo escribes tú, y solo tú lo cambias.

Lo lee `packages/adapters/src/prices/secrets.ts` (`readSecrets`), y la consola lo busca con `secretsPath` en `~/.config/atlas/secrets.json`, o en `$XDG_CONFIG_HOME/atlas/secrets.json` si esa variable tiene una ruta absoluta.

### Crearlo (Linux)

En la terminal de la máquina donde ejecutas la consola. El fichero va en tu `HOME`, `~/.config/atlas/secrets.json`, dentro de `~/.config/atlas/`, que queda con permisos `700`.

Copia este bloque **entero, de la `{` a la `}`**, en la terminal. Las llaves hacen que la terminal lo lea completo antes de ejecutarlo, así que las preguntas no se comen las líneas siguientes del bloque. Te pide la clave **sin enseñarla en pantalla**: pégala y pulsa Intro. La clave no queda en el historial de la terminal, y el fichero nace ya con permisos `600`.

```bash
{
D="${XDG_CONFIG_HOME:-$HOME/.config}/atlas"
mkdir -p "$D"
chmod 700 "$D"
read -rsp 'Clave de EODHD: ' KE; echo
( umask 077; printf '{"eodhd":"%s"}\n' "$KE" > "$D/secrets.json" )
unset KE
chmod 600 "$D/secrets.json"
ls -l "$D/secrets.json"
}
```

**Cuenta como «sí»:** la última línea empieza por `-rw-------`.

- **Para cambiar la clave**, vuelve a ejecutar el bloque entero: sustituye el fichero.
- Si alguna vez tienes que mirarlo, `nano "${XDG_CONFIG_HOME:-$HOME/.config}/atlas/secrets.json"` desde la terminal.

> **Nota, solo si usas WSL:** hazlo en la terminal de WSL (Ubuntu), no en PowerShell ni en `cmd`. El fichero va en el `HOME` de Linux, `/home/<tu usuario>/.config/atlas/secrets.json`, **no** en `C:\Users\…` ni en `/mnt/c/…`: en las unidades de Windows los permisos de Linux no funcionan como aquí, el fichero suele aparecer abierto a todos y la consola no usaría la clave. **No lo abras con el Bloc de notas de Windows** a través de `\\wsl.localhost`: puede cambiar los finales de línea o dejar una copia.
>
> **El límite de WSL, dicho claro:** el `600` protege frente a otros usuarios de Linux, pero **no frente a un programa de Windows de tu mismo usuario**, que puede leer el fichero a través de `\\wsl$` o `\\wsl.localhost`. Es el mismo límite que ya tiene el libro. Lo que protege aquí es tu cuenta de Windows.

> **`${XDG_CONFIG_HOME:-$HOME/.config}`** es `~/.config`, salvo que la variable `XDG_CONFIG_HOME` tenga algo: entonces la consola busca la clave en `$XDG_CONFIG_HOME/atlas/secrets.json`, y el bloque la escribe ahí mismo. Lo normal es que `echo $XDG_CONFIG_HOME` no escriba nada. Las órdenes de esta guía usan esa misma expresión para dar siempre con el fichero que lee la consola.

### Windows sin WSL

El proyecto se usa desde Linux, y es lo recomendado. Si algún día ejecutas la consola directamente en Windows, el fichero va en `%USERPROFILE%\.config\atlas\secrets.json`, con el mismo contenido. **En Windows la consola no puede comprobar los permisos**, así que no hay `chmod` que valga: lo que protege el fichero es que esté dentro de tu carpeta de usuario y que nadie más use tu cuenta de Windows.

## 3. Comprobar que la consola la lee

Se hace en una **carpeta de prueba** con un libro sintético, nunca en la de tu libro. La consola no está en el `PATH`: se ejecuta con Node desde tu clon del repositorio, después de compilarlo.

### Antes: pon al día tu clon y compílalo (obligatorio)

**Hazlo siempre, aunque ya lo compilaras otro día.** Una compilación de antes de la feature 013 no conoce las órdenes de precios, y lo que sigue fallaría con «comando desconocido: prices». Si tu clon no está en `~/personal/atlas/atlas-portfolio-tracker`, cambia la primera línea.

Primero, mira si el clon tiene cambios sin guardar:

```bash
REPO=~/personal/atlas/atlas-portfolio-tracker
cd "$REPO" && git status --short
```

**Si escribe algo, para aquí**: tienes cambios sin guardar en el clon, y cambiar de rama podría mezclarlos. Si no escribe nada, trae `develop` y compila (`npm ci` reinstala las dependencias **de tu clon**, sin tocar nada fuera de él; tarda un par de minutos):

```bash
cd "$REPO" && git switch develop && git pull
npm ci && npm run build
echo "salida $?"
```

**Cuenta como «sí»:** la última línea es `salida 0`.

### El libro de prueba

En la misma terminal. La primera línea conserva la ruta de tu clon que pusiste en «Antes»; si abres otra terminal, vuelve a ejecutar antes la línea `REPO=…` de «Antes», con tu ruta:

```bash
REPO="${REPO:-$HOME/personal/atlas/atlas-portfolio-tracker}"
P=~/atlas-prueba-claves
atlas() { node "$REPO/apps/cli/dist/main.js" --ledger "$P/ledger.jsonl" "$@"; }
mkdir -p "$P"
atlas synth --out "$P/ledger.jsonl"
```

### 3a. Que el fichero se lee (no gasta cupo)

```bash
atlas prices update
echo "salida $?"
```

El libro de prueba no tiene ningún símbolo declarado, así que **no se llama a nadie**; la consola solo lee tu clave.

**Cuenta como «sí»:** una tabla con cada activo «sin símbolo declarado (sin gastar cupo)», la última línea **`Cupo que queda hoy: EODHD 20.`** y `salida 0`.

Si no sale eso, lo que dice la consola (nunca enseña una clave):

| Mensaje | Qué pasa | Qué hacer |
|---|---|---|
| «Error de uso: comando desconocido: prices», con `salida 64` | La consola compilada es anterior a las órdenes de precios | Repite «Antes: pon al día tu clon y compílalo», al principio de este paso |
| «No hay claves de fuentes de precios configuradas», **solo** | No encuentra el fichero (si antes sale el aviso de permisos, manda la fila siguiente) | Comprueba la ruta con `ls -l "${XDG_CONFIG_HOME:-$HOME/.config}/atlas/secrets.json"`; si no está, créalo con el bloque del paso 2 |
| «No se usan las claves de …: otros usuarios de la máquina pueden leer ese fichero», seguido de «No hay claves…» y `salida 1` | Permisos distintos de `600`. **Este aviso manda sobre «No hay claves…»**: el fichero existe, pero la consola no lo usa | La orden `chmod 600 …` que da el propio mensaje, con la ruta del fichero |
| «… no se puede leer como JSON» | Falta una comilla, sobra una coma… | Vuelve a crearlo con el bloque del paso 2 |
| «la entrada número N no es una clave que se conozca» | Un nombre que no es `eodhd` (cualquier otro, `alpha_vantage` incluido, se rechaza) | Vuelve a crearlo con el bloque del paso 2 |
| «el valor de «eodhd» no es una clave» | Un valor vacío | Vuelve a crearlo; pega la clave antes de pulsar Intro |
| «el fichero de claves … y la carpeta del libro están uno dentro del otro» | Tu libro está dentro de `~/.config/atlas`, o al revés | Separa las dos carpetas |

### 3b. Que EODHD acepta la clave (gasta 1 llamada)

Opcional; la prueba de la 013 lo vuelve a comprobar. Le da a un activo del libro de prueba un ETF europeo real:

```bash
atlas prices symbols set ast_world --currency EUR --eodhd IWDA.AS
echo "salida $?"
```

**Cuenta como «sí»:** sale «Símbolos de ast_world guardados en prices/symbols.json (EODHD en …)», `salida 0` y **ninguna línea «Sin contrastar con EODHD»**. Si sale esa línea, la consola **no ha leído tu clave** (o no tenía cupo) y no ha llamado a nadie, aunque diga «guardados» y salga con 0: vuelve a 3a.

Si falla, sale una línea «Error: EODHD … al confirmar el símbolo: no se ha guardado nada. Vuelve a intentarlo más tarde.» y `salida 1`. **Solo un mensaje dice que la clave está mal:**

| Lo que dice tras «Error: EODHD» | Qué significa | Qué hacer |
|---|---|---|
| «ha rechazado la clave» | **La clave está mal** (mal copiada, incompleta o de otra cuenta) | Vuelve al paso 2 y créala de nuevo. No reintentes antes: cada intento gasta una llamada |
| «no tiene ese símbolo (o la clave no da acceso a él)» | EODHD no sirve ese símbolo con tu plan. **No dice que la clave esté mal** | Anótalo y sigue con la 013 |
| «ha limitado las llamadas» | Cupo de EODHD agotado o demasiadas llamadas seguidas | Anótalo y sigue otro día |
| «no responde» | Sin conexión, o EODHD caído | Comprueba tu conexión; si sigue, anótalo y sigue con la 013 |
| «ha respondido algo que no se entiende» | EODHD ha contestado algo inesperado | Anótalo y sigue con la 013 |

Ninguno de esos mensajes enseña la clave: se pueden copiar tal cual. Si la consola dice que EODHD da otra divisa y te pide confirmar, responde `N`: aquí solo se comprueba la clave.

### 3c. Limpiar

```bash
rm -rf ~/atlas-prueba-claves
```

Solo la carpeta de prueba. La clave se queda en `~/.config/atlas/secrets.json`.

## 4. El paso siguiente

Con la clave en su sitio, lo que falta por comprobar con ella (qué cubre el plan gratuito: ETP de bitcoin, índices, `EUFUND`) está en [`first-deploy-checks.md`](../first-deploy-checks.md), «Precios de EODHD con tu clave». Gasta el mismo cupo diario que la tarea de la nube, así que se hace un día en que ella no corra.

## Más adelante (nube)

En la nube la descarga diaria la hace una tarea programada, y allí **la clave va en SSM Parameter Store como `SecureString`** (`/atlas/<entorno>/prices/eodhd-key`, [`docs/api.md`](../api.md) §9), nunca en el bucket de datos ni en el repositorio. La sube `atlas admin secrets` ([`atlas-admin-secrets.md`](atlas-admin-secrets.md)). Tu fichero local no cambia con la nube.

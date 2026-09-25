# Prueba real de los precios de cierre (feature 013)

La feature 013 está construida y probada con dobles: ningún test ha hablado nunca con EODHD ni con Alpha Vantage. **Solo se da por verificada con tus claves**, y esta prueba la haces tú, en tu máquina. Tiene dos partes, en **dos días distintos**, porque las dos gastan el mismo cupo gratuito de EODHD (20 llamadas al día):

- **Parte A** (unos 5 minutos, 7 llamadas de EODHD): cuatro preguntas directas a EODHD que nadie ha podido contestar sin tu clave.
- **Parte B** (unos 30 minutos, unas 10 llamadas de EODHD y 3 de Alpha Vantage): la aplicación entera con las claves, en una carpeta de prueba.

El día de EODHD empieza a medianoche GMT, que en Madrid es la **01:00 en invierno** y las **02:00 en verano**. Haz la parte B después de esa hora del día siguiente, o más tarde.

**Tres reglas para toda la prueba:**

1. **No le pases tus claves a nadie**, ni a la dirección ni a un asistente. Ninguna orden de esta guía lleva una clave escrita: la leen de tu fichero. Nunca escribas una clave en un documento ni en un mensaje.
2. **No copies tus ISIN** en lo que devuelvas: de los fondos, solo el recuento.
3. **Todo en la carpeta de prueba**, `~/atlas-prueba-013`, nunca en la de tu libro. El libro de prueba es sintético, con activos inventados; aquí solo se les da un símbolo real para que haya algo que descargar.

Lo que tienes que devolver está en la plantilla del final. Registro de la feature: [`specs/013-daily-close-prices/questions.md`](../../specs/013-daily-close-prices/questions.md) (§1.8 y §8); las decisiones, en ADR-0031, tercera enmienda.

---

## Antes de empezar (una sola vez)

### 1. Crea las dos claves gratuitas

- EODHD, plan Free: `https://eodhd.com/register`
- Alpha Vantage, plan gratuito: `https://www.alphavantage.co/support/#api-key`

### 2. Guárdalas fuera de la carpeta del libro, solo legibles por ti

Copia esto en una terminal. Te pide las dos claves **sin enseñarlas en pantalla** (pégalas y pulsa Intro), y el fichero nace ya con permisos `600`. Las claves no quedan en el historial de la terminal.

```bash
mkdir -p ~/.config/atlas
read -rsp 'Clave de EODHD: ' KE; echo
read -rsp 'Clave de Alpha Vantage: ' KA; echo
( umask 077; printf '{"eodhd":"%s","alpha_vantage":"%s"}\n' "$KE" "$KA" > ~/.config/atlas/secrets.json )
unset KE KA
ls -l ~/.config/atlas/secrets.json
```

**Cuenta como «sí»:** la última línea empieza por `-rw-------`. Si no, ejecuta `chmod 600 ~/.config/atlas/secrets.json`: la consola **se niega a usar** un fichero de claves que otros pueden leer, y te lo dice.

> Si en tu terminal `echo $XDG_CONFIG_HOME` escribe algo, la consola busca las claves en esa carpeta (`$XDG_CONFIG_HOME/atlas/secrets.json`), no en `~/.config`. Lo normal es que no escriba nada.

### 3. Pon al día el repositorio y compílalo

La consola no está en el `PATH`: se ejecuta con Node desde tu clon del repositorio, después de compilarlo. Si tu clon no está en `~/projects/atlas-portfolio-tracker`, cambia la primera línea.

**3a. Mira primero si el clon tiene cambios sin guardar:**

```bash
REPO=~/projects/atlas-portfolio-tracker
cd "$REPO" && git status --short
```

**Si escribe algo, para aquí** y no sigas: tienes cambios sin guardar en el clon, y cambiar de rama podría mezclarlos. Si no escribe nada, sigue.

**3b. Trae `develop` y compila.** `npm ci` borra y reinstala las dependencias **de tu clon** (la carpeta `node_modules`), sin tocar nada fuera de él; tarda un par de minutos.

```bash
cd "$REPO" && git switch develop && git pull
npm ci && npm run build
echo "salida $?"
```

**Cuenta como «sí»:** la última línea es `salida 0`.

---

## Parte A — Cuatro comprobaciones directas contra EODHD (día 1)

Siete llamadas. En la misma terminal:

```bash
K=$(node -p "require('$HOME/.config/atlas/secrets.json').eodhd")
cuenta() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let a;try{a=JSON.parse(s)}catch{console.log("La respuesta no es JSON: clave mala, fuera del plan o sin cupo.");return}if(!Array.isArray(a)){console.log("La respuesta no es una lista: EODHD ha contestado otra cosa (un error o un aviso). No la copies; anota solo que pasó.");return}const w=process.argv[1].split(",");console.log("filas:",a.length,"· tuyas:",a.filter(r=>r&&(w.includes(r.Code)||w.includes(r.Isin))).length)})' "$1"; }
```

**A1. ¿Entran los índices en el plan gratuito?**

```bash
curl -s -o /dev/null -w 'GSPC.INDX %{http_code}\n' "https://eodhd.com/api/eod/GSPC.INDX?api_token=$K&fmt=json&from=2026-09-01&to=2026-09-05"
curl -s -o /dev/null -w 'STOXX50E.INDX %{http_code}\n' "https://eodhd.com/api/eod/STOXX50E.INDX?api_token=$K&fmt=json&from=2026-09-01&to=2026-09-05"
```

Anota los dos códigos. `200` es que sí; `403`, que la clave no da acceso.

**A2. ¿Cuántos de tus fondos cubre `EUFUND`?** Sustituye `ISIN1,ISIN2` por los ISIN de tus fondos, separados por comas y sin espacios, **en los dos sitios** de la orden:

```bash
curl -s "https://eodhd.com/api/exchange-symbol-list/EUFUND?api_token=$K&fmt=json&symbols=ISIN1,ISIN2" | cuenta ISIN1,ISIN2
```

Anota **solo** el número que sale después de «tuyas» (no los ISIN). Si «filas» es muy grande (decenas de miles), el filtro `symbols=` no funciona en `EUFUND` y el recuento se ha hecho igual sobre la lista entera: anótalo también.

Y si «tuyas» es 1 o más, si el plan gratuito sirve sus cierres (pon uno de los ISIN cubiertos en lugar de `ISIN1`):

```bash
curl -s -o /dev/null -w 'EUFUND eod %{http_code}\n' "https://eodhd.com/api/eod/ISIN1.EUFUND?api_token=$K&fmt=json&from=2026-09-01&to=2026-09-05"
```

**A3. ¿En qué unidad llegan los cierres de Londres?** Con Tesco (`TSCO`), una acción de Londres que Alpha Vantage da en `GBX`, peniques (`questions.md` §1.4):

```bash
curl -s "https://eodhd.com/api/eod/TSCO.LSE?api_token=$K&fmt=json&from=2026-09-01&to=2026-09-05"; echo
curl -s "https://eodhd.com/api/exchange-symbol-list/LSE?api_token=$K&fmt=json&symbols=TSCO"; echo
```

Anota el `close` del primer día de la primera respuesta y el `Currency` de la segunda. Un cierre de **cientos** está en peniques; uno de **unidades**, en libras. Lo que se quiere saber es si el cierre va en peniques mientras el listado dice `GBP`.

**A4. ¿Entra la cripto en el plan gratuito?**

```bash
curl -s -o /dev/null -w 'BTC-EUR.CC %{http_code}\n' "https://eodhd.com/api/eod/BTC-EUR.CC?api_token=$K&fmt=json&from=2026-09-01&to=2026-09-05"
unset K
```

Anota el código. `200` es que sí.

---

## Parte B — La aplicación con las claves (otro día)

### B1. Prepara la terminal

Cada vez que abras una terminal nueva para esta parte, repite este bloque:

```bash
REPO=~/projects/atlas-portfolio-tracker
T=~/atlas-prueba-013
atlas() { node "$REPO/apps/cli/dist/main.js" --ledger "$T/ledger.jsonl" "$@"; }
```

A partir de aquí, `atlas …` es la consola sobre el libro de prueba.

### B2. El libro de prueba y el histórico del BCE

```bash
mkdir -p "$T"
atlas synth --out "$T/ledger.jsonl"
atlas fx update
echo "salida $?"
```

**Cuenta como «sí»:** «Libro sintético escrito…» y «Histórico del BCE actualizado…», y `salida 0`. `synth` se niega si el libro ya existe: para empezar de cero, `rm -rf ~/atlas-prueba-013` (solo la carpeta de prueba). `fx update` no gasta cupo de nadie: descarga el histórico oficial del BCE, que hace falta para pasar a euros lo que cotiza en otra divisa.

### B3. Dar a cada activo un símbolo real

El libro sintético tiene hoy posición en estos activos, que son los que la consola descargará. Cada orden **gasta una llamada por fuente**, porque contrasta la divisa declarada con los datos de la fuente:

```bash
atlas prices symbols set ast_world --currency EUR --eodhd IWDA.AS
atlas prices symbols set ast_gold  --currency USD --alpha-vantage AAPL
atlas prices symbols set ast_alpha --currency GBX --eodhd TSCO.LSE --alpha-vantage TSCO.LON
```

Y estas dos, **solo si la parte A dijo que sí**:

```bash
atlas prices symbols set ast_btc --currency EUR --eodhd BTC-EUR.CC          # solo si A4 dio 200
atlas prices symbols set ast_mm  --currency EUR --eodhd ISIN1.EUFUND        # solo si A2 dio 200 con el fin de día; ISIN1, uno de los cubiertos
atlas prices symbols
```

- A `ast_world` se le da un ETF europeo; a `ast_gold`, una acción de EE. UU. **solo en Alpha Vantage**, para que esa fuente se pruebe; a `ast_alpha`, una acción de Londres declarada en peniques (`GBX`), con las dos fuentes.
- **Si la consola dice que la fuente da otra divisa** y te pide confirmar, anota lo que dijo. En `ast_alpha` (Londres) decide con A3: si el cierre de A3 era de **cientos** (peniques), **confirma con `s`**, porque lo que manda es la unidad de los cierres, no la del listado; si era de **unidades** (libras), responde **`N`** y repite la orden con `--currency GBP`. En cualquier otro activo, responde **`N`** y repite la orden con la divisa que dijo la fuente.
- **Si una orden falla** (por ejemplo «Error: EODHD no tiene ese símbolo (o la clave no da acceso a él) al confirmar el símbolo: no se ha guardado nada», que es lo que da un 403 en `BTC-EUR.CC` o en `EUFUND`, o «ha rechazado la clave», que es un 401): **anota la línea tal como sale y sigue con la siguiente orden, sin reintentar**. Aunque el mensaje diga «Vuelve a intentarlo más tarde», aquí no hace falta: ese activo se queda sin símbolo y la prueba sigue.
- **Cada reintento y cada `N` gastan cupo**: la consola pregunta a la fuente **antes** de enseñarte el desacuerdo, así que esa llamada ya está gastada aunque no se guarde nada, y repetir la orden la vuelve a gastar.
- **Cuenta como «sí»:** cada orden que no falla termina con «Símbolos de … guardados en prices/symbols.json», y la tabla final dice lo que contrastó cada fuente, sin «sin contrastar».

### B4. Descargar dos veces seguidas

```bash
atlas prices update > "$T/salida-1.txt" 2>&1; echo "salida $?"; cat "$T/salida-1.txt"
atlas prices update > "$T/salida-2.txt" 2>&1; echo "salida $?"; cat "$T/salida-2.txt"
atlas prices status
```

**Cuenta como «sí»:**

- las dos acaban en `salida 0`;
- en la primera, cada activo con símbolo sale «actualizado» con su fuente (EODHD, o Alpha Vantage en `ast_gold`); los que no tienen símbolo (`ast_bonds`, y `ast_btc` o `ast_mm` si no se lo diste) salen «sin símbolo declarado», que es lo esperado;
- en la segunda, **«ya al día (sin gastar cupo)»**. Un activo puede salir «sin cierres nuevos» si ayer fue festivo en su bolsa, **o si la fuente aún no ha publicado el cierre de ayer** (pasa si descargas temprano): eso sí gasta una llamada, y está bien;
- en `prices status`, «gastado hoy» cuadra con lo que has hecho, y ninguna fuente tiene fallos seguidos.

Si un activo sale con fallos, anota la línea tal como sale (no lleva claves).

### B5. Mirar los precios en las vistas

**Antes de mirar, lo que va a parecer raro y no lo es.** El libro sintético es inventado: sus cantidades, sus divisas y sus valoraciones no tienen nada que ver con los valores reales que les has dado. Por eso:

- **`ast_alpha` está en USD en el libro**, pero su cotización llega en peniques (`GBX`): comparada con lo que costó, la acción sale con una pérdida de alrededor del **−79 %**. No es un fallo: es un activo inventado al que se le ha puesto el precio de Tesco.
- **Los pesos salen con «—»** y un aviso de total parcial: tres activos del núcleo no tienen precio (los que no llevan símbolo), y la aplicación **no calcula pesos sobre un total parcial**. Es lo que tiene que hacer.
- **`ast_btc` sale con valores absurdos**, si le diste símbolo: la cantidad inventada del libro por el precio real del bitcóin.

Nada de eso cuenta como fallo. Lo que se mira aquí es el **origen** y el **valor en euros** de cada precio.

```bash
atlas weights; atlas bucket; atlas networth
```

**Cuenta como «sí»:** la columna **origen** dice EODHD o Alpha Vantage en los activos descargados, con la fecha del cierre y su antigüedad; `ast_gold` y `ast_alpha` tienen valor en euros (el dólar y la libra, con el tipo del BCE; los peniques, con el de la libra por cien); y no aparece ningún «≈ aprox.», porque ningún activo del libro sintético tiene ETF de referencia. `ast_world` tenía una valoración manual del 1 de septiembre: ahora gana el cierre, que es más reciente.

### B6. Forzar un fallo de EODHD sin tocar tu fichero de claves

Se usa una **copia** de tus claves con una letra cambiada en la de EODHD, en otra carpeta, y se borra el fichero de precios de un activo del libro **de prueba** para obligar a la consola a llamar:

```bash
mkdir -p "$T-mala/atlas"
node -e 'const fs=require("fs");const f=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));f.eodhd=(f.eodhd[0]==="X"?"Y":"X")+f.eodhd.slice(1);fs.writeFileSync(process.argv[2],JSON.stringify(f)+"\n",{mode:0o600})' ~/.config/atlas/secrets.json "$T-mala/atlas/secrets.json"
echo '{"failure_threshold":1}' > "$T/prices/config.json"
rm "$T/prices/ast_world.jsonl"
XDG_CONFIG_HOME="$T-mala" atlas prices update > "$T/salida-3.txt" 2>&1; echo "salida $?"; cat "$T/salida-3.txt"
```

**Cuenta como «sí»:** `salida 7`; en `ast_world`, «EODHD: ha rechazado la clave»; y el aviso «EODHD lleva demasiados fallos seguidos».

Después, vuelve a dejarlo todo bien y comprueba que se recupera:

```bash
rm -rf "$T-mala" "$T/prices/config.json"
atlas prices update > "$T/salida-4.txt" 2>&1; echo "salida $?"; cat "$T/salida-4.txt"
atlas prices status
```

**Cuenta como «sí»:** `salida 0`, `ast_world` otra vez «actualizado», y EODHD con 0 fallos seguidos en `prices status`.

### B7. La web de escritorio, con un perfil del navegador aparte

**Nunca con el perfil en el que tengas tu libro real**: la web guarda el libro en el navegador, y al importar el de prueba sustituiría el tuyo.

1. En una terminal nueva (déjala abierta mientras miras la web); `REPO` es la misma carpeta de tu clon que en el paso 3:
   ```bash
   REPO=~/projects/atlas-portfolio-tracker
   cd "$REPO" && npm run preview
   ```
2. En Chrome o Edge, crea un perfil nuevo (menú del perfil, arriba a la derecha → «Añadir»), llámalo «Atlas prueba» y abre en él `http://localhost:4173`.
3. La primera página que sale, con un perfil nuevo, es **«Tus datos, en este navegador»**. Debajo del botón «Empezar en este navegador» están «Importar un archivo» y **«Importar desde la carpeta de la consola»**: pulsa este último y selecciona `atlas-prueba-013`. Si la página pregunta **«¿Sustituir los datos de este navegador?»**, pulsa **«Sustituir»**: en este perfil no hay nada tuyo. Con eso la web importa el libro de prueba y **se queda enlazada a la carpeta solo para leer**: de ahí saca los precios (`prices/`) y el histórico del BCE. Nunca escribe en ella.
   - Si usas WSL y el navegador es el de Windows, la carpeta está en la red de WSL: en el selector, escribe `\\wsl.localhost\` en la barra de dirección y baja por tu distribución hasta `home`, tu usuario y `atlas-prueba-013`.
   - Si el selector no te deja elegirla, usa «Importar un archivo» con `ledger.jsonl` y, después, en **Ajustes**, «Importar el histórico» (el fichero `reference/ecb/eurofxref-hist.csv`) y «Importar precios» (todos los ficheros de `prices/`). Anota que tuviste que hacerlo así.
4. Mira **Cartera**, **Cubo** y **Ajustes → «Precios automáticos»**.

**Cuenta como «sí»:** Cartera y Cubo enseñan el **origen** de cada precio («EODHD · fecha», «manual · fecha») y los mismos precios que la consola en B5; y «Precios automáticos» dice de dónde vienen, cuántos activos tienen y hasta qué día. `~/.config/atlas/` no está dentro de la carpeta enlazada, así que la web no puede leer las claves.

Al terminar, cierra el `npm run preview` con Ctrl+C. Puedes borrar el perfil «Atlas prueba» del navegador.

### B8. Buscar las claves en lo escrito

Busca un trozo de cada clave (del segundo al noveno carácter, que también encuentra la copia con la letra cambiada de B6) en todo lo que ha escrito la prueba, incluidas las salidas guardadas:

```bash
grep -rF "$(node -p "require('$HOME/.config/atlas/secrets.json').eodhd.slice(1,9)")" "$T" && echo FUGA || echo limpio
grep -rF "$(node -p "require('$HOME/.config/atlas/secrets.json').alpha_vantage.slice(1,9)")" "$T" && echo FUGA || echo limpio
```

**Cuenta como «sí»:** las dos líneas dicen `limpio`. Si alguna dice `FUGA`, **no copies lo que encontró**: di solo en qué fichero estaba (el nombre sale delante de los dos puntos).

---

## Qué devolver a la dirección

Copia esta plantilla, rellénala y pégala en la conversación. **Sin claves y sin ISIN.**

```text
Parte A (fecha: …)
A1  GSPC.INDX: …    STOXX50E.INDX: …
A2  EUFUND: tuyas … de … fondos    filas: …    fin de día EUFUND: …
A3  TSCO.LSE close: …    Currency del listado: …
A4  BTC-EUR.CC: …

Parte B (fecha: …)
B2  synth y fx update: sí / no
B3  divisas que dijo cada fuente (ast_world, ast_gold, ast_alpha, ast_btc, ast_mm): …
    confirmaste alguna contra la fuente: …
B4  salida 1: …   salida 2: …   ¿la segunda gastó cupo? en qué activos: …
    gastado hoy según prices status: EODHD … / Alpha Vantage …
B5  origen y valor en euros visibles: sí / no    (lo raro, copiado aquí)
B6  salida con la clave mala: …   salida al recuperarse: …
B7  web: importé desde la carpeta / tuve que importar a mano    lo que se ve: …
B8  EODHD: limpio / FUGA en …    Alpha Vantage: limpio / FUGA en …
```

## Qué cuenta como «sí» en la prueba entera

- **Cada fuente responde para su activo**: EODHD para los suyos y Alpha Vantage para `ast_gold`.
- **La segunda descarga no gasta cupo** en lo que ya está al día. Lo único que puede gastar es un festivo o un símbolo sin cierres nuevos, que no se puede saber sin preguntar.
- **Un fallo de la fuente se dice**, con su tipo y con la salida 7, y **se recupera** al volver la clave buena.
- **Ninguna salida ni ningún fichero contiene una clave** (B8).
- **La web enseña lo que la consola descargó**, con su origen.

**Un «sí» que no venga de las claves reales no vale.** Lo que salga de la parte A cierra lo que ADR-0031 aún da por SIN VERIFICAR (índices, `EUFUND`, Londres y cripto).

## Limpieza

Cuando la dirección tenga el resultado:

```bash
rm -rf ~/atlas-prueba-013
```

Las claves de `~/.config/atlas/secrets.json` se quedan: son las que usará la consola con tu libro real. Si prefieres no conservarlas, bórralas con `rm ~/.config/atlas/secrets.json`; sin ellas, todo funciona igual con las valoraciones manuales.

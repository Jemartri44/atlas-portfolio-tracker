// The usage line of the console.

export const USAGE = `uso: atlas [--ledger <ruta>] [--yes] [--confirm-duplicate] [--confirm-fx-rate] [--accept-invalid] [--json] <comando> …

comandos:
  account add|update|list        asset add|update|list        settings set|show
  add buy|sell|swap|transfer|dividend|interest|fx|cash-in|cash-out|fee|valuation
  order place|cancel|note|list [--all] [--date]     transfer request|update|pending [--date]
  ca split|reverse-split|merger|spin-off|fund-merger|share-class-change|fund-liquidation|capital-return|delisting|raw
  thesis open|close <id>|show <id> [--date]   add buy|sell … --thesis <id>
  edit <id> --reason …           delete <id> --reason …
  positions [--date]  lots [activo]  check [--deep]
  tax <año> [--boxes]            la base del ahorro (total fiscal de núcleo y cubo, no la cuota) como JSON; la lectura está en la web
  m720 <año>   m721 <año>        los modelos informativos (obligación, saldos a 31/12 y media del 4T) como JSON
  filed <renta|720|721> <año> [--set <clave>=<importe>]… [--receipt …] [--filed-at …]
  export --format jsonl|csv [--out <ruta>]   backup y export: dentro de un repositorio git piden confirmación aunque haya --yes; sin terminal, --allow-in-repository
  synth --out <ruta> [--seed <n>]   backup --to <directorio> [--from-bucket --env <entorno>]   con --from-bucket, el libro y los ficheros de la nube
  rehearse --dump <fichero>   ensayo de restauración: el volcado frente al libro, en local
  compact [--yes] [--accept-unverified <id>]…   la renuncia a comprobar la huella de esa presentación queda registrada
  lock show|break                el cerrojo de la carpeta del libro: quién lo tiene, y romperlo a petición
  fx update|status               el histórico oficial del BCE junto al libro: descargarlo y ver cuál está en vigor
  prices update|status           los cierres diarios junto al libro (prices/): descargarlos y ver cada fuente y su cupo
  prices purge <activo>          quita los cierres guardados en una divisa que su fuente no declara; sus días se vuelven a pedir una vez
  prices symbols [set|remove] <activo> --eodhd S --currency C [--accept-currency]
  fx correct [--reason …]        corrige los tipos que no son los de su fecha fiscal (tras cambiar fiscal_date_rule)
  admin pull --to <directorio>|compact|restore --from <copia>|prices push|secrets --env <entorno>
                                 la administración de la nube, con el rol de administración y nunca por la API; pull baja el libro de la nube a una carpeta
  --                             termina las opciones: lo que va detrás es posicional (un id que empiece por guion)`;

/** What a failed order points to instead of printing the whole usage again. */
export const USAGE_HINT = "Escribe «atlas --help» para ver el uso.";

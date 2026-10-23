// The usage line and the arity of every command: how many words each one reads.

import { UsageError } from "./args.js";

/**
 * How many words each command reads, its own name included, per subcommand
 * where it has them. A word more is refused, never ignored: a boolean flag
 * followed by a word leaves that word loose, and a command that ignored it
 * would record the opposite of what was written.
 * An unknown subcommand is left to the command, which says its own usage.
 */
export const ARITY: Readonly<Record<string, number | Readonly<Record<string, number>>>> = {
  account: { add: 2, update: 3, list: 2 },
  asset: { add: 2, update: 3, list: 2 },
  settings: { set: 2, show: 2 },
  add: 2,
  order: { place: 2, cancel: 3, note: 3, list: 2 },
  transfer: { request: 2, update: 3, pending: 2, simulate: 2 },
  transfers: { request: 2, update: 3, pending: 2, simulate: 2 },
  ca: 2,
  thesis: { open: 2, close: 3, show: 3, list: 2 },
  valuations: 1,
  edit: 2,
  delete: 2,
  positions: 1,
  networth: 1,
  bucket: 1,
  weights: 1,
  contribute: 1,
  costs: 1,
  lots: 2,
  cash: 1,
  gains: 2,
  income: 2,
  tax: 2,
  filed: 3,
  m720: 2,
  m721: 2,
  check: 1,
  export: 1,
  synth: 1,
  compact: 1,
  backup: 1,
  lock: { show: 2, break: 2 },
  fx: { update: 2, status: 2, correct: 2 },
  prices: { update: 2, status: 2, symbols: 4, purge: 3 },
  draft: { list: 2, confirm: 3, discard: 3 },
  remote: { login: 2, logout: 2, status: 2, upload: 2 },
  // Retired (ADR-0035): any words reach the command, which says where to go.
  sync: 99,
  admin: {
    devices: 2,
    "revoke-all-tokens": 2,
    "forget-device": 3,
    compact: 2,
    restore: 2,
    prices: 3,
  },
};

/** Refuses the first word a command does not read. */
export const assertArity = (positionals: readonly string[]): void => {
  const [name, sub] = positionals as [string, string | undefined];
  const arity = ARITY[name];
  const most = typeof arity === "number" ? arity : sub === undefined ? undefined : arity?.[sub];
  const extra = most === undefined ? undefined : positionals[most];
  if (extra !== undefined) {
    throw new UsageError(
      `sobra el argumento «${extra}»: «atlas ${positionals.slice(0, most).join(" ")}» no lo espera`,
    );
  }
};

export const USAGE = `uso: atlas [--ledger <ruta>] [--yes] [--confirm-duplicate] [--confirm-fx-rate] [--accept-invalid] [--json] <comando> …

comandos:
  account add|update|list        asset add|update|list        settings set|show
  add buy|sell|transfer|dividend|interest|fx|cash-in|cash-out|fee|valuation
  order place|cancel|note|list [--all] [--date]     transfer request|update|pending [--date]
  ca split|reverse-split|merger|spin-off|fund-merger|share-class-change|fund-liquidation|delisting|raw
  thesis open|close <id>|show <id>|list [--closed] [--date]   add buy|sell … --thesis <id>
  edit <id> --reason …           delete <id> --reason …
  positions  lots [activo]  cash  gains <año>  income <año>  valuations [--date]  check [--deep]
  tax <año> [--lots] [--boxes]   base del ahorro: total fiscal de núcleo y cubo, no la cuota
  m720 <año>   m721 <año>        bienes en el extranjero a 31/12 y si hay que presentar
  filed <renta|720|721> <año> [--set <clave>=<importe>]… [--receipt …] [--filed-at …]
  weights [--date]   contribute [--amount <eur>] [--date]   costs [--date]
  networth [--date]   bucket [--date]
  transfer simulate --from-asset <id> --to-asset <id> (--quantity <n> | --all) [--date]
  export --format jsonl|csv [--out <ruta>]
  synth --out <ruta> [--seed <n>]   backup --to <directorio> [--from-bucket --env <entorno>]
  compact [--yes] [--accept-unverified <id>]…   la renuncia a comprobar la huella de esa presentación queda registrada
  lock show|break                el cerrojo de la carpeta del libro: quién lo tiene, y romperlo a petición
  fx update|status               el histórico oficial del BCE junto al libro: descargarlo y ver cuál está en vigor
  prices update|status           los cierres diarios junto al libro (prices/): descargarlos y ver cada fuente y su cupo
  prices update --from-sources   en una carpeta de nube, llamar a las fuentes en vez de bajar de la nube (gasta el cupo compartido)
  prices purge <activo> --source S  quita los cierres guardados en una divisa que su fuente no declara; sus días se vuelven a pedir una vez
  prices symbols [set|remove] <activo> [--eodhd S] [--alpha-vantage S] --currency C [--eodhd-currency C] [--alpha-vantage-currency C] [--accept-currency]
  fx correct [--reason …]        corrige los tipos que no son los de su fecha fiscal (tras cambiar fiscal_date_rule)
  add … --draft                  guarda como borrador una operación cuyo tipo del BCE aún no se ha publicado
  draft list|confirm <id>|discard <id>   los borradores: no cuentan en ninguna cifra hasta registrarlos
  remote login [--origin <https://…>] [--name <nombre>] [--manual]   inicia sesión con Google y guarda el token de este dispositivo; en una carpeta sin libro la hace «de nube»
  remote logout [--device <id>] [--local-only]   revoca el token en el servidor y lo borra de este equipo
  remote status                  las sesiones guardadas de esta carpeta y cuándo caducan
                                 una carpeta es «de nube» (sync/remote.json, sin ledger.jsonl: el libro es el de la nube) o «local» (ledger.jsonl); nunca las dos
  remote upload --from <ledger.jsonl>   la subida inicial: sube un libro entero a una nube vacía (solo en una carpeta de nube)
  admin devices|revoke-all-tokens|forget-device [--] <id>|--device <id>|compact|restore --from <copia>|prices push|secrets --env <entorno>
                                 la administración de la nube, con el rol de administración y nunca por la API
  --                             termina las opciones: lo que va detrás es posicional (un id que empiece por guion)`;

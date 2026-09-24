// atlas prices update | status | symbols (feature 013; ADR-0031).
//
// The console is the one that downloads (the web only reads): it takes the
// assets and their priority from **its** ledger (P5), reserves every call under
// the lock of the folder, calls outside it, and writes `prices/` under it.
// It never writes in the ledger. Without keys it calls nobody and says so:
// that is not an error, and everything else works the same.

import { FilePriceStore } from "@atlas/adapters";
import { type AssetId, settingsAt, todayInMadrid } from "@atlas/domain";
import {
  checkSymbols,
  type PriceStatus,
  type PriceStore,
  parsePriceConfig,
  parseStatus,
  parseSymbols,
  priceStatusView,
  QUOTE_SOURCES,
  type QuoteSource,
  readCloses,
  recordSymbols,
  removeSymbols,
  type SymbolDeclaration,
  type UpdateReport,
  updatePrices,
} from "@atlas/domain/quotes";
import { assertKnownFlags, booleanFlag, type Flags, stringFlag, UsageError } from "../args.js";
import { type Context, EXIT, GLOBAL_FLAGS } from "../context.js";
import { FAILURE_TEXT, SOURCE_NAMES } from "../output/prices.js";
import { table } from "../output/table.js";
import { folderOf, keysFor, sourcesFor } from "../prices/load.js";
import { confirm, loadForQuery, render } from "./shared.js";

const USAGE_PRICES =
  "uso: atlas prices update | atlas prices status | atlas prices symbols [<activo>] | atlas prices symbols set <activo> --currency <divisa> [--eodhd <símbolo>] [--alpha-vantage <símbolo>] [--accept-currency] | atlas prices symbols remove <activo>";

const NO_KEYS =
  "No hay claves de fuentes de precios configuradas: sin precios automáticos. La entrada manual (`atlas add valuation`) sigue funcionando igual.";

const OUTCOME_TEXT: Record<string, string> = {
  updated: "actualizado",
  unchanged: "sin cierres nuevos",
  up_to_date: "ya al día (sin gastar cupo)",
  no_symbol: "sin símbolo declarado (sin gastar cupo)",
  out_of_budget: "fuera del cupo de hoy: conserva su último valor",
  failed: "sin respuesta útil: conserva su último valor",
  currency_mismatch: "divisa en desacuerdo: no se guarda",
  unreadable: "su fichero de precios no se lee: no se toca",
};

const updateText = (report: UpdateReport, failing: readonly QuoteSource[]): string => {
  const rows = report.assets.map((asset) => [
    asset.asset_id,
    asset.group === "bucket" ? "cubo" : asset.group === "reference" ? "referencia" : "núcleo",
    OUTCOME_TEXT[asset.outcome] as string,
    asset.source === undefined ? "" : SOURCE_NAMES[asset.source],
    asset.added === 0 ? "" : String(asset.added),
    asset.failures.map((f) => `${SOURCE_NAMES[f.source]}: ${FAILURE_TEXT[f.kind]}`).join("; "),
  ]);
  const count = (outcome: string) => report.assets.filter((a) => a.outcome === outcome).length;
  return [
    table(["activo", "prioridad", "resultado", "fuente", "líneas", "fallos"], rows),
    "",
    `${count("updated")} actualizados, ${count("up_to_date") + count("unchanged")} al día, ${count("out_of_budget")} fuera del cupo, ${count("failed")} con fallos, ${count("no_symbol")} sin símbolo.`,
    `Cupo que queda hoy: ${Object.entries(report.remaining)
      .map(([source, left]) => `${SOURCE_NAMES[source as QuoteSource]} ${left}`)
      .join(", ")}.`,
    ...failing.map(
      (source) =>
        `Aviso: ${SOURCE_NAMES[source]} lleva demasiados fallos seguidos: puede haber cambiado sus condiciones o su cupo. Mira \`atlas prices status\`.`,
    ),
  ].join("\n");
};

const update = async (ctx: Context): Promise<number> => {
  const { keys, note } = await keysFor(ctx);
  if (note !== undefined) {
    ctx.io.err(note);
  }
  const today = todayInMadrid(ctx.deps.clock);
  const { state } = await loadForQuery(ctx, today);
  const report = await updatePrices({
    state,
    settings: settingsAt(state, today).settings,
    today,
    now: () => ctx.deps.clock.now(),
    store: new FilePriceStore(folderOf(ctx)),
    sources: sourcesFor(ctx, keys),
  });
  if (report.no_sources) {
    render(ctx, report, NO_KEYS);
    return note === undefined ? EXIT.ok : EXIT.domain;
  }
  render(ctx, report, updateText(report, report.failing));
  return report.failing.length > 0 ? EXIT.sourcesFailing : EXIT.ok;
};

const statusOf = async (store: PriceStore): Promise<PriceStatus> =>
  parseStatus(await store.status());

const status = async (ctx: Context): Promise<number> => {
  const store = new FilePriceStore(folderOf(ctx));
  const today = todayInMadrid(ctx.deps.clock);
  const { state } = await loadForQuery(ctx, today);
  const config = parsePriceConfig(await store.config());
  const symbols = parseSymbols(await store.symbols());
  const ids = [...new Set([...state.assets.keys(), ...Object.keys(symbols.assets)])].sort();
  const files = new Map<AssetId, string>();
  for (const id of ids) {
    const text = await store.closes(id);
    if (text !== undefined) {
      files.set(id, text);
    }
  }
  const view = priceStatusView(
    await statusOf(store),
    config,
    readCloses(files).closes,
    ids,
    today,
    ctx.deps.clock.now(),
  );
  const text = [
    "Fuentes de precios (el cupo de EODHD se cuenta por día GMT; el de Alpha Vantage, en las últimas 24 horas):",
    table(
      [
        "fuente",
        "gastado hoy",
        "cupo",
        "quedan",
        "fallos seguidos",
        "último éxito",
        "último fallo",
      ],
      view.sources.map((s) => [
        SOURCE_NAMES[s.source],
        String(s.spent_today),
        String(s.daily_calls),
        String(s.remaining),
        `${s.consecutive_failures}${s.failing ? " ⚠" : ""}`,
        s.last_success ?? "",
        s.last_failure === undefined
          ? ""
          : `${FAILURE_TEXT[s.last_failure.kind]} (${s.last_failure.at})`,
      ]),
    ),
    "",
    "Último cierre de cada activo:",
    table(
      ["activo", "último cierre", "fuente", "antigüedad (días)", "último fallo"],
      view.assets.map((a) => [
        a.asset_id,
        a.last_date ?? "sin cierres",
        a.source === undefined ? "" : SOURCE_NAMES[a.source],
        a.age_days === undefined ? "" : String(a.age_days),
        a.last_failure === undefined
          ? ""
          : `${SOURCE_NAMES[a.last_failure.source]}: ${FAILURE_TEXT[a.last_failure.kind]}${
              a.last_failure.found === undefined
                ? ""
                : ` (declarada ${a.last_failure.declared}, la fuente dice ${a.last_failure.found})`
            }`,
      ]),
    ),
  ].join("\n");
  render(ctx, view, text);
  return EXIT.ok;
};

const listSymbols = async (ctx: Context, assetId: string | undefined): Promise<number> => {
  const file = parseSymbols(await new FilePriceStore(folderOf(ctx)).symbols());
  const entries = Object.entries(file.assets).filter(
    ([id]) => assetId === undefined || id === assetId,
  );
  if (assetId !== undefined && entries.length === 0) {
    render(
      ctx,
      { asset_id: assetId },
      `${assetId} no tiene símbolos declarados: no se descarga su precio.`,
    );
    return EXIT.ok;
  }
  render(
    ctx,
    Object.fromEntries(entries),
    table(
      ["activo", "divisa declarada", "EODHD", "Alpha Vantage", "confirmada contra la fuente"],
      entries.map(([id, entry]) => [
        id,
        entry.currency,
        entry.eodhd ?? "",
        entry.alpha_vantage ?? "",
        QUOTE_SOURCES.filter((s) => entry.currency_confirmed_over?.[s] !== undefined)
          .map((s) => `${SOURCE_NAMES[s]} dice ${entry.currency_confirmed_over?.[s]}`)
          .join("; "),
      ]),
    ),
  );
  return EXIT.ok;
};

const setSymbols = async (ctx: Context, assetId: string, flags: Flags): Promise<number> => {
  const currency = stringFlag(flags, "currency");
  if (currency === undefined) {
    throw new UsageError(
      "falta --currency: la divisa de la cotización se declara, nunca se supone",
    );
  }
  const { state } = await loadForQuery(ctx);
  if (!state.assets.has(assetId)) {
    throw new UsageError(`${assetId} no está en el catálogo de este libro`);
  }
  const eodhd = stringFlag(flags, "eodhd");
  const alpha = stringFlag(flags, "alpha-vantage");
  const declaration: SymbolDeclaration = {
    currency,
    ...(eodhd === undefined ? {} : { eodhd }),
    ...(alpha === undefined ? {} : { alpha_vantage: alpha }),
  };
  const { keys, note } = await keysFor(ctx);
  if (note !== undefined) {
    ctx.io.err(note);
  }
  const store = new FilePriceStore(folderOf(ctx));
  const now = () => ctx.deps.clock.now();
  const check = await checkSymbols({ declaration, store, sources: sourcesFor(ctx, keys), now });
  if (!check.ok) {
    ctx.io.err(
      `Error: ${SOURCE_NAMES[check.source]} ${FAILURE_TEXT[check.kind]} al confirmar el símbolo: no se ha guardado nada. Vuelve a intentarlo más tarde.`,
    );
    return EXIT.domain;
  }
  let pending = await recordSymbols({
    assetId,
    declaration,
    checks: check.checks,
    accepted: [],
    store,
    now,
  });
  if (pending.length > 0) {
    for (const d of pending) {
      ctx.io.out(
        `${SOURCE_NAMES[d.source]} dice que ${declaration[d.source]} cotiza en ${d.found}, y has declarado ${d.declared}. Nunca se supone: si ${d.declared} es la unidad de sus cierres (por ejemplo peniques, GBX, frente a libras, GBP), confírmalo.`,
      );
    }
    const accepted =
      booleanFlag(flags, "accept-currency") ||
      (await confirm(
        ctx,
        `¿Confirmas ${currency} como divisa de sus cierres, contra lo que dice la fuente? [s/N] `,
      ));
    if (!accepted) {
      ctx.io.out("No se ha guardado nada.");
      return EXIT.domain;
    }
    pending = await recordSymbols({
      assetId,
      declaration,
      checks: check.checks,
      accepted: pending.map((d) => d.source),
      store,
      now,
    });
  }
  const unchecked = check.unchecked.map((s) => SOURCE_NAMES[s]);
  render(
    ctx,
    { asset_id: assetId, declaration, checks: check.checks, unchecked: check.unchecked },
    [
      `Símbolos de ${assetId} guardados en prices/symbols.json (divisa de la cotización: ${currency}).`,
      ...(unchecked.length === 0
        ? []
        : [
            `Sin confirmar contra ${unchecked.join(" ni ")}: no hay clave o no queda cupo hoy. Se confirmará cuando vuelvas a declararlo.`,
          ]),
    ].join("\n"),
  );
  return EXIT.ok;
};

export const pricesCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  const sub = positionals[1];
  if (sub === "update" || sub === "status") {
    assertKnownFlags(flags, [...GLOBAL_FLAGS]);
    return sub === "update" ? update(ctx) : status(ctx);
  }
  if (sub !== "symbols") {
    throw new UsageError(USAGE_PRICES);
  }
  const action = positionals[2];
  if (action === "set") {
    assertKnownFlags(flags, [
      "currency",
      "eodhd",
      "alpha-vantage",
      "accept-currency",
      ...GLOBAL_FLAGS,
    ]);
    const assetId = positionals[3];
    if (assetId === undefined) {
      throw new UsageError(USAGE_PRICES);
    }
    return setSymbols(ctx, assetId, flags);
  }
  assertKnownFlags(flags, [...GLOBAL_FLAGS]);
  if (action === "remove") {
    const assetId = positionals[3];
    if (assetId === undefined) {
      throw new UsageError(USAGE_PRICES);
    }
    const removed = await removeSymbols(new FilePriceStore(folderOf(ctx)), assetId);
    render(
      ctx,
      { asset_id: assetId, removed },
      removed
        ? `Quitados los símbolos de ${assetId}: deja de descargarse su precio. Lo ya descargado se conserva.`
        : `${assetId} no tenía símbolos declarados.`,
    );
    return EXIT.ok;
  }
  return listSymbols(ctx, action);
};

// atlas positions · lots · check

import {
  currencyLots,
  type FingerprintWaiver,
  fiscalLots,
  type IntegrityFinding,
  integrity,
  type LedgerState,
  loadAndProject,
  ProjectionError,
  physicalPositions,
  type Warning,
} from "@atlas/domain";
import { foreignRatesOf, type RateCheck } from "@atlas/domain/ecb";
import { deepCheck } from "@atlas/domain/tools";
import { assertKnownFlags, booleanFlag, type Flags, stringFlag } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { day, describeEcbFinding } from "../output/ecb.js";
import { table } from "../output/table.js";
import { warningLines } from "../output/warnings.js";
import { ratesOf } from "./rates.js";
import {
  assertExists,
  dateFlag,
  loadForQuery,
  originOf,
  render,
  renderQuery,
  warnIfLedgerMissing,
} from "./shared.js";

export const positionsCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["account", "asset", "date", ...GLOBAL_FLAGS]);
  const date = dateFlag(ctx, flags);
  const { state } = await loadForQuery(ctx, date);
  const account = stringFlag(flags, "account");
  const asset = stringFlag(flags, "asset");
  assertExists(state, "account", account);
  assertExists(state, "asset", asset);
  const rows = physicalPositions(state).filter(
    (p) =>
      (account === undefined || p.account_id === account) &&
      (asset === undefined || p.asset_id === asset),
  );
  renderQuery(
    ctx,
    state,
    rows.map((p) => ({ ...p, quantity: p.quantity.toString() })),
    `Posiciones a ${date} (--date para otra fecha).\n${table(
      ["cuenta", "activo", "cantidad"],
      rows.map((p) => [p.account_id, p.asset_id, p.quantity.toString()]),
    )}`,
  );
  return 0;
};

export const lotsCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["closed", ...GLOBAL_FLAGS]);
  const { events, state } = await loadForQuery(ctx);
  const includeClosed = booleanFlag(flags, "closed");
  const asset = positionals[1];
  assertExists(state, "asset", asset);
  const rows = fiscalLots(state, asset).filter((lot) => includeClosed || !lot.closed);
  // The lots of foreign currency go in the same table, with their currency (spec 029); a
  // negative one is currency spent without having it.
  const currency =
    asset === undefined ? currencyLots(state).filter((lot) => includeClosed || !lot.closed) : [];
  renderQuery(
    ctx,
    state,
    [
      ...rows.map((lot) => ({
        ...lot,
        origin: originOf(events, state, lot.source_event_id),
        original_quantity: lot.original_quantity.toString(),
        quantity: lot.quantity.toString(),
        cost_eur: lot.cost_eur.amount.toString(),
        original_cost_eur: lot.original_cost_eur.amount.toString(),
        cost: lot.cost.amount.toString(),
        cost_currency: lot.cost.currency,
        funding_eur: lot.funding_eur.amount.toString(),
        consumptions: lot.consumptions.map((c) => ({
          ...c,
          quantity: c.quantity.toString(),
          cost_eur: c.cost_eur.amount.toString(),
          cost: c.cost.amount.toString(),
          funding_eur: c.funding_eur.amount.toString(),
        })),
      })),
      ...currency.map((lot) => ({
        ...lot,
        origin: originOf(events, state, lot.source_event_id),
        amount: lot.amount.amount.toString(),
        original_amount: lot.original_amount.amount.toString(),
        cost_eur: lot.cost_eur.amount.toString(),
        original_cost_eur: lot.original_cost_eur.amount.toString(),
      })),
    ],
    table(
      [
        "lote",
        "activo",
        "adquisición",
        "cantidad",
        "original",
        "coste EUR",
        "coste original EUR",
        "origen",
        "lote origen",
        "estado",
      ],
      rows
        .map((lot) => [
          lot.id,
          lot.asset_id,
          lot.acquisition_date,
          lot.quantity.toString(),
          lot.original_quantity.toString(),
          lot.cost_eur.amount.toString(),
          lot.original_cost_eur.amount.toString(),
          originOf(events, state, lot.source_event_id),
          lot.source_lot_id ?? "",
          lot.closed ? "cerrado" : "abierto",
        ])
        .concat(
          currency.map((lot) => [
            lot.id,
            `${lot.currency} (divisa)`,
            lot.acquisition_date,
            lot.amount.amount.toString(),
            lot.original_amount.amount.toString(),
            lot.cost_eur.amount.toString(),
            lot.original_cost_eur.amount.toString(),
            originOf(events, state, lot.source_event_id),
            "",
            lot.closed ? "cerrado" : "abierto",
          ]),
        ),
    ),
  );
  return 0;
};

/** Why a fingerprint could not be verified, said the way the reader needs it. */
const WAIVER_REASONS: Record<FingerprintWaiver["reason"], string> = {
  lines: "la huella cubría otro número de movimientos",
  digest: "los movimientos ya no eran los que había cuando se presentó",
  unreadable: "los movimientos no se podían leer en el formato que decía la huella",
};

/**
 * The text of a finding. The domain speaks English by contract; the CLI still prints most findings
 * in it, but **this one is read for twenty years**, so it is said in Spanish with its reason and
 * its date.
 */
const describeFindingIn = (state: LedgerState | undefined, finding: IntegrityFinding): string => {
  const ecb = describeEcbFinding(finding.code, finding.details ?? {});
  if (ecb !== undefined) {
    return ecb;
  }
  const waiver =
    finding.code === "filing_fingerprint_waived"
      ? state?.fingerprintWaivers.get(finding.event_ids[0] as string)
      : undefined;
  if (waiver === undefined) {
    return finding.message;
  }
  return `La huella de la declaración ${waiver.filing_id} nunca llegó a comprobarse (${WAIVER_REASONS[waiver.reason]}) y lo diste por bueno el ${waiver.accepted_on} para poder compactar.`;
};

/**
 * What the check says about the ECB rates, always: contrasted until when, or
 * **without contrasting** and why — never folded into "no findings".
 */
const ratesLine = (rates: RateCheck | undefined, deep: boolean): string[] => {
  if (rates === undefined) {
    return [];
  }
  if (rates.kind === "checked") {
    return rates.compared === 0
      ? []
      : [
          `Tipos del BCE: ${rates.compared} contrastados con el histórico oficial, que llega hasta el ${day(rates.latest)}.`,
        ];
  }
  if (rates.rates === 0) {
    return [];
  }
  return [
    deep
      ? `Tipos del BCE sin contrastar (${rates.rates}): no hay histórico junto al libro. Descárgalo con atlas fx update; mientras tanto, ni se dan por buenos ni por malos.`
      : `Tipos del BCE sin contrastar (${rates.rates}): atlas check no los contrasta; hazlo con atlas check --deep y el histórico descargado.`,
  ];
};

export const checkCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["deep", ...GLOBAL_FLAGS]);
  const deep = booleanFlag(flags, "deep");
  let findings: IntegrityFinding[];
  let deepFindings: IntegrityFinding[] = [];
  let warnings: Warning[] = [];
  let state: LedgerState | undefined;
  let rates: RateCheck | undefined;
  try {
    await warnIfLedgerMissing(ctx);
    const loaded = await loadAndProject(ctx.deps, { collectErrors: true });
    state = loaded.state;
    const { events, lines } = loaded;
    findings = integrity(state);
    warnings = state.warnings;
    if (deep) {
      deepFindings = deepCheck(lines, events, state, ctx.deps.store.schema);
      rates = await ratesOf(ctx, state, events);
      if (rates.kind === "checked") {
        deepFindings.push(...rates.findings);
      }
    } else {
      // Plain `check` never contrasts the rates: it says so, it does not call them fine.
      rates = { kind: "unchecked", rates: foreignRatesOf(state, events).length };
    }
  } catch (error) {
    // Duplicate ids stop the projection even when collecting errors: report them as the single finding.
    if (!(error instanceof ProjectionError) || error.code !== "duplicate_id") {
      throw error;
    }
    findings = [
      { severity: "error", code: error.code, message: error.message, event_ids: [error.eventId] },
    ];
  }
  const all = [...findings, ...deepFindings];
  const unchecked = rates?.kind === "unchecked" && rates.rates > 0;
  // `check` is the tool that lists the invalid events: it does not need the header.
  render(
    ctx,
    { findings, deep: deepFindings, warnings, rates: rates ?? null },
    [
      all.length === 0 && warnings.length === 0
        ? unchecked
          ? "Libro íntegro en lo comprobado."
          : "Libro íntegro: sin hallazgos."
        : table(
            ["nivel", "código", "mensaje", "eventos"],
            [
              ...all.map((f) => [
                f.severity,
                f.code,
                describeFindingIn(state, f),
                f.event_ids.join(", "),
              ]),
              // The domain writes in English and the CLI translates by `code`
              // (the contract of `errors.ts`): `check` was still printing the raw
              // message, so the only place that lists every warning of the ledger
              // spoke a different language from the rest of the application.
              ...warningLines(warnings).map((w) => [
                "warning",
                w.code,
                w.text,
                w.event_ids.join(", "),
              ]),
            ],
          ),
      ...ratesLine(rates, deep),
    ].join("\n"),
  );
  return all.some((f) => f.severity === "error") ? 1 : 0;
};

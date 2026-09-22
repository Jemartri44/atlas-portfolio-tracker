// atlas tax <año> [--lots] [--json] — the savings base of a tax year (feature 009).
//
// The CLI only formats: every figure, every criterion and every note comes from
// `taxYear` in the domain (decision (h) of prompt 006, §2 bis of prompt 009).

import {
  CRITERION_IDS,
  type CriterionId,
  type CriterionStake,
  FISCAL_CRITERIA,
  type IncomeLine,
  isDoubtful,
  type Money,
  type TaxYearReport,
  type TransmissionLine,
  taxBoxes,
  taxBoxesJson,
  taxReportJson,
  taxYear,
  todayInMadrid,
} from "@atlas/domain";
import { assertKnownFlags, booleanFlag, type Flags, UsageError } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { describeWarning } from "../output/messages.js";
import { table } from "../output/table.js";
import { render } from "./shared.js";
import { renderBoxes } from "./tax-boxes.js";

const USAGE = "uso: atlas tax <año> [--lots] [--boxes] [--json]";

/** A figure of the return: always two decimals, so a column reads as money. */
const cents = (money: Money | undefined): string => {
  if (money === undefined) {
    return "—";
  }
  const [whole, fraction = ""] = money.roundToCents().amount.toString().split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
};

const CERTAINTY: Record<string, string> = {
  high: "alta",
  medium: "media",
  low: "baja",
  disputed: "en disputa",
};

const RISK: Record<string, string> = {
  conservative: "conservador",
  aggressive: "agresivo",
  both: "ambas",
  neutral: "neutro",
  none: "ninguna",
};

/** Short Spanish name of each criterion of `docs/fiscal-questions.md`. */
export const CRITERION_LABELS: Record<CriterionId, string> = {
  "1": "fecha fiscal por tipo de activo",
  "2:listed": "ventana de dos meses (cotizados)",
  "2:listed_1y": "ventana de un año (cotizados, la lectura prudente)",
  "2:crypto": "ventana de un año (cripto)",
  "2:crypto_2m": "ventana de dos meses (cripto, la lectura menos prudente)",
  "2:fund_2m": "ventana de dos meses (fondos)",
  "2:fund_1y": "ventana de un año (fondos, la lectura prudente)",
  "2:other": "ventana configurada que ninguna lectura del documento sostiene",
  "2b": "un traspaso entrante es una adquisición",
  "3": "comisiones en la base (art. 35)",
  "4": "ganancia en divisa y diferencias de cambio",
  "5": "tipo del BCE del último día publicado",
  "6": "redondeo half-up una vez por operación",
  "7": "reparto del coste en una escisión y régimen de neutralidad",
  "8": "fork o airdrop a coste cero",
  "9": "pérdida por liquidación de la sociedad",
  "10": "compensación hasta el 25 % y arrastre a cuatro años",
  "11": "Modelo 720",
  "12": "retención en reembolsos de fondos",
  "13": "canje con compensación en efectivo y régimen de neutralidad",
  "14": "ventana contada de fecha a fecha",
  "15": "el diferimiento viaja con los lotes descendientes",
  "16": "deducción por doble imposición",
  "17": "la comisión de una permuta resta de lo transmitido",
  "18": "solo cuenta la recompra que sigue en el patrimonio",
  "19": "cada unidad recomprada difiere una sola vez",
  "20": "la regla mira la operación, no el lote",
  "21": "lo liberado vuelve a pasar por la regla",
  "22": "orden de la compensación entre ejercicios",
  "23": "gastos de administración y depósito (art. 26.1.a)",
  "24:etc": "ETC como rendimiento del capital mobiliario (la consulta V0267-25)",
  "24:etc_gain": "ETC como ganancia patrimonial (lo contrario de la consulta V0267-25)",
  "24:etp": "ETP como rendimiento del capital mobiliario",
  "24:etp_gain": "ETP como ganancia patrimonial",
};

const criteriaText = (ids: readonly CriterionId[]): string =>
  ids.map((id) => (isDoubtful(id) ? `${id}*` : id)).join(" ");

const CATEGORY: Record<string, string> = {
  capital_gain: "ganancias y pérdidas patrimoniales",
  movable_capital: "rendimientos del capital mobiliario",
};

const transmissionTable = (lines: readonly TransmissionLine[]): string =>
  table(
    [
      "fecha fiscal",
      "evento",
      "operación",
      "activo",
      "libro",
      "cuenta",
      "cantidad",
      "transmisión",
      "tipo BCE",
      "transmisión EUR",
      "coste EUR",
      "propio",
      "liberado",
      "diferido",
      "computable",
      "criterios",
    ],
    lines.map((line) => [
      line.fiscal_date,
      line.event_id,
      line.corporate_action_kind === undefined
        ? line.event_type
        : `${line.event_type}:${line.corporate_action_kind}`,
      line.asset_id,
      line.book === "core" ? "núcleo" : "cubo",
      line.account_id,
      line.quantity.toString(),
      `${line.proceeds.amount.amount.toString()} ${line.proceeds.amount.currency}`,
      `${line.proceeds.fx_rate} (${line.proceeds.fx_rate_date})`,
      cents(line.proceeds.eur),
      cents(line.cost_eur),
      cents(line.own_eur),
      cents(line.released_eur),
      cents(line.deferred_eur),
      `${cents(line.computable_eur_rounded)}${line.provisional_until === undefined ? "" : " (provisional)"}`,
      criteriaText(line.criteria),
    ]),
  );

const lotTable = (lines: readonly TransmissionLine[]): string =>
  table(
    [
      "evento",
      "lote",
      "cantidad",
      "coste EUR",
      "transmisión EUR",
      "resultado",
      "adquisición",
      "linaje",
      "origen",
    ],
    lines.flatMap((line) =>
      line.lots.map((lot) => [
        line.event_id,
        lot.lot_id,
        lot.quantity.toString(),
        lot.cost_eur.amount.toString(),
        lot.proceeds_eur.amount.toString(),
        lot.gain_eur.amount.toString(),
        lot.acquisition_date,
        lot.lineage.map((step) => `${step.event_type} ${step.lot_id}`).join(" ← "),
        `${lot.root.event_type} ${lot.root.event_id}: ${lot.root.cost.amount.amount.toString()} ${lot.root.cost.amount.currency} al ${lot.root.cost.fx_rate} (${lot.root.cost.fx_rate_date})`,
      ]),
    ),
  );

const incomeTable = (lines: readonly IncomeLine[]): string =>
  table(
    [
      "fecha",
      "evento",
      "activo",
      "bruto",
      "tipo BCE",
      "bruto EUR",
      "ret. origen",
      "ret. España",
      "país",
      "criterios",
    ],
    lines.map((line) => [
      line.fiscal_date,
      line.event_id,
      line.asset_id ?? "",
      `${line.gross.amount.amount.toString()} ${line.gross.amount.currency}`,
      `${line.gross.fx_rate} (${line.gross.fx_rate_date})`,
      cents(line.gross_eur_rounded),
      line.withholding_origin.amount.toString(),
      line.withholding_spain.amount.toString(),
      line.source_country ?? "",
      criteriaText(line.criteria),
    ]),
  );

const REASONS: Record<NonNullable<CriterionStake["reason"]>, (item: CriterionStake) => string> = {
  invalid_under_alternative: (item) =>
    `con la otra lectura ${String(item.invalid_count)} eventos serían inválidos`,
  lot_in_other_currency: () => "algún lote se compró en otra divisa",
  regime_not_recorded: () =>
    "sin régimen de neutralidad sería una permuta sujeta, y su valor no está en el libro",
  no_carrier_left: () =>
    "la otra lectura no tiene dónde aplazar: no queda en cartera ningún título de ese valor",
};

const stake = (item: CriterionStake): string => {
  const reason = item.reason === undefined ? "" : ` (${REASONS[item.reason](item)})`;
  if (item.measure === "not_quantifiable") {
    return `no cuantificable${reason}`;
  }
  if (item.measure === "exposure") {
    return `exposición ${cents(item.exposure_eur)}${reason}`;
  }
  const parts = [`base ${cents(item.base_difference_eur)}`];
  if (item.pending_difference_eur !== undefined && !item.pending_difference_eur.isZero()) {
    parts.push(`pendiente ${cents(item.pending_difference_eur)}`);
  }
  if (item.deferred_difference_eur !== undefined && !item.deferred_difference_eur.isZero()) {
    parts.push(`diferido ${cents(item.deferred_difference_eur)}`);
  }
  return `diferencia: ${parts.join(", ")}`;
};

/** The same table for the two lists of criteria: what is doubtful and what is settled. */
const stakeTable = (items: readonly CriterionStake[]): string =>
  table(
    ["criterio", "certeza", "riesgo documentado", "dinero en juego", "dirección", "operaciones"],
    items.map((item) => [
      `${item.criterion} ${CRITERION_LABELS[item.criterion]}`,
      CERTAINTY[item.certainty] as string,
      RISK[item.documented_risk] as string,
      stake(item),
      RISK[item.direction] as string,
      [
        ...item.event_ids,
        ...(item.markets === undefined ? [] : [`mercados: ${item.markets.join(", ")}`]),
      ].join(" "),
    ]),
  );

const section = (title: string, body: string): string => `\n${title}\n${body}`;

const CAUSE: Record<string, string> = {
  at_filing: "lo que cambiaste al presentar",
  engine: "cambio del motor",
  settings: "cambio de configuración",
  later_events: "eventos registrados después",
};

/**
 * What was filed for this year, next to what the ledger says today (ADR-0020).
 *
 * It is printed **always**, with its own sentence when there is no filing: a
 * section that appears and disappears would renumber the ones after it, and
 * the numbering of this output is a contract (README).
 */
const filingText = (report: TaxYearReport): string => {
  const filing = report.filing;
  if (filing === undefined) {
    return "No consta ninguna Renta presentada de este ejercicio. Si la presentaste, regístrala con `atlas filed renta <año>`: es lo que cierra el ejercicio y ancla el arrastre.";
  }
  const lines = [
    `Declarado el ${filing.filed_at} (justificante ${filing.receipt_reference}).${filing.chain.length > 1 ? ` Cadena de ${filing.chain.length} presentaciones; en vigor la última.` : ""}`,
    filing.fingerprint_ok
      ? ""
      : "La huella del libro no cuadra con los eventos anteriores a la presentación: no se puede reproducir el cálculo de aquel día, así que no se reparten las causas. Ejecuta `atlas check --deep`.",
    table(
      ["cifra", "declarado", "calculado entonces", "hoy", "por qué difiere"],
      filing.figures.map((figure) => [
        figure.figure,
        cents(figure.declared),
        cents(figure.computed_then),
        cents(figure.now),
        figure.causes === undefined
          ? ""
          : Object.entries(figure.causes)
              .filter(([, amount]) => !amount.isZero())
              .map(([cause, amount]) => `${CAUSE[cause] ?? cause} ${cents(amount)}`)
              .join(" · "),
      ]),
    ),
  ];
  return lines.filter((line) => line !== "").join("\n");
};

export const renderTaxReport = (report: TaxYearReport, withLots: boolean): string => {
  const out: string[] = [
    `TOTAL FISCAL ${report.year} — núcleo y cubo agregados por contribuyente (constitución III).`,
    "Esto es la BASE del ahorro, no la cuota ni lo que se paga.",
    `Configuración aplicada: ${report.settings.origin}. Fecha de consulta: ${report.today}. Criterios con * son dudosos (leyenda al final).`,
  ];
  const gains = report.capital_gains;
  out.push(
    section(
      "1. Ganancias y pérdidas patrimoniales (art. 33 LIRPF)",
      `${transmissionTable(gains.lines)}\nGanancias ${cents(gains.gains_eur)} · Pérdidas ${cents(gains.losses_eur)} · Saldo ${cents(gains.balance_eur)}${gains.foreign_releases_eur.isZero() ? "" : ` (incluye ${cents(gains.foreign_releases_eur)} liberados de pérdidas de esta categoría)`}`,
    ),
  );
  if (withLots) {
    out.push(
      section(
        "   Lotes consumidos y su linaje",
        lotTable([...gains.lines, ...report.movable_capital.transmissions]),
      ),
    );
  }
  const movable = report.movable_capital;
  const movableParts = [
    `Dividendos:\n${incomeTable(movable.dividends)}`,
    `Intereses:\n${incomeTable(movable.interest)}`,
  ];
  if (movable.transmissions.length > 0) {
    movableParts.push(`Transmisiones (art. 25.2):\n${transmissionTable(movable.transmissions)}`);
  }
  movableParts.push(
    `Gastos de administración y depósito (art. 26.1.a):\n${table(
      ["fecha", "evento", "tipo", "importe", "EUR", "criterios"],
      movable.expenses.map((line) => [
        line.fiscal_date,
        line.event_id,
        line.fee_kind,
        `${line.amount.amount.amount.toString()} ${line.amount.amount.currency}`,
        cents(line.amount_eur_rounded),
        criteriaText(line.criteria),
      ]),
    )}`,
    `Saldo ${cents(movable.balance_eur)}`,
  );
  out.push(
    section("2. Rendimientos del capital mobiliario (art. 25 LIRPF)", movableParts.join("\n")),
  );
  const wash = report.wash_sale;
  out.push(
    section(
      "3. Regla de recompra",
      [
        `Diferidas en ${report.year}:`,
        table(
          ["evento", "activo", "fecha", "diferido", "unidades", "ventana", "adquisiciones"],
          wash.deferred.map((line) => [
            line.event_id,
            line.asset_id,
            line.fiscal_date,
            cents(line.amount_eur_rounded),
            `${line.units.toString()} de ${line.sold.toString()}`,
            `${line.window} [${line.window_start} … ${line.window_end}]`,
            line.acquisitions
              .map(
                (a) =>
                  `${a.event_id} ${a.fiscal_date} ${a.units.toString()}${a.via_transfer ? " (traspaso)" : ""}`,
              )
              .join("; "),
          ]),
        ),
        `Liberadas en ${report.year}:`,
        table(
          ["evento", "pérdida de origen", "importe", "viajó"],
          wash.released.map((line) => [
            line.event_id,
            `${line.origin_event_id} (${line.origin_fiscal_date})`,
            cents(line.amount_eur),
            line.travelled ? "sí" : "no",
          ]),
        ),
        `Pendientes a 31/12/${report.year}:`,
        table(
          ["pérdida de origen", "lote", "activo", "importe", "viajó"],
          wash.pending.map((line) => [
            line.origin_event_id,
            line.lot_id ?? `espera la recompra ${line.awaiting_event_id ?? ""}`,
            line.asset_id,
            cents(line.amount_eur),
            line.travelled ? "sí" : "no",
          ]),
        ),
      ].join("\n"),
    ),
  );
  const c = report.compensation;
  out.push(
    section(
      "4. Compensación (art. 49 LIRPF)",
      [
        `Límite conjunto del ${c.limit_pct} %: contra ganancias ${cents(c.limit_eur.capital_gain)}, contra rendimientos ${cents(c.limit_eur.movable_capital)}.`,
        table(
          ["fase", "compensa", "ejercicio de origen", "contra", "importe", "con límite"],
          c.steps.map((step) => [
            String(step.phase),
            CATEGORY[step.from] as string,
            String(step.origin_year),
            CATEGORY[step.against] as string,
            cents(step.amount_eur),
            step.limited ? "sí" : "no",
          ]),
        ),
      ].join("\n"),
    ),
  );
  out.push(
    section(
      "5. Saldos negativos pendientes",
      [
        table(
          ["ejercicio de origen", "categoría", "importe", "último ejercicio"],
          c.pending.map((p) => [
            String(p.origin_year),
            CATEGORY[p.category] as string,
            cents(p.amount_eur),
            String(p.expires_after),
          ]),
        ),
        ...c.expired.map(
          (p) =>
            `CADUCA al cierre de ${report.year}: ${cents(p.amount_eur)} de ${p.origin_year} (${CATEGORY[p.category]}).`,
        ),
        ...(report.anchor === undefined
          ? []
          : [
              report.anchor.before_ledger === true
                ? `Anclado en lo declarado en ${report.anchor.year}, anterior a tus datos: ${report.anchor.declared.map((p) => `${p.origin_year} ${cents(p.amount_eur)}`).join(", ") || "nada"}. Vienen de lo declarado, no de un cálculo.`
                : `Anclado en lo declarado en ${report.anchor.year}: calculado ${report.anchor.computed.map((p) => `${p.origin_year} ${cents(p.amount_eur)}`).join(", ") || "nada"}; declarado ${report.anchor.declared.map((p) => `${p.origin_year} ${cents(p.amount_eur)}`).join(", ") || "nada"}.`,
            ]),
      ].join("\n"),
    ),
  );
  out.push(
    `\nBASE IMPONIBLE DEL AHORRO ${report.year}: ${cents(report.base_eur)} EUR (base, no cuota)`,
  );
  out.push(section("6. Lo declarado en este ejercicio", filingText(report)));
  out.push(
    section(
      "7. Retenciones a cuenta (se restan de la cuota, que este motor no calcula)",
      `${table(
        ["fecha", "evento", "origen", "importe", "EUR"],
        report.withholdings.lines.map((line) => [
          line.fiscal_date,
          line.event_id,
          line.source,
          `${line.amount.amount.amount.toString()} ${line.amount.amount.currency}`,
          cents(line.amount_eur_rounded),
        ]),
      )}\nTotal ${cents(report.withholdings.total_eur)}`,
    ),
  );
  out.push(
    section(
      "8. Doble imposición internacional (#16, solo el primer límite)",
      `${table(
        [
          "evento",
          "país",
          "bruto EUR",
          "impuesto extranjero",
          "convenio %",
          "deducible",
          "no deducible",
        ],
        report.double_taxation.lines.map((line) => [
          line.event_id,
          line.source_country ?? "?",
          cents(line.gross_eur),
          cents(line.foreign_tax_eur),
          line.treaty_pct ?? "—",
          cents(line.deductible_eur),
          cents(line.not_deductible_eur),
        ]),
      )}\nDeducible ${cents(report.double_taxation.deductible_eur)} · No deducible ${cents(report.double_taxation.not_deductible_eur)}`,
    ),
  );
  out.push(
    section(
      "9. Criterios dudosos: qué hay en juego si el criterio está mal",
      stakeTable(report.doubtful),
    ),
  );
  out.push(
    section(
      "10. Criterios firmes: lo que moverían leídos al revés",
      `${stakeTable(report.settled)}\nLa lectura de estos no está en duda; la cifra dice qué habría detrás si lo estuviera.`,
    ),
  );
  out.push(
    section(
      "11. Lo que este motor no calcula, y avisos",
      report.notes.map((note) => `- ${describeWarning(note)}`).join("\n"),
    ),
  );
  if (report.settings_diff !== undefined) {
    const diff = report.settings_diff;
    out.push(
      section(
        `12. Diferencias con la configuración anterior (${diff.previous_origin} → ${diff.current_origin})`,
        diff.invalid_before !== undefined
          ? `La configuración anterior deja ${diff.invalid_before} eventos inválidos: no hay cifra con la que comparar.`
          : `Base antes ${cents(diff.base_before_eur)} · ahora ${cents(diff.base_after_eur)}\n${
              diff.changes.length === 0
                ? "Ninguna operación cambia."
                : table(
                    ["evento", "cambio", "antes", "ahora"],
                    diff.changes.map((change) => [
                      change.event_id,
                      change.what,
                      change.before ?? "",
                      change.after ?? "",
                    ]),
                  )
            }`,
      ),
    );
  }
  const used = new Set<CriterionId>([
    ...report.capital_gains.lines.flatMap((line) => line.criteria),
    ...report.movable_capital.transmissions.flatMap((line) => line.criteria),
    ...report.doubtful.map((item) => item.criterion),
    ...report.settled.map((item) => item.criterion),
  ]);
  out.push(
    section(
      "Leyenda de criterios (docs/fiscal-questions.md)",
      table(
        ["criterio", "qué dice", "certeza", "riesgo"],
        CRITERION_IDS.filter((id) => used.has(id)).map((id) => [
          `${id}${isDoubtful(id) ? "*" : ""}`,
          CRITERION_LABELS[id],
          CERTAINTY[FISCAL_CRITERIA[id].certainty] as string,
          RISK[FISCAL_CRITERIA[id].risk] as string,
        ]),
      ),
    ),
  );
  return out.join("\n");
};

export const taxCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["lots", "boxes", ...GLOBAL_FLAGS]);
  const year = Number(positionals[1]);
  if (positionals[1] === undefined || !Number.isInteger(year)) {
    throw new UsageError(USAGE);
  }
  const { events } = await ctx.deps.store.load();
  const today = todayInMadrid(ctx.deps.clock);
  if (booleanFlag(flags, "boxes")) {
    const boxes = taxBoxes(events, year, { today });
    render(ctx, taxBoxesJson(boxes), renderBoxes(boxes));
    return 0;
  }
  const report = taxYear(events, year, { today });
  render(ctx, taxReportJson(report), renderTaxReport(report, booleanFlag(flags, "lots")));
  return 0;
};

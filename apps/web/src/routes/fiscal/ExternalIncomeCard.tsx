// The savings income from outside the portfolio (a bank's interest, the
// dividend of the user's own company), apart from the boxes Atlas lays out:
// the payer already reports it, so it is to be checked in Renta WEB, not typed
// again. It only feeds the estimate of the quota.

import { type JSX, Show } from "solid-js";
import {
  Amount,
  type DataColumn,
  DataTable,
  Notice,
  Section,
  StatLine,
} from "../../components/index.js";
import type { ExternalIncomeRow, ExternalIncomeView } from "../../view-models/fiscal/external.js";

const COLUMNS: DataColumn<ExternalIncomeRow>[] = [
  {
    key: "payer",
    header: "Pagador",
    card: "title",
    cell: (row) => row.payer ?? row.kind,
    hint: (row) => row.payer ?? row.kind,
  },
  { key: "kind", header: "Tipo", card: "sub", cell: (row) => `${row.kind} · ${row.date}` },
  {
    key: "withholding",
    header: "Retención",
    numeric: true,
    card: "meta",
    cell: (row) => (
      <>
        retención <Amount value={row.withholding_eur} />
      </>
    ),
  },
  {
    key: "gross",
    header: "Bruto",
    numeric: true,
    card: "figure",
    cell: (row) => <Amount value={row.gross_eur} />,
  },
];

export const ExternalIncomeCard = (props: {
  view: ExternalIncomeView | undefined;
}): JSX.Element => (
  <Show when={props.view}>
    {(view) => (
      <Section title="Rendimientos de fuera de la cartera" class="span-12">
        <Notice severity="info" title="Ya vienen en tus datos fiscales">
          Quien te los paga los comunica a Hacienda (con el modelo 193 los dividendos y con el 196
          los intereses de cuentas): compruébalos en Renta WEB. Atlas solo los usa para estimar la
          cuota; no están en las casillas de la cartera.
        </Notice>
        <DataTable
          label={`Rendimientos de fuera de la cartera de ${view().year}`}
          size="sm"
          rows={view().rows}
          columns={COLUMNS}
        />
        <StatLine label="Bruto">
          <Amount value={view().gross_eur} />
        </StatLine>
        <StatLine label="Retenciones">
          <Amount value={view().withholding_eur} />
        </StatLine>
      </Section>
    )}
  </Show>
);
